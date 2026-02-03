import { generateId } from "../utils/ulid";
import type { AgentRunStatus } from "../types";

export interface AgentRunRow {
  id: string;
  agent_config_id: string;
  user_id: string;
  status: AgentRunStatus;
  credits_reserved: number;
  credits_actual: number | null;
  input_json: string;
  output_json: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export const AgentRunModel = {
  async findById(db: D1Database, id: string): Promise<AgentRunRow | null> {
    return db.prepare("SELECT * FROM agent_run WHERE id = ?").bind(id).first<AgentRunRow>();
  },

  async create(
    db: D1Database,
    data: {
      agentConfigId: string;
      userId: string;
      creditsReserved: number;
      inputJson: string;
    }
  ): Promise<AgentRunRow> {
    const id = generateId();
    await db
      .prepare(
        `INSERT INTO agent_run (id, agent_config_id, user_id, credits_reserved, input_json, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(id, data.agentConfigId, data.userId, data.creditsReserved, data.inputJson)
      .run();
    return (await AgentRunModel.findById(db, id))!;
  },

  async updateStatus(
    db: D1Database,
    id: string,
    data: {
      status: AgentRunStatus;
      creditsActual?: number;
      outputJson?: string;
      errorMessage?: string;
      durationMs?: number;
      startedAt?: string;
      completedAt?: string;
    }
  ): Promise<void> {
    const sets = ["status = ?"];
    const values: unknown[] = [data.status];
    if (data.creditsActual !== undefined) { sets.push("credits_actual = ?"); values.push(data.creditsActual); }
    if (data.outputJson !== undefined) { sets.push("output_json = ?"); values.push(data.outputJson); }
    if (data.errorMessage !== undefined) { sets.push("error_message = ?"); values.push(data.errorMessage); }
    if (data.durationMs !== undefined) { sets.push("duration_ms = ?"); values.push(data.durationMs); }
    if (data.startedAt !== undefined) { sets.push("started_at = ?"); values.push(data.startedAt); }
    if (data.completedAt !== undefined) { sets.push("completed_at = ?"); values.push(data.completedAt); }
    values.push(id);
    await db.prepare(`UPDATE agent_run SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  },

  async listByUserId(
    db: D1Database,
    userId: string,
    opts: { limit?: number; offset?: number; status?: AgentRunStatus } = {}
  ): Promise<{ results: AgentRunRow[]; total: number }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    let where = "WHERE user_id = ?";
    const binds: unknown[] = [userId];
    if (opts.status) {
      where += " AND status = ?";
      binds.push(opts.status);
    }
    const countResult = await db
      .prepare(`SELECT COUNT(*) as cnt FROM agent_run ${where}`)
      .bind(...binds)
      .first<{ cnt: number }>();
    const results = await db
      .prepare(`SELECT * FROM agent_run ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all<AgentRunRow>();
    return { results: results.results, total: countResult?.cnt ?? 0 };
  },
};
