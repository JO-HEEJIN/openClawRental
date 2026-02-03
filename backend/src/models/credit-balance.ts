export interface CreditBalanceRow {
  user_id: string;
  total_credits: number;
  used_credits: number;
  reserved_credits: number;
  available_credits: number;
  updated_at: string;
}

export const CreditBalanceModel = {
  async findByUserId(db: D1Database, userId: string): Promise<CreditBalanceRow | null> {
    return db.prepare("SELECT * FROM credit_balance WHERE user_id = ?").bind(userId).first<CreditBalanceRow>();
  },

  async initialize(db: D1Database, userId: string): Promise<void> {
    await db
      .prepare(
        `INSERT OR IGNORE INTO credit_balance (user_id, total_credits, used_credits, reserved_credits, updated_at)
         VALUES (?, 0, 0, 0, datetime('now'))`
      )
      .bind(userId)
      .run();
  },

  async grantCredits(db: D1Database, userId: string, amount: number): Promise<void> {
    await db
      .prepare(
        `UPDATE credit_balance SET total_credits = total_credits + ?, updated_at = datetime('now') WHERE user_id = ?`
      )
      .bind(amount, userId)
      .run();
  },

  async reserveCredits(db: D1Database, userId: string, amount: number): Promise<void> {
    await db
      .prepare(
        `UPDATE credit_balance SET reserved_credits = reserved_credits + ?, updated_at = datetime('now')
         WHERE user_id = ? AND (total_credits - used_credits - reserved_credits) >= ?`
      )
      .bind(amount, userId, amount)
      .run();
  },

  async settleCredits(
    db: D1Database,
    userId: string,
    reservedAmount: number,
    actualAmount: number
  ): Promise<void> {
    await db
      .prepare(
        `UPDATE credit_balance
         SET reserved_credits = reserved_credits - ?,
             used_credits = used_credits + ?,
             updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .bind(reservedAmount, actualAmount, userId)
      .run();
  },
};
