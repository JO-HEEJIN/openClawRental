/**
 * OpenClaw Agent Runtime - Main Entry Point.
 *
 * Cloudflare Worker that serves as the agent execution runtime.
 * Receives agent run requests from the backend API and orchestrates execution
 * with progress streaming via SSE.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AgentEnv, AgentInput, AgentRun, UsageLog } from './framework/types';
import { agentRegistry } from './framework/registry';
import { AgentLifecycleManager } from './framework/lifecycle';
import { CloudflareAIGateway } from './gateway/ai-gateway';
import { registerAllAgents } from './agents';
import { buildSandboxConfig } from './sandbox/config';

// Register all agents on module load
registerAllAgents();

type Bindings = AgentEnv;

const app = new Hono<{ Bindings: Bindings }>();

// ---- Middleware ----

app.use('*', cors({
  origin: ['https://openclaw.kr', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
}));

// ---- Routes ----

/** List all available agents */
app.get('/agents', (c) => {
  const agents = agentRegistry.listMeta();
  return c.json({ agents });
});

/** Get agent metadata by id */
app.get('/agents/:id', (c) => {
  const id = c.req.param('id');
  if (!agentRegistry.has(id)) {
    return c.json({ error: `Agent "${id}" not found` }, 404);
  }
  const agent = agentRegistry.get(id);
  return c.json({ agent: agent.meta });
});

/** Execute an agent run with SSE progress streaming */
app.post('/agents/:id/run', async (c) => {
  const agentId = c.req.param('id');
  if (!agentRegistry.has(agentId)) {
    return c.json({ error: `Agent "${agentId}" not found` }, 404);
  }

  const body = await c.req.json<{
    runId: string;
    userId: string;
    config: Record<string, unknown>;
    params: Record<string, unknown>;
  }>();

  const input: AgentInput = {
    runId: body.runId,
    userId: body.userId,
    config: body.config,
    params: body.params,
  };

  const agent = agentRegistry.get(agentId);

  // Validate input
  const validation = agent.validate(input);
  if (!validation.valid) {
    return c.json({ error: 'Validation failed', details: validation.errors }, 400);
  }

  // SSE response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const sendSSE = (event: string, data: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(message));
  };

  // Run agent in background
  const env = c.env;
  const aiGateway = new CloudflareAIGateway(env);
  const storage = env.AGENT_STORAGE;

  const lifecycle = new AgentLifecycleManager(agent, env, {
    onProgress: (event) => sendSSE('progress', event),
    reserveCredits: async (userId: string, amount: number) => {
      // Call backend credit reservation endpoint
      // In production this goes through a Durable Object
      try {
        // Internal service binding call to backend
        return true; // Placeholder - backend integration point
      } catch {
        return false;
      }
    },
    settleCredits: async (userId: string, reserved: number, actual: number) => {
      // Call backend credit settlement endpoint
      // Placeholder - backend integration point
    },
    persistRun: async (run: AgentRun) => {
      // Persist to D1 via backend service binding
      // Placeholder - backend integration point
    },
    persistUsage: async (logs: UsageLog[]) => {
      // Persist usage logs to D1
      // Placeholder - backend integration point
    },
  });

  // Execute and stream results
  c.executionCtx.waitUntil(
    lifecycle
      .run(input, aiGateway, storage)
      .then((run) => {
        sendSSE('complete', {
          runId: run.id,
          status: run.status,
          output: run.output,
          creditsUsed: run.creditsActual,
          durationMs: run.durationMs,
        });
      })
      .catch((error) => {
        sendSSE('error', {
          runId: input.runId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      })
      .finally(() => {
        writer.close();
      }),
  );

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

/** Health check */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    agents: agentRegistry.list().length,
    version: '0.1.0',
  });
});

export default app;
