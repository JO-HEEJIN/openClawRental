/**
 * Sandbox Runtime Configuration.
 *
 * Defines per-user isolation boundaries using Workers for Platforms.
 * Each user's agent executions run in an isolated worker with:
 * - Separate memory/CPU limits
 * - Scoped R2 access (user's own prefix only)
 * - Rate-limited AI Gateway access
 * - No cross-tenant data access
 */

export interface SandboxConfig {
  /** Max CPU time per request (ms) */
  cpuTimeLimit: number;
  /** Max wall-clock time per request (ms) */
  wallTimeLimit: number;
  /** Max memory (MB) */
  memoryLimit: number;
  /** Max concurrent requests */
  maxConcurrency: number;
  /** Max subrequests (fetch calls) per invocation */
  maxSubrequests: number;
  /** R2 key prefix scope for this user */
  r2Prefix: string;
  /** AI Gateway rate limit (requests per minute) */
  aiGatewayRpm: number;
}

/** Default sandbox config for free-tier users */
export const FREE_TIER_CONFIG: SandboxConfig = {
  cpuTimeLimit: 30_000,
  wallTimeLimit: 300_000, // 5 min
  memoryLimit: 128,
  maxConcurrency: 1,
  maxSubrequests: 50,
  r2Prefix: '', // Set dynamically per user
  aiGatewayRpm: 10,
};

/** Sandbox config for paid users */
export const PAID_TIER_CONFIG: SandboxConfig = {
  cpuTimeLimit: 60_000,
  wallTimeLimit: 300_000,
  memoryLimit: 256,
  maxConcurrency: 3,
  maxSubrequests: 100,
  r2Prefix: '',
  aiGatewayRpm: 30,
};

/** Build a user-scoped sandbox config */
export function buildSandboxConfig(
  userId: string,
  tier: 'free' | 'paid',
): SandboxConfig {
  const base = tier === 'paid' ? { ...PAID_TIER_CONFIG } : { ...FREE_TIER_CONFIG };
  base.r2Prefix = `users/${userId}/`;
  return base;
}

/**
 * Workers for Platforms dispatch namespace configuration.
 *
 * In Cloudflare Workers for Platforms, each user gets a "user worker"
 * that is dispatched via a dispatch namespace. The dispatch worker
 * routes requests to the correct user worker based on user ID.
 */
export interface DispatchConfig {
  /** Dispatch namespace name */
  namespace: string;
  /** Script naming convention: openclaw-agent-{userId} */
  scriptNamePattern: string;
  /** Outbound worker for external API calls */
  outboundWorker: string;
}

export const DISPATCH_CONFIG: DispatchConfig = {
  namespace: 'openclaw-agents',
  scriptNamePattern: 'openclaw-agent-{userId}',
  outboundWorker: 'openclaw-agent-outbound',
};

/** Generate the worker script name for a user */
export function getUserWorkerName(userId: string): string {
  return DISPATCH_CONFIG.scriptNamePattern.replace('{userId}', userId);
}
