import type { Env, AuthUser } from "../types";
import { UserModel } from "../models/user";
import { CreditBalanceModel } from "../models/credit-balance";
import { CreditTransactionModel } from "../models/credit-transaction";
import { generateId } from "../utils/ulid";
import { signJwt } from "../middleware/auth";

// ---------------------------------------------------------------------------
// Kakao OAuth types
// ---------------------------------------------------------------------------

interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  refresh_token_expires_in?: number;
}

interface KakaoUserInfo {
  id: number;
  kakao_account?: {
    email?: string;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    profile?: {
      nickname?: string;
      thumbnail_image_url?: string;
      profile_image_url?: string;
    };
  };
  properties?: {
    nickname?: string;
    profile_image?: string;
    thumbnail_image?: string;
  };
}

// ---------------------------------------------------------------------------
// Kakao OAuth flow
// ---------------------------------------------------------------------------

/**
 * Build the Kakao OAuth authorization URL.
 */
export function getKakaoAuthUrl(env: Env): string {
  const params = new URLSearchParams({
    client_id: env.KAKAO_CLIENT_ID,
    redirect_uri: env.KAKAO_REDIRECT_URI,
    response_type: "code",
    scope: "profile_nickname,profile_image,account_email",
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for Kakao access token.
 */
export async function exchangeKakaoCode(env: Env, code: string): Promise<KakaoTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.KAKAO_CLIENT_ID,
    redirect_uri: env.KAKAO_REDIRECT_URI,
    code,
  });

  if (env.KAKAO_CLIENT_SECRET) {
    body.set("client_secret", env.KAKAO_CLIENT_SECRET);
  }

  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Kakao token exchange failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as KakaoTokenResponse;
}

/**
 * Fetch user profile from Kakao using the access token.
 */
export async function getKakaoUserInfo(accessToken: string): Promise<KakaoUserInfo> {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Kakao user info failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as KakaoUserInfo;
}

// ---------------------------------------------------------------------------
// User creation / lookup with trial credit grant
// ---------------------------------------------------------------------------

/**
 * Find or create a user from Kakao profile.
 * On signup: creates USER + CREDIT_BALANCE(100 trial) + CREDIT_TRANSACTION in one D1 batch.
 * Returns AuthUser + JWT token.
 */
export async function findOrCreateUser(
  db: D1Database,
  env: Env,
  kakaoInfo: KakaoUserInfo
): Promise<{ user: AuthUser; token: string; isNewUser: boolean }> {
  const kakaoId = String(kakaoInfo.id);
  const email = kakaoInfo.kakao_account?.email ?? null;
  const displayName =
    kakaoInfo.kakao_account?.profile?.nickname ??
    kakaoInfo.properties?.nickname ??
    "";
  const profileImageUrl =
    kakaoInfo.kakao_account?.profile?.profile_image_url ??
    kakaoInfo.properties?.profile_image ??
    null;

  // Check if user exists
  const existing = await UserModel.findByKakaoId(db, kakaoId);

  if (existing) {
    // Existing user -- issue JWT
    const authUser: AuthUser = {
      userId: existing.id,
      kakaoId: existing.kakao_id,
      email: existing.email,
      displayName: existing.display_name,
      role: existing.role,
    };

    const token = await signJwt(
      { sub: existing.id, kakaoId, email: existing.email ?? undefined, displayName: existing.display_name, role: existing.role },
      env.JWT_SECRET
    );

    return { user: authUser, token, isNewUser: false };
  }

  // New user -- atomic signup: USER + CREDIT_BALANCE + CREDIT_TRANSACTION
  // Prevent duplicate trial credits for the same email across different Kakao accounts
  let trialCredits = 100;
  if (email) {
    const existingByEmail = await UserModel.findByEmail(db, email);
    if (existingByEmail) {
      trialCredits = 0; // same email already used trial
    }
  }

  const userId = generateId();
  const txId = generateId();
  const now = new Date().toISOString();

  const statements = [
    db
      .prepare(
        `INSERT INTO user (id, kakao_id, email, display_name, profile_image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(userId, kakaoId, email, displayName, profileImageUrl, now, now),
    db
      .prepare(
        `INSERT INTO credit_balance (user_id, total_credits, used_credits, reserved_credits, updated_at)
         VALUES (?, ?, 0, 0, ?)`
      )
      .bind(userId, trialCredits, now),
  ];

  if (trialCredits > 0) {
    statements.push(
      db
        .prepare(
          `INSERT INTO credit_transaction (id, user_id, type, amount, balance_after, description, created_at)
           VALUES (?, ?, 'trial', ?, ?, ?, ?)`
        )
        .bind(txId, userId, trialCredits, trialCredits, "Trial credits on signup", now)
    );
  }

  await db.batch(statements);

  const authUser: AuthUser = {
    userId,
    kakaoId,
    email,
    displayName,
    role: "user",
  };

  const token = await signJwt(
    { sub: userId, kakaoId, email: email ?? undefined, displayName, role: "user" },
    env.JWT_SECRET
  );

  return { user: authUser, token, isNewUser: true };
}
