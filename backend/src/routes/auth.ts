import { Hono } from "hono";
import type { Env, AuthUser } from "../types";
import { authMiddleware } from "../middleware/auth";
import { UserModel } from "../models/user";
import { CreditBalanceModel } from "../models/credit-balance";
import { ConsentRecordModel } from "../models/consent-record";
import { AppError } from "../middleware/error-handler";
import {
  getKakaoAuthUrl,
  exchangeKakaoCode,
  getKakaoUserInfo,
  findOrCreateUser,
} from "../services/auth";

const auth = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// GET /auth/kakao - Redirect to Kakao OAuth authorization
auth.get("/kakao", async (c) => {
  const url = getKakaoAuthUrl(c.env);
  return c.redirect(url);
});

// GET /auth/kakao/callback - Handle Kakao OAuth callback
auth.get("/kakao/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    throw new AppError(400, "OAUTH_ERROR", `Kakao OAuth error: ${c.req.query("error_description") ?? error}`);
  }

  if (!code) {
    throw new AppError(400, "MISSING_CODE", "Authorization code is required");
  }

  // Exchange code for token
  const tokenResponse = await exchangeKakaoCode(c.env, code);

  // Fetch user info from Kakao
  const kakaoUser = await getKakaoUserInfo(tokenResponse.access_token);

  // Find or create user in D1 (with trial credits for new users)
  const { user, token, isNewUser } = await findOrCreateUser(c.env.DB, c.env, kakaoUser);

  return c.json({
    success: true,
    data: {
      token,
      user: {
        id: user.userId,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
      },
      isNewUser,
    },
  });
});

// POST /auth/logout - Logout
// JWT sessions are stateless; the frontend should discard the token.
auth.post("/logout", authMiddleware(), async (c) => {
  return c.json({
    success: true,
    data: { message: "Logged out successfully" },
  });
});

// GET /auth/me - Get current authenticated user info
auth.get("/me", authMiddleware(), async (c) => {
  const authUser = c.get("user");
  const userRow = await UserModel.findById(c.env.DB, authUser.userId);
  if (!userRow) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const balance = await CreditBalanceModel.findByUserId(c.env.DB, authUser.userId);
  const consents = await ConsentRecordModel.listByUserId(c.env.DB, authUser.userId);

  // Build latest consent status
  const consentStatus: Record<string, boolean> = {};
  for (const consent of consents) {
    if (!(consent.consent_type in consentStatus)) {
      consentStatus[consent.consent_type] = consent.granted === 1;
    }
  }

  return c.json({
    success: true,
    data: {
      user: {
        id: userRow.id,
        email: userRow.email,
        displayName: userRow.display_name,
        profileImageUrl: userRow.profile_image_url,
        role: userRow.role,
        locale: userRow.locale,
        timezone: userRow.timezone,
        isActive: userRow.is_active === 1,
        createdAt: userRow.created_at,
      },
      credits: balance
        ? {
            totalCredits: balance.total_credits,
            usedCredits: balance.used_credits,
            reservedCredits: balance.reserved_credits,
            availableCredits: balance.available_credits,
          }
        : null,
      consents: consentStatus,
    },
  });
});

// POST /auth/consent - Record user consent
auth.post("/consent", authMiddleware(), async (c) => {
  const authUser = c.get("user");
  const body = await c.req.json<{
    consentType: "terms_of_service" | "privacy_policy" | "marketing";
    consentVersion: string;
    granted: boolean;
  }>();

  if (!body.consentType || !body.consentVersion || typeof body.granted !== "boolean") {
    throw new AppError(400, "BAD_REQUEST", "consentType, consentVersion, and granted are required");
  }

  const ipAddress = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  await ConsentRecordModel.create(c.env.DB, {
    userId: authUser.userId,
    consentType: body.consentType,
    consentVersion: body.consentVersion,
    granted: body.granted,
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return c.json({
    success: true,
    data: { message: "Consent recorded" },
  });
});

// POST /auth/profile - Update user profile
auth.post("/profile", authMiddleware(), async (c) => {
  const authUser = c.get("user");
  const body = await c.req.json<{
    displayName?: string;
  }>();

  if (!body.displayName) {
    throw new AppError(400, "BAD_REQUEST", "displayName is required");
  }

  await UserModel.update(c.env.DB, authUser.userId, {
    displayName: body.displayName,
  });

  return c.json({
    success: true,
    data: { message: "Profile updated" },
  });
});

export { auth };
