import { generateId } from "../utils/ulid";
import type { CreditTransactionType } from "../types";

export interface CreditTransactionRow {
  id: string;
  user_id: string;
  payment_order_id: string | null;
  agent_run_id: string | null;
  type: CreditTransactionType;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export const CreditTransactionModel = {
  async create(
    db: D1Database,
    data: {
      userId: string;
      paymentOrderId?: string;
      agentRunId?: string;
      type: CreditTransactionType;
      amount: number;
      balanceAfter: number;
      description: string;
    }
  ): Promise<string> {
    const id = generateId();
    await db
      .prepare(
        `INSERT INTO credit_transaction (id, user_id, payment_order_id, agent_run_id, type, amount, balance_after, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        id,
        data.userId,
        data.paymentOrderId ?? null,
        data.agentRunId ?? null,
        data.type,
        data.amount,
        data.balanceAfter,
        data.description
      )
      .run();
    return id;
  },

  async listByUserId(
    db: D1Database,
    userId: string,
    opts: { limit?: number; offset?: number; type?: CreditTransactionType } = {}
  ): Promise<{ results: CreditTransactionRow[]; total: number }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    let whereClause = "WHERE user_id = ?";
    const bindValues: unknown[] = [userId];
    if (opts.type) {
      whereClause += " AND type = ?";
      bindValues.push(opts.type);
    }

    const countResult = await db
      .prepare(`SELECT COUNT(*) as cnt FROM credit_transaction ${whereClause}`)
      .bind(...bindValues)
      .first<{ cnt: number }>();

    const results = await db
      .prepare(
        `SELECT * FROM credit_transaction ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...bindValues, limit, offset)
      .all<CreditTransactionRow>();

    return { results: results.results, total: countResult?.cnt ?? 0 };
  },
};
