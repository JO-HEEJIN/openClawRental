/**
 * Base Agent interface and abstract implementation.
 *
 * All OpenClaw agents extend BaseAgent which provides:
 * - Standard lifecycle hooks
 * - Input validation scaffolding
 * - Usage tracking helpers
 * - Credit cost calculation
 */

import type {
  AgentMeta,
  AgentInput,
  AgentOutput,
  ValidationResult,
  ExecutionContext,
  ProgressEvent,
  UsageLog,
  UsageEntry,
  CreditPricing,
} from './types';

// ---------------------------------------------------------------------------
// Agent interface
// ---------------------------------------------------------------------------

export interface Agent {
  readonly meta: AgentMeta;

  /** Validate inputs before execution */
  validate(input: AgentInput): ValidationResult;

  /** Execute the agent. Yields progress events; returns final output. */
  execute(
    input: AgentInput,
    context: ExecutionContext,
  ): AsyncGenerator<ProgressEvent, AgentOutput, undefined>;

  /** Calculate total credit cost from accumulated usage */
  calculateCost(usage: UsageLog[]): number;
}

// ---------------------------------------------------------------------------
// Abstract base implementation
// ---------------------------------------------------------------------------

export abstract class BaseAgent implements Agent {
  abstract readonly meta: AgentMeta;

  /** Override in subclass with Zod schema or manual checks */
  abstract validate(input: AgentInput): ValidationResult;

  /** Override in subclass with agent-specific logic */
  abstract execute(
    input: AgentInput,
    context: ExecutionContext,
  ): AsyncGenerator<ProgressEvent, AgentOutput, undefined>;

  // -- Credit calculation (shared logic) ------------------------------------

  protected pricing: CreditPricing = {
    llmTokens: {
      'gpt-4o': { inputPer1k: 0.15, outputPer1k: 0.6 },
      'gpt-4o-mini': { inputPer1k: 0.01, outputPer1k: 0.03 },
      'claude-sonnet-4-20250514': { inputPer1k: 0.18, outputPer1k: 0.9 },
      'claude-haiku-3-5': { inputPer1k: 0.05, outputPer1k: 0.25 },
      'gemini-2.0-flash': { inputPer1k: 0.01, outputPer1k: 0.04 },
    },
    apiCalls: {
      'youtube-data-api': 0.5,
      'youtube-upload': 2.0,
      'instagram-graph-api': 0.5,
      'instagram-upload': 2.0,
      'image-generation': 3.0,
    },
    computePerSecond: 0.01,
    storagePerMB: 0.1,
  };

  calculateCost(usage: UsageLog[]): number {
    let total = 0;
    for (const entry of usage) {
      total += entry.creditCost;
    }
    return Math.round(total * 100) / 100;
  }

  // -- Helpers available to subclasses --------------------------------------

  /** Build a progress event */
  protected progress(
    runId: string,
    stage: string,
    message: string,
    pct: number,
    detail?: Record<string, unknown>,
  ): ProgressEvent {
    return {
      runId,
      stage,
      message,
      progress: Math.min(100, Math.max(0, pct)),
      timestamp: Date.now(),
      detail,
    };
  }

  /** Compute credit cost for an LLM call */
  protected llmCreditCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    const rates = this.pricing.llmTokens[model];
    if (!rates) {
      // Fallback to a conservative estimate
      return ((inputTokens + outputTokens) / 1000) * 0.5;
    }
    return (
      (inputTokens / 1000) * rates.inputPer1k +
      (outputTokens / 1000) * rates.outputPer1k
    );
  }

  /** Build a UsageEntry for an LLM call */
  protected llmUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): UsageEntry {
    return {
      resourceType: 'llm_tokens',
      resourceDetail: model,
      quantity: inputTokens + outputTokens,
      creditCost: this.llmCreditCost(model, inputTokens, outputTokens),
    };
  }

  /** Build a UsageEntry for an API call */
  protected apiCallUsage(apiName: string): UsageEntry {
    return {
      resourceType: 'api_call',
      resourceDetail: apiName,
      quantity: 1,
      creditCost: this.pricing.apiCalls[apiName] ?? 1.0,
    };
  }

  /** Build a UsageEntry for compute time */
  protected computeUsage(durationMs: number): UsageEntry {
    return {
      resourceType: 'compute_ms',
      resourceDetail: 'worker-compute',
      quantity: durationMs,
      creditCost: (durationMs / 1000) * this.pricing.computePerSecond,
    };
  }

  /** Build a UsageEntry for R2 storage */
  protected storageUsage(sizeBytes: number): UsageEntry {
    return {
      resourceType: 'storage_bytes',
      resourceDetail: 'r2-storage',
      quantity: sizeBytes,
      creditCost: (sizeBytes / (1024 * 1024)) * this.pricing.storagePerMB,
    };
  }

  /** Check if the run has been cancelled or timed out */
  protected checkAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new AgentAbortedError(signal.reason ?? 'Agent run was cancelled');
    }
  }
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class AgentAbortedError extends Error {
  readonly code = 'AGENT_ABORTED';
  constructor(message: string) {
    super(message);
    this.name = 'AgentAbortedError';
  }
}

export class AgentValidationError extends Error {
  readonly code = 'AGENT_VALIDATION_ERROR';
  constructor(
    message: string,
    public readonly errors: { field: string; message: string; code: string }[],
  ) {
    super(message);
    this.name = 'AgentValidationError';
  }
}

export class AgentExecutionError extends Error {
  readonly code = 'AGENT_EXECUTION_ERROR';
  constructor(
    message: string,
    public readonly partialOutput?: Partial<AgentOutput>,
  ) {
    super(message);
    this.name = 'AgentExecutionError';
  }
}
