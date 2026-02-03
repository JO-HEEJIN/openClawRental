import { generateId } from "../utils/ulid";

export interface UsageLogRow {
  id: string;
  agent_run_id: string;
  user_id: string;
  resource_type: string;
  resource_detail: string;
  quantity: number;
  credit_cost: number;
  created_at: string;
}

export const UsageLogModel = {
  async create(
    db: D1Database,
    data: {
      agentRunId: string;
      userId: string;
      resourceType: string;
      resourceDetail?: string;
      quantity?: number;
      creditCost: number;
    }
  ): Promise<string> {
    const id = generateId();
    await db
      .prepare(
        `INSERT INTO usage_log (id, agent_run_id, user_id, resource_type, resource_detail, quantity, credit_cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        id,
        data.agentRunId,
        data.userId,
        data.resourceType,
        data.resourceDetail ?? "",
        data.quantity ?? 1,
        data.creditCost
      )
      .run();
    return id;
  },

  async listByRunId(db: D1Database, agentRunId: string): Promise<UsageLogRow[]> {
    const result = await db
      .prepare("SELECT * FROM usage_log WHERE agent_run_id = ? ORDER BY created_at ASC")
      .bind(agentRunId)
      .all<UsageLogRow>();
    return result.results;
  },

  async listByUserId(
    db: D1Database,
    userId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<UsageLogRow[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const result = await db
      .prepare("SELECT * FROM usage_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset)
      .all<UsageLogRow>();
    return result.results;
  },
};
