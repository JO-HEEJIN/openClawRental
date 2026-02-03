import type { MiddlewareHandler } from "hono";
import type { Env, AuthUser } from "../types";
import { AppError } from "./error-handler";
import { verifyClerkToken, getOrCreateUser } from "../services/auth";

/**
 * Clerk JWT validation middleware.
 * Validates the Bearer token from Authorization header against Clerk's JWKS.
 * On success, looks up or creates user in D1 and sets c.set("user", authUser).
 */
export function authMiddleware(): MiddlewareHandler<{
  Bindings: Env;
  Variables: { user: AuthUser };
}> {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "UNAUTHORIZED", "Missing or invalid authorization header");
    }

    const token = authHeader.slice(7);
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Missing token");
    }

    try {
      const clerkPayload = await verifyClerkToken(token, c.env);
      const user = await getOrCreateUser(c.env.DB, clerkPayload);

      if (!user) {
        throw new AppError(401, "UNAUTHORIZED", "User not found");
      }

      c.set("user", user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token verification failed";
      throw new AppError(401, "UNAUTHORIZED", message);
    }

    await next();
  };
}

/**
 * Admin-only middleware. Must be used after authMiddleware.
 */
export function adminMiddleware(): MiddlewareHandler<{
  Bindings: Env;
  Variables: { user: AuthUser };
}> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user || user.role !== "admin") {
      throw new AppError(403, "FORBIDDEN", "Admin access required");
    }
    await next();
  };
}
