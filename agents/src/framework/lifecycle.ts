import type { AgentInput, AgentOutput, AgentRun, ExecutionContext, ProgressEvent, UsageEntry, UsageLog, AgentEnv } from './types';
import type { Agent } from './agent';
import { AgentAbortedError, AgentExecutionError, AgentValidationError } from './agent';
import { ulid } from 'ulid';

const MAX_EXECUTION_MS = 5 * 60 * 1000;

export interface LifecycleCallbacks {
  onProgress: (event: ProgressEvent) => void;
  reserveCredits: (userId: string, amount: number) => Promise<boolean>;
  settleCredits: (userId: string, reserved: number, actual: number) => Promise<void>;
  persistRun: (run: AgentRun) => Promise<void>;
  persistUsage: (logs: UsageLog[]) => Promise<void>;
}

export class AgentLifecycleManager {
  constructor(private readonly agent: Agent, private readonly env: AgentEnv, private readonly callbacks: LifecycleCallbacks) {}

  async run(input: AgentInput, aiGateway: import('./types').AIGatewayClient, storage: R2Bucket): Promise<AgentRun> {
    const startTime = Date.now();
    const usageLogs: UsageLog[] = [];
    const creditsToReserve = this.agent.meta.estimatedCredits.max;

    const run: AgentRun = {
      id: input.runId, agentConfigId: (input.config['agentConfigId'] as string) ?? '', userId: input.userId,
      status: 'queued', creditsReserved: creditsToReserve, creditsActual: null,
      input, output: null, errorMessage: null, durationMs: null, startedAt: null, completedAt: null, createdAt: new Date().toISOString(),
    };

    const validation = this.agent.validate(input);
    if (!validation.valid) {
      run.status = 'failed';
      run.errorMessage = `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`;
      run.durationMs = Date.now() - startTime;
      run.completedAt = new Date().toISOString();
      await this.callbacks.persistRun(run);
      throw new AgentValidationError(run.errorMessage, validation.errors);
    }

    const reserved = await this.callbacks.reserveCredits(input.userId, creditsToReserve);
    if (!reserved) {
      run.status = 'failed'; run.errorMessage = 'Insufficient credits';
      run.durationMs = Date.now() - startTime; run.completedAt = new Date().toISOString();
      await this.callbacks.persistRun(run);
      throw new AgentExecutionError('Insufficient credits to run this agent');
    }

    run.status = 'running'; run.startedAt = new Date().toISOString();
    await this.callbacks.persistRun(run);

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(new Error('Agent execution timed out')), MAX_EXECUTION_MS);

    const trackUsage = (entry: UsageEntry) => {
      usageLogs.push({ ...entry, id: ulid(), agentRunId: input.runId, userId: input.userId, createdAt: new Date().toISOString() });
    };

    const context: ExecutionContext = {
      env: this.env, emitProgress: (e) => this.callbacks.onProgress(e),
      signal: abortController.signal, aiGateway, storage, trackUsage,
    };

    try {
      const gen = this.agent.execute(input, context);
      let result = await gen.next();
      while (!result.done) { this.callbacks.onProgress(result.value as ProgressEvent); result = await gen.next(); }

      const actualCost = this.agent.calculateCost(usageLogs);
      run.status = 'completed'; run.output = result.value; run.creditsActual = actualCost;
      run.durationMs = Date.now() - startTime; run.completedAt = new Date().toISOString();
      await this.callbacks.settleCredits(input.userId, creditsToReserve, actualCost);
    } catch (error) {
      run.durationMs = Date.now() - startTime; run.completedAt = new Date().toISOString();
      if (error instanceof AgentAbortedError) { run.status = 'cancelled'; run.errorMessage = error.message; }
      else {
        run.status = 'failed'; run.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (error instanceof AgentExecutionError && error.partialOutput) {
          run.output = { success: false, data: error.partialOutput.data ?? {}, summary: 'Partial result', artifacts: error.partialOutput.artifacts ?? [], usage: usageLogs };
        }
      }
      const actualCost = this.agent.calculateCost(usageLogs);
      run.creditsActual = actualCost;
      await this.callbacks.settleCredits(input.userId, creditsToReserve, actualCost);
    } finally {
      clearTimeout(timeout);
      await this.callbacks.persistRun(run);
      if (usageLogs.length > 0) await this.callbacks.persistUsage(usageLogs);
    }
    return run;
  }
}
