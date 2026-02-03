import { Hono } from "hono";
import type { Env, AuthUser, AgentConfigStatus, AgentRunStatus } from "../types";
import { AgentConfigModel } from "../models/agent-config";
import { AgentRunModel } from "../models/agent-run";
import { UsageLogModel } from "../models/usage-log";
import { AGENT_TEMPLATES, startAgentRun, cancelAgentRun } from "../services/agent";
import { AppError } from "../middleware/error-handler";
import { sanitizeString } from "../utils/validation";

const agents = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// GET /agents/templates - List available agent templates
agents.get("/templates", async (c) => {
  return c.json({
    success: true,
    data: {
      templates: AGENT_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        nameKo: t.nameKo,
        description: t.description,
        descriptionKo: t.descriptionKo,
        category: t.category,
        estimatedCreditsPerRun: t.estimatedCreditsPerRun,
        configSchema: t.configSchema,
      })),
    },
  });
});

// POST /agents/configs - Create agent configuration
agents.post("/configs", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    agentTemplateId: string;
    name: string;
    description?: string;
    configJson?: Record<string, unknown>;
  }>();

  if (!body.agentTemplateId || !body.name) {
    throw new AppError(400, "BAD_REQUEST", "agentTemplateId and name are required");
  }

  // Validate template exists
  const template = AGENT_TEMPLATES.find((t) => t.id === body.agentTemplateId);
  if (!template) {
    throw new AppError(400, "INVALID_TEMPLATE", "Agent template not found");
  }

  const config = await AgentConfigModel.create(c.env.DB, {
    userId: user.userId,
    agentTemplateId: body.agentTemplateId,
    name: sanitizeString(body.name, 100),
    description: body.description ? sanitizeString(body.description, 500) : undefined,
    configJson: body.configJson ? JSON.stringify(body.configJson) : undefined,
    estimatedCreditsPerRun: template.estimatedCreditsPerRun,
  });

  return c.json({
    success: true,
    data: {
      config: {
        id: config.id,
        agentTemplateId: config.agent_template_id,
        name: config.name,
        description: config.description,
        configJson: JSON.parse(config.config_json),
        status: config.status,
        estimatedCreditsPerRun: config.estimated_credits_per_run,
        createdAt: config.created_at,
      },
    },
  }, 201);
});

// GET /agents/configs - List user's agent configs
agents.get("/configs", async (c) => {
  const user = c.get("user");
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  const status = url.searchParams.get("status") as AgentConfigStatus | null;

  const configs = await AgentConfigModel.listByUserId(c.env.DB, user.userId, {
    limit,
    offset,
    status: status ?? undefined,
  });

  return c.json({
    success: true,
    data: {
      configs: configs.map((cfg) => ({
        id: cfg.id,
        agentTemplateId: cfg.agent_template_id,
        name: cfg.name,
        description: cfg.description,
        status: cfg.status,
        estimatedCreditsPerRun: cfg.estimated_credits_per_run,
        createdAt: cfg.created_at,
        updatedAt: cfg.updated_at,
      })),
    },
  });
});

// GET /agents/configs/:id - Get agent config detail
agents.get("/configs/:id", async (c) => {
  const user = c.get("user");
  const configId = c.req.param("id");
  const config = await AgentConfigModel.findById(c.env.DB, configId);

  if (!config) {
    throw new AppError(404, "CONFIG_NOT_FOUND", "Agent configuration not found");
  }
  if (config.user_id !== user.userId) {
    throw new AppError(403, "FORBIDDEN", "Agent configuration does not belong to this user");
  }

  const template = AGENT_TEMPLATES.find((t) => t.id === config.agent_template_id);

  return c.json({
    success: true,
    data: {
      config: {
        id: config.id,
        agentTemplateId: config.agent_template_id,
        templateName: template?.nameKo ?? config.agent_template_id,
        name: config.name,
        description: config.description,
        configJson: JSON.parse(config.config_json),
        status: config.status,
        estimatedCreditsPerRun: config.estimated_credits_per_run,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      },
    },
  });
});

// PUT /agents/configs/:id - Update agent config
agents.put("/configs/:id", async (c) => {
  const user = c.get("user");
  const configId = c.req.param("id");
  const config = await AgentConfigModel.findById(c.env.DB, configId);

  if (!config) {
    throw new AppError(404, "CONFIG_NOT_FOUND", "Agent configuration not found");
  }
  if (config.user_id !== user.userId) {
    throw new AppError(403, "FORBIDDEN", "Agent configuration does not belong to this user");
  }

  const body = await c.req.json<{
    name?: string;
    description?: string;
    configJson?: Record<string, unknown>;
    status?: AgentConfigStatus;
  }>();

  await AgentConfigModel.update(c.env.DB, configId, {
    name: body.name ? sanitizeString(body.name, 100) : undefined,
    description: body.description !== undefined ? sanitizeString(body.description, 500) : undefined,
    configJson: body.configJson ? JSON.stringify(body.configJson) : undefined,
    status: body.status,
  });

  const updated = await AgentConfigModel.findById(c.env.DB, configId);
  return c.json({
    success: true,
    data: {
      config: {
        id: updated!.id,
        agentTemplateId: updated!.agent_template_id,
        name: updated!.name,
        description: updated!.description,
        configJson: JSON.parse(updated!.config_json),
        status: updated!.status,
        estimatedCreditsPerRun: updated!.estimated_credits_per_run,
        updatedAt: updated!.updated_at,
      },
    },
  });
});

// DELETE /agents/configs/:id - Archive agent config (soft delete)
agents.delete("/configs/:id", async (c) => {
  const user = c.get("user");
  const configId = c.req.param("id");
  const config = await AgentConfigModel.findById(c.env.DB, configId);

  if (!config) {
    throw new AppError(404, "CONFIG_NOT_FOUND", "Agent configuration not found");
  }
  if (config.user_id !== user.userId) {
    throw new AppError(403, "FORBIDDEN", "Agent configuration does not belong to this user");
  }

  await AgentConfigModel.update(c.env.DB, configId, { status: "archived" });
  return c.json({ success: true, data: { message: "Agent configuration archived" } });
});

// POST /agents/runs - Start an agent run
agents.post("/runs", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    agentConfigId: string;
    input?: Record<string, unknown>;
  }>();

  if (!body.agentConfigId) {
    throw new AppError(400, "BAD_REQUEST", "agentConfigId is required");
  }

  const result = await startAgentRun(
    c.env,
    user.userId,
    body.agentConfigId,
    JSON.stringify(body.input ?? {})
  );

  return c.json({
    success: true,
    data: {
      runId: result.runId,
      creditsReserved: result.creditsReserved,
      status: "running",
    },
  }, 201);
});

// GET /agents/runs - List user's agent runs
agents.get("/runs", async (c) => {
  const user = c.get("user");
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  const status = url.searchParams.get("status") as AgentRunStatus | null;

  const result = await AgentRunModel.listByUserId(c.env.DB, user.userId, {
    limit,
    offset,
    status: status ?? undefined,
  });

  return c.json({
    success: true,
    data: {
      runs: result.results.map((run) => ({
        id: run.id,
        agentConfigId: run.agent_config_id,
        status: run.status,
        creditsReserved: run.credits_reserved,
        creditsActual: run.credits_actual,
        durationMs: run.duration_ms,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        createdAt: run.created_at,
      })),
      total: result.total,
      limit,
      offset,
    },
  });
});

// GET /agents/runs/:id - Get agent run detail with usage logs
agents.get("/runs/:id", async (c) => {
  const user = c.get("user");
  const runId = c.req.param("id");
  const run = await AgentRunModel.findById(c.env.DB, runId);

  if (!run) {
    throw new AppError(404, "RUN_NOT_FOUND", "Agent run not found");
  }
  if (run.user_id !== user.userId) {
    throw new AppError(403, "FORBIDDEN", "Agent run does not belong to this user");
  }

  const usageLogs = await UsageLogModel.listByRunId(c.env.DB, runId);

  return c.json({
    success: true,
    data: {
      run: {
        id: run.id,
        agentConfigId: run.agent_config_id,
        status: run.status,
        creditsReserved: run.credits_reserved,
        creditsActual: run.credits_actual,
        inputJson: JSON.parse(run.input_json),
        outputJson: run.output_json ? JSON.parse(run.output_json) : null,
        errorMessage: run.error_message,
        durationMs: run.duration_ms,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        createdAt: run.created_at,
      },
      usageLogs: usageLogs.map((log) => ({
        id: log.id,
        resourceType: log.resource_type,
        resourceDetail: log.resource_detail,
        quantity: log.quantity,
        creditCost: log.credit_cost,
        createdAt: log.created_at,
      })),
    },
  });
});

// POST /agents/runs/:id/cancel - Cancel an agent run
agents.post("/runs/:id/cancel", async (c) => {
  const user = c.get("user");
  const runId = c.req.param("id");

  await cancelAgentRun(c.env, user.userId, runId);

  return c.json({
    success: true,
    data: { message: "Agent run cancelled", runId },
  });
});

export { agents };
