import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import type { Env, AuthUser } from "./types";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { authMiddleware, adminMiddleware } from "./middleware/auth";
import { auth } from "./routes/auth";
import { credits } from "./routes/credits";
import { agents } from "./routes/agents";
import { webhooks } from "./routes/webhooks";
import { admin } from "./routes/admin";

export { CreditBalanceDO } from "./durable-objects/credit-balance";

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// Global middleware
app.use("*", requestId());
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", corsMiddleware());
app.use("*", errorHandler());
app.use("*", rateLimitMiddleware());

// Health check (no auth required)
app.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: c.env.ENVIRONMENT,
    },
  });
});

// Public routes (no auth required)
app.route("/api/auth", auth);
app.route("/api/webhooks", webhooks);

// Credit packages endpoint is public (readable without auth)
app.get("/api/credits/packages", async (c) => {
  // Forward to credits route handler
  const { CREDIT_PACKAGES } = await import("./utils/constants");
  return c.json({
    success: true,
    data: { packages: Object.values(CREDIT_PACKAGES) },
  });
});

// Protected routes (require authentication)
app.use("/api/credits/*", authMiddleware());
app.use("/api/agents/*", authMiddleware());
app.route("/api/credits", credits);
app.route("/api/agents", agents);

// Admin routes (require auth + admin role)
app.use("/api/admin/*", authMiddleware());
app.use("/api/admin/*", adminMiddleware());
app.route("/api/admin", admin);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message: `Route ${c.req.method} ${c.req.path} not found` },
    },
    404
  );
});

export default app;
