import type { Env } from "../types";
import { CreditBalanceModel } from "../models/credit-balance";
import { CreditTransactionModel } from "../models/credit-transaction";
import { AppError } from "../middleware/error-handler";
import { generateId } from "../utils/ulid";

export interface CreditBalanceInfo {
  totalCredits: number;
  usedCredits: number;
  reservedCredits: number;
  availableCredits: number;
}

/**
 * Get the current credit balance from D1.
 */
export async function getBalance(db: D1Database, userId: string): Promise<CreditBalanceInfo> {
  const balance = await CreditBalanceModel.findByUserId(db, userId);
  if (!balance) {
    return { totalCredits: 0, usedCredits: 0, reservedCredits: 0, availableCredits: 0 };
  }
  return {
    totalCredits: balance.total_credits,
    usedCredits: balance.used_credits,
    reservedCredits: balance.reserved_credits,
    availableCredits: balance.available_credits,
  };
}

/**
 * Grant credits to a user (after payment verification or admin grant).
 * Uses D1 batch transaction for atomicity.
 */
export async function grantCredits(
  db: D1Database,
  userId: string,
  amount: number,
  opts: {
    paymentOrderId?: string;
    type: "purchase" | "bonus" | "trial" | "refund";
    description: string;
  }
): Promise<CreditBalanceInfo> {
  if (amount <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Amount must be positive");
  }

  const txId = generateId();
  const now = new Date().toISOString();

  // D1 batch transaction: update balance + record transaction atomically
  await db.batch([
    db
      .prepare(
        `UPDATE credit_balance SET total_credits = total_credits + ?, updated_at = ? WHERE user_id = ?`
      )
      .bind(amount, now, userId),
    db
      .prepare(
        `INSERT INTO credit_transaction (id, user_id, payment_order_id, type, amount, balance_after, description, created_at)
         VALUES (?, ?, ?, ?, ?, (SELECT (total_credits - used_credits - reserved_credits) FROM credit_balance WHERE user_id = ?), ?, ?)`
      )
      .bind(txId, userId, opts.paymentOrderId ?? null, opts.type, amount, userId, opts.description, now),
  ]);

  return getBalance(db, userId);
}

/**
 * Reserve credits before an agent run.
 * Uses D1 batch transaction -- the UPDATE will only succeed if available_credits >= amount
 * due to the CHECK constraint on credit_balance.
 */
export async function reserveCredits(
  db: D1Database,
  userId: string,
  amount: number,
  agentRunId: string
): Promise<void> {
  if (amount <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Amount must be positive");
  }

  const txId = generateId();
  const now = new Date().toISOString();

  const results = await db.batch([
    db
      .prepare(
        `UPDATE credit_balance SET reserved_credits = reserved_credits + ?, updated_at = ?
         WHERE user_id = ? AND (total_credits - used_credits - reserved_credits) >= ?`
      )
      .bind(amount, now, userId, amount),
    db
      .prepare(
        `INSERT INTO credit_transaction (id, user_id, agent_run_id, type, amount, balance_after, description, created_at)
         VALUES (?, ?, ?, 'reservation', ?, (SELECT (total_credits - used_credits - reserved_credits) FROM credit_balance WHERE user_id = ?), ?, ?)`
      )
      .bind(txId, userId, agentRunId, -amount, userId, `Credit reservation for agent run ${agentRunId}`, now),
  ]);

  // Check if the UPDATE actually modified a row
  if (results[0] && results[0].meta.changes === 0) {
    throw new AppError(402, "INSUFFICIENT_CREDITS", "Insufficient credits for this operation");
  }
}

/**
 * Refund credits to a user (payment refund or admin action).
 * Reduces used_credits and records a refund transaction.
 * Uses D1 batch transaction for atomicity.
 */
export async function refundCredits(
  db: D1Database,
  userId: string,
  amount: number,
  opts: {
    paymentOrderId?: string;
    description: string;
  }
): Promise<CreditBalanceInfo> {
  if (amount <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Amount must be positive");
  }

  const txId = generateId();
  const now = new Date().toISOString();

  // Reduce total_credits (refund removes the granted credits)
  // Use MAX(0, ...) to prevent going negative
  await db.batch([
    db
      .prepare(
        `UPDATE credit_balance SET total_credits = MAX(0, total_credits - ?), updated_at = ? WHERE user_id = ?`
      )
      .bind(amount, now, userId),
    db
      .prepare(
        `INSERT INTO credit_transaction (id, user_id, payment_order_id, type, amount, balance_after, description, created_at)
         VALUES (?, ?, ?, 'refund', ?, (SELECT (total_credits - used_credits - reserved_credits) FROM credit_balance WHERE user_id = ?), ?, ?)`
      )
      .bind(txId, userId, opts.paymentOrderId ?? null, -amount, userId, opts.description, now),
  ]);

  return getBalance(db, userId);
}

/**
 * Settle credits after an agent run completes.
 * Moves from reserved to used (actual cost), returns excess to available.
 * Uses D1 batch transaction for atomicity.
 */
export async function settleCredits(
  db: D1Database,
  userId: string,
  reservedAmount: number,
  actualAmount: number,
  agentRunId: string
): Promise<void> {
  const txId = generateId();
  const now = new Date().toISOString();
  const refundAmount = reservedAmount - actualAmount;

  await db.batch([
    db
      .prepare(
        `UPDATE credit_balance
         SET reserved_credits = reserved_credits - ?,
             used_credits = used_credits + ?,
             updated_at = ?
         WHERE user_id = ?`
      )
      .bind(reservedAmount, actualAmount, now, userId),
    db
      .prepare(
        `INSERT INTO credit_transaction (id, user_id, agent_run_id, type, amount, balance_after, description, created_at)
         VALUES (?, ?, ?, 'settlement', ?, (SELECT (total_credits - used_credits - reserved_credits) FROM credit_balance WHERE user_id = ?), ?, ?)`
      )
      .bind(
        txId,
        userId,
        agentRunId,
        refundAmount,
        userId,
        `Settlement for agent run ${agentRunId}: reserved=${reservedAmount}, actual=${actualAmount}`,
        now
      ),
  ]);
}
