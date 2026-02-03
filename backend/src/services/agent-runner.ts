/**
 * Agent Runner Service.
 *
 * Executes agents as regular async functions within the main Worker.
 * Integrates the agent framework with the billing engine and D1 persistence.
 *
 * Flow:
 * 1. Reserve credits (D1 transaction)
 * 2. Execute agent with BillingAIGateway
 * 3. Settle credits (actual vs reserved)
 * 4. Persist run + usage logs to D1
 */

import type { Env, UsageQueueMessage } from "../types";
import type {
  AgentInput,
  AgentRun,
  ProgressEvent,
  UsageLog,
  AgentEnv,
} from "../agents/framework/types";
import { agentRegistry } from "../agents/framework/registry";
import { AgentLifecycleManager } from "../agents/framework/lifecycle";
import { BillingAIGateway } from "../agents/gateway/billing-gateway";
import { registerAllAgents } from "../agents/agents";
import { reserveCredits, settleCredits } from "./credit";
import { generateId } from "../utils/ulid";

// Ensure agents are registered
let agentsRegistered = false;
function ensureAgentsRegistered() {
  if (!agentsRegistered) {
    registerAllAgents();
    agentsRegistered = true;
  }
}

/** Map backend Env to the AgentEnv the framework expects */
function toAgentEnv(env: Env): AgentEnv {
  return {
    AI_GATEWAY: null as unknown as Fetcher,
    AGENT_STORAGE: env.STORAGE,
    DB: env.DB,
    YOUTUBE_API_KEY: "",
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    GOOGLE_AI_API_KEY: "",
    INSTAGRAM_ACCESS_TOKEN: "",
  };
}

export interface AgentRunRequest {
  agentId: string;
  userId: string;
  config: Record<string, unknown>;
  params: Record<string, unknown>;
}

export interface AgentRunResult {
  run: AgentRun;
  stream: ReadableStream;
}

/**
 * Execute an agent run with SSE progress streaming.
 * Returns a ReadableStream of SSE events + the final AgentRun record.
 */
export function executeAgentRun(
  env: Env,
  request: AgentRunRequest
): AgentRunResult {
  ensureAgentsRegistered();

  const agent = agentRegistry.get(request.agentId);
  const runId = generateId();
  const agentEnv = toAgentEnv(env);

  const input: AgentInput = {
    runId,
    userId: request.userId,
    config: { ...request.config, agentConfigId: request.config.agentConfigId ?? "" },
    params: request.params,
  };

  // Validate first (synchronous, throw early)
  const validation = agent.validate(input);
  if (!validation.valid) {
    const errorStream = createErrorStream(runId, `Validation failed: ${validation.errors.map(e => e.message).join(", ")}`);
    return {
      run: {
        id: runId,
        agentConfigId: (request.config.agentConfigId as string) ?? "",
        userId: request.userId,
        status: "failed",
        creditsReserved: 0,
        creditsActual: 0,
        input,
        output: null,
        errorMessage: `Validation failed: ${validation.errors.map(e => e.message).join(", ")}`,
        durationMs: 0,
        startedAt: null,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      stream: errorStream,
    };
  }

  // Set up SSE streaming
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const sendSSE = (event: string, data: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(message)).catch(() => {});
  };

  const billingGateway = new BillingAIGateway(agentEnv);

  // Build lifecycle with real D1 callbacks
  const lifecycle = new AgentLifecycleManager(agent, agentEnv, {
    onProgress: (event: ProgressEvent) => sendSSE("progress", event),

    reserveCredits: async (userId: string, amount: number) => {
      try {
        await reserveCredits(env.DB, userId, amount, runId);
        return true;
      } catch {
        return false;
      }
    },

    settleCredits: async (userId: string, reserved: number, actual: number) => {
      await settleCredits(env.DB, userId, reserved, actual, runId);
    },

    persistRun: async (run: AgentRun) => {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO agent_run (id, agent_config_id, user_id, status, credits_reserved, credits_actual, input_json, output_json, error_message, duration_ms, started_at, completed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          run.id,
          run.agentConfigId,
          run.userId,
          run.status,
          run.creditsReserved,
          run.creditsActual,
          JSON.stringify(run.input),
          run.output ? JSON.stringify(run.output) : null,
          run.errorMessage,
          run.durationMs,
          run.startedAt,
          run.completedAt,
          run.createdAt
        )
        .run();
    },

    persistUsage: async (logs: UsageLog[]) => {
      if (logs.length === 0) return;

      // Also enqueue to USAGE_QUEUE for async processing
      const queueMessages: UsageQueueMessage[] = logs.map((log) => ({
        id: log.id,
        agentRunId: log.agentRunId,
        userId: log.userId,
        resourceType: log.resourceType,
        resourceDetail: log.resourceDetail,
        quantity: log.quantity,
        creditCost: log.creditCost,
        createdAt: log.createdAt,
      }));

      for (const msg of queueMessages) {
        try {
          await env.USAGE_QUEUE.send(msg);
        } catch (err) {
          console.error("Failed to enqueue usage log:", err);
        }
      }
    },
  });

  // Placeholder for the final run result
  let finalRun: AgentRun | null = null;

  // Execute in background (stream is returned immediately)
  const executionPromise = lifecycle
    .run(input, billingGateway, env.STORAGE)
    .then((run) => {
      finalRun = run;
      sendSSE("complete", {
        runId: run.id,
        status: run.status,
        output: run.output,
        creditsUsed: run.creditsActual,
        durationMs: run.durationMs,
      });
    })
    .catch((error) => {
      sendSSE("error", {
        runId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    })
    .finally(() => {
      writer.close().catch(() => {});
    });

  return {
    run: {
      id: runId,
      agentConfigId: (request.config.agentConfigId as string) ?? "",
      userId: request.userId,
      status: "running",
      creditsReserved: agent.meta.estimatedCredits.max,
      creditsActual: null,
      input,
      output: null,
      errorMessage: null,
      durationMs: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      createdAt: new Date().toISOString(),
    },
    stream: readable,
  };
}

function createErrorStream(runId: string, error: string): ReadableStream {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const message = `event: error\ndata: ${JSON.stringify({ runId, error })}\n\n`;
  writer.write(encoder.encode(message)).then(() => writer.close());
  return readable;
}

/** List available agents */
export function listAgents() {
  ensureAgentsRegistered();
  return agentRegistry.listMeta();
}

/** Get agent metadata */
export function getAgent(agentId: string) {
  ensureAgentsRegistered();
  if (!agentRegistry.has(agentId)) return null;
  return agentRegistry.get(agentId).meta;
}
