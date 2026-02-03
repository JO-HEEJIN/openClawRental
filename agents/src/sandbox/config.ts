export interface SandboxConfig { cpuTimeLimit: number; wallTimeLimit: number; memoryLimit: number; maxConcurrency: number; maxSubrequests: number; r2Prefix: string; aiGatewayRpm: number; }

export const FREE_TIER_CONFIG: SandboxConfig = { cpuTimeLimit: 30_000, wallTimeLimit: 300_000, memoryLimit: 128, maxConcurrency: 1, maxSubrequests: 50, r2Prefix: '', aiGatewayRpm: 10 };
export const PAID_TIER_CONFIG: SandboxConfig = { cpuTimeLimit: 60_000, wallTimeLimit: 300_000, memoryLimit: 256, maxConcurrency: 3, maxSubrequests: 100, r2Prefix: '', aiGatewayRpm: 30 };

export function buildSandboxConfig(userId: string, tier: 'free' | 'paid'): SandboxConfig {
  const base = tier === 'paid' ? { ...PAID_TIER_CONFIG } : { ...FREE_TIER_CONFIG };
  base.r2Prefix = `users/${userId}/`;
  return base;
}

export interface DispatchConfig { namespace: string; scriptNamePattern: string; outboundWorker: string; }
export const DISPATCH_CONFIG: DispatchConfig = { namespace: 'openclaw-agents', scriptNamePattern: 'openclaw-agent-{userId}', outboundWorker: 'openclaw-agent-outbound' };
export function getUserWorkerName(userId: string): string { return DISPATCH_CONFIG.scriptNamePattern.replace('{userId}', userId); }
