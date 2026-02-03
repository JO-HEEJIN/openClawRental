import { generateId } from "../utils/ulid";
import type { AgentConfigStatus } from "../types";

export interface AgentConfigRow {
  id: string;
  user_id: string;
  agent_template_id: string;
  name: string;
  description: string;
  config_json: string;
  status: AgentConfigStatus;
  estimated_credits_per_run: number;
  created_at: string;
  updated_at: string;
}

export const AgentConfigModel = {
  async findById(db: D1Database, id: string): Promise<AgentConfigRow | null> {
    return db.prepare("SELECT * FROM agent_config WHERE id = ?").bind(id).first<AgentConfigRow>();
  },

  async create(
    db: D1Database,
    data: {
      userId: string;
      agentTemplateId: string;
      name: string;
      description?: string;
      configJson?: string;
      estimatedCreditsPerRun?: number;
    }
  ): Promise<AgentConfigRow> {
    const id = generateId();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO agent_config (id, user_id, agent_template_id, name, description, config_json, estimated_credits_per_run, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        data.userId,
        data.agentTemplateId,
        data.name,
        data.description ?? "",
        data.configJson ?? "{}",
        data.estimatedCreditsPerRun ?? 0,
        now,
        now
      )
      .run();
    return (await AgentConfigModel.findById(db, id))!;
  },

  async update(
    db: D1Database,
    id: string,
    data: Partial<{ name: string; description: string; configJson: string; status: AgentConfigStatus; estimatedCreditsPerRun: number }>
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { sets.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { sets.push("description = ?"); values.push(data.description); }
    if (data.configJson !== undefined) { sets.push("config_json = ?"); values.push(data.configJson); }
    if (data.status !== undefined) { sets.push("status = ?"); values.push(data.status); }
    if (data.estimatedCreditsPerRun !== undefined) { sets.push("estimated_credits_per_run = ?"); values.push(data.estimatedCreditsPerRun); }
    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now')");
    values.push(id);
    await db.prepare(`UPDATE agent_config SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  },

  async listByUserId(
    db: D1Database,
    userId: string,
    opts: { limit?: number; offset?: number; status?: AgentConfigStatus } = {}
  ): Promise<AgentConfigRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    let query = "SELECT * FROM agent_config WHERE user_id = ?";
    const binds: unknown[] = [userId];
    if (opts.status) {
      query += " AND status = ?";
      binds.push(opts.status);
    }
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    binds.push(limit, offset);
    const result = await db.prepare(query).bind(...binds).all<AgentConfigRow>();
    return result.results;
  },
};
