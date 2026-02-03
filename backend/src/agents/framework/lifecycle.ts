/**
 * Agent Lifecycle Manager.
 *
 * Orchestrates the full lifecycle of an agent run:
 * 1. Validate input
 * 2. Reserve credits
 * 3. Execute with timeout + progress streaming
 * 4. Settle credits (actual vs reserved)
 * 5. Persist results
 *
 * Handles: cancellation, timeouts, partial results on failure, usage logging.
 */

import type {
  AgentInput,
  AgentOutput,
  AgentRun,
  ExecutionContext,
  ProgressEvent,
  UsageEntry,
  UsageLog,
  AgentEnv,
  RunStatus,
} from './types';
import type { Agent } from './agent';
import { AgentAbortedError, AgentExecutionError, AgentValidationError } from './agent';
import { ulid } from 'ulid';

/** Max execution time per agent run (5 minutes) */
const MAX_EXECUTION_MS = 5 * 60 * 1000;

export interface LifecycleCallbacks {
  /** Called when a progress event is emitted (forward to SSE) */
  onProgress: (event: ProgressEvent) => void;
  /** Reserve credits before execution */
  reserveCredits: (userId: string, amount: number) => Promise<boolean>;
  /** Settle credits after execution (actual cost) */
  settleCredits: (userId: string, reserved: number, actual: number) => Promise<void>;
  /** Persist the run record to D1 */
  persistRun: (run: AgentRun) => Promise<void>;
  /** Persist usage logs to D1 */
  persistUsage: (logs: UsageLog[]) => Promise<void>;
}

export class AgentLifecycleManager {
  constructor(
    private readonly agent: Agent,
    private readonly env: AgentEnv,
    private readonly callbacks: LifecycleCallbacks,
  ) {}

  /**
   * Execute a full agent run lifecycle.
   * Returns the completed AgentRun record.
   */
  async run(input: AgentInput, aiGateway: import('./types').AIGatewayClient, storage: R2Bucket): Promise<AgentRun> {
    const startTime = Date.now();
    const usageLogs: UsageLog[] = [];
    const creditsToReserve = this.agent.meta.estimatedCredits.max;

    // Initialize run record
    const run: AgentRun = {
      id: input.runId,
      agentConfigId: (input.config['agentConfigId'] as string) ?? '',
      userId: input.userId,
      status: 'queued',
      creditsReserved: creditsToReserve,
      creditsActual: null,
      input,
      output: null,
      errorMessage: null,
      durationMs: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };

    // Step 1: Validate input
    const validation = this.agent.validate(input);
    if (!validation.valid) {
      run.status = 'failed';
      run.errorMessage = `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`;
      run.durationMs = Date.now() - startTime;
      run.completedAt = new Date().toISOString();
      await this.callbacks.persistRun(run);
      throw new AgentValidationError(run.errorMessage, validation.errors);
    }

    // Step 2: Reserve credits
    const reserved = await this.callbacks.reserveCredits(input.userId, creditsToReserve);
    if (!reserved) {
      run.status = 'failed';
      run.errorMessage = 'Insufficient credits';
      run.durationMs = Date.now() - startTime;
      run.completedAt = new Date().toISOString();
      await this.callbacks.persistRun(run);
      throw new AgentExecutionError('Insufficient credits to run this agent');
    }

    // Step 3: Execute with timeout
    run.status = 'running';
    run.startedAt = new Date().toISOString();
    await this.callbacks.persistRun(run);

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort(new Error('Agent execution timed out'));
    }, MAX_EXECUTION_MS);

    // Build execution context
    const trackUsage = (entry: UsageEntry) => {
      const log: UsageLog = {
        ...entry,
        id: ulid(),
        agentRunId: input.runId,
        userId: input.userId,
        createdAt: new Date().toISOString(),
      };
      usageLogs.push(log);
    };

    const context: ExecutionContext = {
      env: this.env,
      emitProgress: (event: ProgressEvent) => this.callbacks.onProgress(event),
      signal: abortController.signal,
      aiGateway,
      storage,
      trackUsage,
    };

    let output: AgentOutput | undefined;

    try {
      const generator = this.agent.execute(input, context);

      // Consume the generator, forwarding progress events
      let result = await generator.next();
      while (!result.done) {
        // Each yielded value is a ProgressEvent
        this.callbacks.onProgress(result.value as ProgressEvent);
        result = await generator.next();
      }

      // The return value is the final AgentOutput
      output = result.value;

      // Step 4: Calculate actual cost
      const actualCost = this.agent.calculateCost(usageLogs);

      run.status = 'completed';
      run.output = output;
      run.creditsActual = actualCost;
      run.durationMs = Date.now() - startTime;
      run.completedAt = new Date().toISOString();

      // Step 5: Settle credits
      await this.callbacks.settleCredits(input.userId, creditsToReserve, actualCost);
    } catch (error) {
      run.durationMs = Date.now() - startTime;
      run.completedAt = new Date().toISOString();

      if (error instanceof AgentAbortedError) {
        run.status = 'cancelled';
        run.errorMessage = error.message;
      } else {
        run.status = 'failed';
        run.errorMessage =
          error instanceof Error ? error.message : 'Unknown execution error';

        // Save partial output if available
        if (error instanceof AgentExecutionError && error.partialOutput) {
          run.output = {
            success: false,
            data: error.partialOutput.data ?? {},
            summary: error.partialOutput.summary ?? 'Partial result due to error',
            artifacts: error.partialOutput.artifacts ?? [],
            usage: usageLogs,
          };
        }
      }

      // Settle credits (charge for work done even on failure)
      const actualCost = this.agent.calculateCost(usageLogs);
      run.creditsActual = actualCost;
      await this.callbacks.settleCredits(input.userId, creditsToReserve, actualCost);
    } finally {
      clearTimeout(timeout);

      // Persist final run state and usage logs
      await this.callbacks.persistRun(run);
      if (usageLogs.length > 0) {
        await this.callbacks.persistUsage(usageLogs);
      }
    }

    return run;
  }

  /**
   * Cancel a running agent by aborting its signal.
   * Actual cancellation is handled in the run() method above.
   */
  static cancel(run: AgentRun): RunStatus {
    // In practice, the AbortController is held per-run in a Map.
    // This is a placeholder; the real cancellation mechanism uses
    // Durable Objects or a shared Map keyed by runId.
    return 'cancelled';
  }
}
