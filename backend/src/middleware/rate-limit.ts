import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";
import { AppError } from "./error-handler";

/**
 * Simple in-memory rate limiter using a Map.
 * In production with multiple Workers isolates, consider using
 * Durable Objects or Cloudflare Rate Limiting for distributed enforcement.
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(
  maxRequests?: number,
  windowSeconds?: number
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const limit = maxRequests ?? parseInt(c.env.RATE_LIMIT_MAX, 10);
    const window = windowSeconds ?? parseInt(c.env.RATE_LIMIT_WINDOW_SECONDS, 10);

    // Use CF-Connecting-IP or fall back to a generic key
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    const entry = requestCounts.get(key);
    if (!entry || now > entry.resetAt) {
      requestCounts.set(key, { count: 1, resetAt: now + window * 1000 });
    } else {
      entry.count++;
      if (entry.count > limit) {
        throw new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later.");
      }
    }

    await next();
  };
}
