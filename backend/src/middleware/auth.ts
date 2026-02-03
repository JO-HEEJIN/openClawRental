import type { MiddlewareHandler } from "hono";
import type { Env, AuthUser } from "../types";
import { AppError } from "./error-handler";

/**
 * JWT validation middleware for Kakao OAuth sessions.
 * Validates the Bearer token from Authorization header.
 * Sets c.set("user", authUser) on success.
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
      const payload = await verifyJwt(token, c.env.JWT_SECRET);

      const user: AuthUser = {
        userId: payload.sub,
        kakaoId: payload.kakaoId,
        email: payload.email ?? null,
        displayName: payload.displayName,
        role: payload.role ?? "user",
      };

      c.set("user", user);
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Invalid or expired token");
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

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

interface JwtPayload {
  sub: string;
  kakaoId: string;
  email?: string;
  displayName: string;
  role: "user" | "admin";
  iat: number;
  exp: number;
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  expiresInSeconds = 86400
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encoder = new TextEncoder();
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${header}.${body}`;

  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [header, body, sig] = parts;
  const signingInput = `${header}.${body}`;

  const key = await getSigningKey(secret);
  const encoder = new TextEncoder();
  const sigBytes = base64UrlDecode(sig);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as ArrayBufferView,
    encoder.encode(signingInput)
  );

  if (!valid) {
    throw new Error("Invalid JWT signature");
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as JwtPayload;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("JWT expired");
  }

  return payload;
}
