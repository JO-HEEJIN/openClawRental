import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import type { Env, AuthUser, UsageQueueMessage } from "./types";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { authMiddleware, adminMiddleware } from "./middleware/auth";
import { auth } from "./routes/auth";
import { credits } from "./routes/credits";
import { agents } from "./routes/agents";
import { webhooks } from "./routes/webhooks";
import { admin } from "./routes/admin";
import { proxy } from "./routes/proxy";

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
app.route("/api/v1/auth", auth);
app.route("/api/webhooks", webhooks);

// Credit packages endpoint is public (readable without auth)
app.get("/api/v1/credits/packages", async (c) => {
  const { CREDIT_PACKAGES } = await import("./utils/constants");
  return c.json({
    success: true,
    data: { packages: Object.values(CREDIT_PACKAGES) },
  });
});

// Protected routes (require authentication)
app.use("/api/v1/credits/*", authMiddleware());
app.use("/api/v1/agents/*", authMiddleware());
app.use("/api/v1/chat/*", authMiddleware());
app.route("/api/v1/credits", credits);
app.route("/api/v1/agents", agents);

// LLM Proxy (OpenAI-compatible endpoint)
// Mounted at /api so proxy's /v1/chat/completions becomes /api/v1/chat/completions
app.route("/api", proxy);

// Admin routes (require auth + admin role)
app.use("/api/v1/admin/*", authMiddleware());
app.use("/api/v1/admin/*", adminMiddleware());
app.route("/api/v1/admin", admin);

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

export default {
  fetch: app.fetch,

  // Cloudflare Queue consumer for usage log processing
  async queue(batch: MessageBatch<UsageQueueMessage>, env: Env): Promise<void> {
    const now = new Date().toISOString();
    const statements = batch.messages.map((msg) => {
      const log = msg.body;
      return env.DB.prepare(
        `INSERT INTO usage_log (id, agent_run_id, user_id, resource_type, resource_detail, quantity, credit_cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(log.id, log.agentRunId, log.userId, log.resourceType, log.resourceDetail, log.quantity, log.creditCost, log.createdAt || now);
    });

    if (statements.length > 0) {
      await env.DB.batch(statements);
    }
  },
};
