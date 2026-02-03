/**
 * Core types for the OpenClaw Agent Runtime Framework.
 *
 * Every agent in the system implements the Agent interface and follows
 * a standardized lifecycle: queued -> running -> completed | failed | cancelled.
 */

// ---------------------------------------------------------------------------
// Agent identity & metadata
// ---------------------------------------------------------------------------

export interface AgentMeta {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  version: string;
  estimatedCredits: CreditRange;
}

export type AgentCategory =
  | 'trend-research'
  | 'script-generator'
  | 'thumbnail-generator'
  | 'seo-optimizer'
  | 'cross-platform-poster'
  | 'analytics';

export interface CreditRange {
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// Agent input / output
// ---------------------------------------------------------------------------

export interface AgentInput {
  /** Unique run identifier (ULID) */
  runId: string;
  /** Owner user id */
  userId: string;
  /** Agent-specific configuration from AGENT_CONFIG.config_json */
  config: Record<string, unknown>;
  /** Agent-specific parameters for this particular run */
  params: Record<string, unknown>;
}

export interface AgentOutput {
  /** Whether the run succeeded */
  success: boolean;
  /** Structured result payload (agent-specific) */
  data: Record<string, unknown>;
  /** Human-readable summary */
  summary: string;
  /** URLs to generated artifacts stored in R2 */
  artifacts: ArtifactRef[];
  /** Resource usage accumulated during this run */
  usage: UsageLog[];
}

export interface ArtifactRef {
  key: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
  url?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Execution context (injected by the runtime)
// ---------------------------------------------------------------------------

export interface ExecutionContext {
  /** Cloudflare environment bindings */
  env: AgentEnv;
  /** Emit progress events (streamed to frontend via SSE) */
  emitProgress: (event: ProgressEvent) => void;
  /** AbortSignal – set when run is cancelled or times out */
  signal: AbortSignal;
  /** AI Gateway client for LLM calls */
  aiGateway: AIGatewayClient;
  /** R2 bucket for storing outputs */
  storage: R2Bucket;
  /** Usage tracker – call after each billable operation */
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

// ---------------------------------------------------------------------------
// Progress events (SSE)
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  runId: string;
  stage: string;
  message: string;
  /** 0-100 */
  progress: number;
  timestamp: number;
  detail?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Agent run status
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AI Gateway
// ---------------------------------------------------------------------------

export type LLMProvider = 'openai' | 'anthropic' | 'google';

export interface LLMRequest {
  provider?: LLMProvider;
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  /** If true, use cache (AI Gateway feature) */
  cacheable?: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
  latencyMs: number;
}

export interface AIGatewayClient {
  chat(request: LLMRequest): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// Credit cost calculation
// ---------------------------------------------------------------------------

export interface CreditPricing {
  llmTokens: Record<string, { inputPer1k: number; outputPer1k: number }>;
  apiCalls: Record<string, number>;
  computePerSecond: number;
  storagePerMB: number;
}
