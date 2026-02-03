import type { Env } from "../types";
import { CreditBalanceModel } from "../models/credit-balance";
import { CreditTransactionModel } from "../models/credit-transaction";
import { generateId } from "../utils/ulid";

// Model pricing in USD per million tokens
export const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "claude-sonnet-4-20250514": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-haiku-3.5": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
};

const USD_TO_KRW = 1350;
const MARKUP = 1.2; // 20% safety margin for FX + profit
const KRW_PER_CREDIT = 10; // 1 credit = 10 KRW

// Minimum credits required to make an LLM call
export const MIN_CREDITS_REQUIRED = 1;

export function isSupportedModel(model: string): boolean {
  return model in MODEL_PRICING;
}

export function calculateCreditCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Fallback: use gpt-4o pricing for unknown models
    return calculateCreditCost("gpt-4o", inputTokens, outputTokens);
  }
  const usdCost =
    (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;
  const krwCost = usdCost * USD_TO_KRW * MARKUP;
  return Math.max(1, Math.ceil(krwCost / KRW_PER_CREDIT)); // minimum 1 credit per call
}

// Estimate tokens from character count (fallback when usage data unavailable)
export function estimateTokens(text: string): number {
  // Rough approximation: ~4 chars per token for English, ~2 chars per token for Korean
  // Use a conservative estimate of ~3 chars per token
  return Math.ceil(text.length / 3);
}

export interface BalanceCheckResult {
  allowed: boolean;
  availableCredits: number;
}

export async function checkBalance(db: D1Database, userId: string): Promise<BalanceCheckResult> {
  const balance = await CreditBalanceModel.findByUserId(db, userId);
  if (!balance) {
    return { allowed: false, availableCredits: 0 };
  }
  return {
    allowed: balance.available_credits >= MIN_CREDITS_REQUIRED,
    availableCredits: balance.available_credits,
  };
}

export interface BillingRecord {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  creditCost: number;
  agentRunId?: string;
}

// Deduct credits and record transaction atomically via D1 batch
export async function deductCredits(
  db: D1Database,
  record: BillingRecord
): Promise<void> {
  const { userId, model, inputTokens, outputTokens, creditCost, agentRunId } = record;
  const txId = generateId();
  const now = new Date().toISOString();

  // D1 batch for atomicity
  const statements = [
    db
      .prepare(
        `UPDATE credit_balance SET used_credits = used_credits + ?, updated_at = ? WHERE user_id = ? AND (total_credits - used_credits - reserved_credits) >= ?`
      )
      .bind(creditCost, now, userId, creditCost),
    db
      .prepare(
        `INSERT INTO credit_transaction (id, user_id, agent_run_id, type, amount, balance_after, description, created_at)
         VALUES (?, ?, ?, 'usage', ?, (SELECT (total_credits - used_credits - reserved_credits) FROM credit_balance WHERE user_id = ?), ?, ?)`
      )
      .bind(
        txId,
        userId,
        agentRunId ?? null,
        -creditCost,
        userId,
        `LLM call: ${model} (${inputTokens} in / ${outputTokens} out)`,
        now
      ),
  ];

  const results = await db.batch(statements);

  // Check if the UPDATE actually modified a row (balance was sufficient)
  const updateResult = results[0];
  if (updateResult && updateResult.meta.changes === 0) {
    // Balance was insufficient at time of deduction -- the call already went through,
    // so log this as a billing discrepancy but don't fail
    console.warn(`Billing: insufficient credits for user ${userId}, cost=${creditCost}. Call already completed.`);
  }
}

// Get the target provider URL based on the model
export function getProviderConfig(
  model: string,
  env: Env
): { url: string; apiKey: string; provider: "openai" | "anthropic" } {
  if (model.startsWith("claude")) {
    return {
      url: "https://api.anthropic.com/v1/messages",
      apiKey: env.ANTHROPIC_API_KEY,
      provider: "anthropic",
    };
  }
  // Default to OpenAI
  return {
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: env.OPENAI_API_KEY,
    provider: "openai",
  };
}
