export interface AgentMeta {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  version: string;
  estimatedCredits: CreditRange;
}

export type AgentCategory = 'trend-research' | 'script-generator' | 'thumbnail-generator' | 'seo-optimizer' | 'cross-platform-poster' | 'analytics';

export interface CreditRange { min: number; max: number; }

export interface AgentInput {
  runId: string;
  userId: string;
  config: Record<string, unknown>;
  params: Record<string, unknown>;
}

export interface AgentOutput {
  success: boolean;
  data: Record<string, unknown>;
  summary: string;
  artifacts: ArtifactRef[];
  usage: UsageLog[];
}

export interface ArtifactRef {
  key: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
  url?: string;
}

export interface ValidationResult { valid: boolean; errors: ValidationError[]; }
export interface ValidationError { field: string; message: string; code: string; }

export interface ExecutionContext {
  env: AgentEnv;
  emitProgress: (event: ProgressEvent) => void;
  signal: AbortSignal;
  aiGateway: AIGatewayClient;
  storage: R2Bucket;
  trackUsage: (entry: UsageEntry) => void;
}

export interface AgentEnv {
  AI_GATEWAY: Fetcher;
  AGENT_STORAGE: R2Bucket;
  DB: D1Database;
  YOUTUBE_API_KEY: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_AI_API_KEY: string;
  INSTAGRAM_ACCESS_TOKEN: string;
  [key: string]: unknown;
}

export interface ProgressEvent {
  runId: string;
  stage: string;
  message: string;
  progress: number;
  timestamp: number;
  detail?: Record<string, unknown>;
}

export type ResourceType = 'llm_tokens' | 'api_call' | 'compute_ms' | 'storage_bytes';

export interface UsageEntry {
  resourceType: ResourceType;
  resourceDetail: string;
  quantity: number;
  creditCost: number;
}

export interface UsageLog extends UsageEntry {
  id: string;
  agentRunId: string;
  userId: string;
  createdAt: string;
}

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentRun {
  id: string;
  agentConfigId: string;
  userId: string;
  status: RunStatus;
  creditsReserved: number;
  creditsActual: number | null;
  input: AgentInput;
  output: AgentOutput | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type LLMProvider = 'openai' | 'anthropic' | 'google';

export interface LLMRequest {
  provider?: LLMProvider;
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  cacheable?: boolean;
}

export interface LLMMessage { role: 'system' | 'user' | 'assistant'; content: string; }

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
  latencyMs: number;
}

export interface AIGatewayClient { chat(request: LLMRequest): Promise<LLMResponse>; }

export interface CreditPricing {
  llmTokens: Record<string, { inputPer1k: number; outputPer1k: number }>;
  apiCalls: Record<string, number>;
  computePerSecond: number;
  storagePerMB: number;
}
