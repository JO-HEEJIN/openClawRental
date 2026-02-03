// Queue consumer for USAGE_QUEUE.
// Batch inserts usage log records into D1.

import { generateId } from "../utils/ulid";

export interface UsageLogMessage {
  userId: string;
  agentRunId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  creditCost: number;
  timestamp: string;
}

export async function handleUsageQueue(
  batch: MessageBatch<UsageLogMessage>,
  env: { DB: D1Database }
): Promise<void> {
  const messages = batch.messages;
  if (messages.length === 0) return;

  const statements: D1PreparedStatement[] = [];

  for (const msg of messages) {
    const data = msg.body;
    const id = generateId();

    // If no agentRunId, this is a direct proxy call -- use a synthetic run ID
    const agentRunId = data.agentRunId ?? `proxy_${id}`;

    statements.push(
      env.DB
        .prepare(
          `INSERT OR IGNORE INTO usage_log (id, agent_run_id, user_id, resource_type, resource_detail, quantity, credit_cost, created_at)
           VALUES (?, ?, ?, 'llm_call', ?, ?, ?, ?)`
        )
        .bind(
          id,
          agentRunId,
          data.userId,
          data.model,
          data.inputTokens + data.outputTokens, // total tokens as quantity
          data.creditCost,
          data.timestamp
        )
    );
  }

  // D1 batch insert (up to 50 per batch as configured in wrangler.toml)
  try {
    await env.DB.batch(statements);
    // Ack all messages on success
    for (const msg of messages) {
      msg.ack();
    }
  } catch (err) {
    console.error("Usage queue batch insert failed:", err);
    // Retry all messages
    for (const msg of messages) {
      msg.retry();
    }
  }
}
