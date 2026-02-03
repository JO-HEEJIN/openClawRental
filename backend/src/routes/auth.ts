import { Hono } from "hono";
import type { Env, AuthUser } from "../types";
import { authMiddleware } from "../middleware/auth";
import { UserModel } from "../models/user";
import { CreditBalanceModel } from "../models/credit-balance";
import { ConsentRecordModel } from "../models/consent-record";
import { AppError } from "../middleware/error-handler";

const auth = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// GET /auth/kakao - Redirect to Kakao OAuth via Clerk
// Clerk handles Kakao OAuth as a social connection provider.
// The frontend initiates this via Clerk's SDK, so this endpoint
// provides the Clerk OAuth URL for the frontend to redirect to.
auth.get("/kakao", async (c) => {
  const publishableKey = c.env.CLERK_PUBLISHABLE_KEY;
  // Extract Clerk frontend API domain from publishable key
  // Format: pk_test_xxx or pk_live_xxx
  // The frontend should use Clerk's signIn.authenticateWithRedirect() instead
  // This endpoint is provided as a convenience for direct linking
  return c.json({
    success: true,
    data: {
      provider: "oauth_kakao",
      message: "Use Clerk SDK signIn.authenticateWithRedirect({ strategy: 'oauth_kakao' }) on the frontend",
    },
  });
});

// GET /auth/kakao/callback - Handle Kakao OAuth callback
// Clerk handles the actual callback. This endpoint is called by the frontend
// after Clerk processes the OAuth callback and issues a session token.
auth.get("/kakao/callback", async (c) => {
  // Clerk manages the OAuth flow. After Clerk processes the callback,
  // the frontend gets a session token automatically.
  // This endpoint is a no-op since Clerk handles it.
  return c.json({
    success: true,
    data: {
      message: "Clerk handles OAuth callback. Frontend receives session token automatically.",
    },
  });
});

// POST /auth/logout - Logout (invalidate session on client side)
// Clerk sessions are managed client-side; the backend just acknowledges.
auth.post("/logout", authMiddleware(), async (c) => {
  // Clerk JWT sessions are stateless. The frontend should:
  // 1. Call clerk.signOut()
  // 2. Clear the session token
  // Backend has no session state to invalidate.
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

export { auth };
