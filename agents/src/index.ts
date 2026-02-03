import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AgentEnv, AgentInput } from './framework/types';
import { agentRegistry } from './framework/registry';
import { AgentLifecycleManager } from './framework/lifecycle';
import { CloudflareAIGateway } from './gateway/ai-gateway';
import { registerAllAgents } from './agents';

registerAllAgents();

type Bindings = AgentEnv;
const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({ origin: ['https://openclaw.kr', 'http://localhost:3000'], allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id'] }));

app.get('/agents', (c) => c.json({ agents: agentRegistry.listMeta() }));

app.get('/agents/:id', (c) => {
  const id = c.req.param('id');
  if (!agentRegistry.has(id)) return c.json({ error: `Agent "${id}" not found` }, 404);
  return c.json({ agent: agentRegistry.get(id).meta });
});

app.post('/agents/:id/run', async (c) => {
  const agentId = c.req.param('id');
  if (!agentRegistry.has(agentId)) return c.json({ error: `Agent "${agentId}" not found` }, 404);
  const body = await c.req.json<{ runId: string; userId: string; config: Record<string, unknown>; params: Record<string, unknown> }>();
  const input: AgentInput = { runId: body.runId, userId: body.userId, config: body.config, params: body.params };
  const agent = agentRegistry.get(agentId);
  const validation = agent.validate(input);
  if (!validation.valid) return c.json({ error: 'Validation failed', details: validation.errors }, 400);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const sendSSE = (event: string, data: unknown) => { writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };

  const lifecycle = new AgentLifecycleManager(agent, c.env, {
    onProgress: (e) => sendSSE('progress', e),
    reserveCredits: async () => true,
    settleCredits: async () => {},
    persistRun: async () => {},
    persistUsage: async () => {},
  });

  c.executionCtx.waitUntil(
    lifecycle.run(input, new CloudflareAIGateway(c.env), c.env.AGENT_STORAGE)
      .then((run) => sendSSE('complete', { runId: run.id, status: run.status, output: run.output, creditsUsed: run.creditsActual, durationMs: run.durationMs }))
      .catch((error) => sendSSE('error', { runId: input.runId, error: error instanceof Error ? error.message : 'Unknown error' }))
      .finally(() => writer.close()),
  );

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
});

app.get('/health', (c) => c.json({ status: 'ok', agents: agentRegistry.list().length, version: '0.1.0' }));

export default app;
