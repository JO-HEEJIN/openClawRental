import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../types";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    try {
      await next();
    } catch (err) {
      if (err instanceof AppError) {
        return c.json(
          {
            success: false,
            error: { code: err.code, message: err.message },
          },
          err.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500
        );
      }

      console.error("Unhandled error:", err);
      return c.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        },
        500
      );
    }
  };
}
