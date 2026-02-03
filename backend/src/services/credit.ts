import type { Env } from "../types";
import { CreditBalanceModel } from "../models/credit-balance";
import { CreditTransactionModel } from "../models/credit-transaction";
import { AppError } from "../middleware/error-handler";

/**
 * Get the Durable Object stub for a user's credit balance.
 */
function getCreditDO(env: Env, userId: string): DurableObjectStub {
  const doId = env.CREDIT_BALANCE.idFromName(userId);
  return env.CREDIT_BALANCE.get(doId);
}

export interface CreditBalanceInfo {
  totalCredits: number;
  usedCredits: number;
  reservedCredits: number;
  availableCredits: number;
}

/**
 * Get the current credit balance from the Durable Object.
 * Falls back to D1 if DO is not initialized.
 */
export async function getBalance(env: Env, userId: string): Promise<CreditBalanceInfo> {
  const stub = getCreditDO(env, userId);
  const res = await stub.fetch(new Request("http://do/balance"));
  const data = await res.json<CreditBalanceInfo>();

  // If DO returns zeros, check D1 and initialize DO if needed
  if (data.totalCredits === 0 && data.usedCredits === 0) {
    const d1Balance = await CreditBalanceModel.findByUserId(env.DB, userId);
    if (d1Balance && d1Balance.total_credits > 0) {
      // Initialize DO from D1
      await stub.fetch(
        new Request("http://do/initialize", {
          method: "POST",
          body: JSON.stringify({
            userId,
            totalCredits: d1Balance.total_credits,
            usedCredits: d1Balance.used_credits,
            reservedCredits: d1Balance.reserved_credits,
          }),
        })
      );
      return {
        totalCredits: d1Balance.total_credits,
        usedCredits: d1Balance.used_credits,
        reservedCredits: d1Balance.reserved_credits,
        availableCredits: d1Balance.available_credits,
      };
    }
  }

  return data;
}

/**
 * Grant credits to a user (after payment verification or admin grant).
 * Updates both DO (immediate) and D1 (durable).
 */
export async function grantCredits(
  env: Env,
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

  // Update DO
  const stub = getCreditDO(env, userId);
  const doRes = await stub.fetch(
    new Request("http://do/grant", {
      method: "POST",
      body: JSON.stringify({ amount }),
    })
  );
  const doData = await doRes.json<{ success: boolean; availableCredits: number }>();

  // Update D1
  await CreditBalanceModel.grantCredits(env.DB, userId, amount);

  // Get updated balance for transaction record
  const balance = await CreditBalanceModel.findByUserId(env.DB, userId);
  const balanceAfter = balance?.available_credits ?? doData.availableCredits;

  // Record transaction
  await CreditTransactionModel.create(env.DB, {
    userId,
    paymentOrderId: opts.paymentOrderId,
    type: opts.type,
    amount: amount,
    balanceAfter,
    description: opts.description,
  });

  return getBalance(env, userId);
}

/**
 * Reserve credits before an agent run.
 * Deducts from available, adds to reserved.
 */
export async function reserveCredits(
  env: Env,
  userId: string,
  amount: number,
  agentRunId: string
): Promise<void> {
  if (amount <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Amount must be positive");
  }

  // Reserve in DO (source of truth for active operations)
  const stub = getCreditDO(env, userId);
  const res = await stub.fetch(
    new Request("http://do/reserve", {
      method: "POST",
      body: JSON.stringify({ amount }),
    })
  );

  if (!res.ok) {
    const err = await res.json<{ error: string }>();
    throw new AppError(402, "INSUFFICIENT_CREDITS", err.error ?? "Insufficient credits");
  }

  // Reserve in D1
  await CreditBalanceModel.reserveCredits(env.DB, userId, amount);

  // Record reservation transaction
  const balance = await CreditBalanceModel.findByUserId(env.DB, userId);
  await CreditTransactionModel.create(env.DB, {
    userId,
    agentRunId,
    type: "reservation",
    amount: -amount,
    balanceAfter: balance?.available_credits ?? 0,
    description: `Credit reservation for agent run ${agentRunId}`,
  });
}

/**
 * Settle credits after an agent run completes.
 * Moves from reserved to used (actual cost), returns excess to available.
 */
export async function settleCredits(
  env: Env,
  userId: string,
  reservedAmount: number,
  actualAmount: number,
  agentRunId: string
): Promise<void> {
  // Settle in DO
  const stub = getCreditDO(env, userId);
  await stub.fetch(
    new Request("http://do/settle", {
      method: "POST",
      body: JSON.stringify({ reservedAmount, actualAmount }),
    })
  );

  // Settle in D1
  await CreditBalanceModel.settleCredits(env.DB, userId, reservedAmount, actualAmount);

  // Record settlement transaction
  const balance = await CreditBalanceModel.findByUserId(env.DB, userId);
  await CreditTransactionModel.create(env.DB, {
    userId,
    agentRunId,
    type: "settlement",
    amount: reservedAmount - actualAmount, // positive if excess returned
    balanceAfter: balance?.available_credits ?? 0,
    description: `Settlement for agent run ${agentRunId}: reserved=${reservedAmount}, actual=${actualAmount}`,
  });
}
