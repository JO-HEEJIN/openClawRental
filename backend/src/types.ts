import type { Context } from "hono";

// ---------------------------------------------------------------------------
// Cloudflare Worker Environment Bindings
// ---------------------------------------------------------------------------

export interface Env {
  // D1 Database
  DB: D1Database;
  // R2 Bucket
  STORAGE: R2Bucket;
  // Cloudflare Queues
  USAGE_QUEUE: Queue;
  // Environment variables
  ENVIRONMENT: string;
  CORS_ORIGINS: string;
  RATE_LIMIT_MAX: string;
  RATE_LIMIT_WINDOW_SECONDS: string;
  PAYMENT_RATE_LIMIT_MAX: string;
  PAYMENT_RATE_LIMIT_WINDOW_SECONDS: string;
  // Kakao OAuth
  KAKAO_CLIENT_ID: string;
  KAKAO_CLIENT_SECRET: string;
  KAKAO_REDIRECT_URI: string;
  // JWT
  JWT_SECRET: string;
  // PortOne V2
  PORTONE_API_KEY: string;
  PORTONE_API_SECRET: string;
  PORTONE_WEBHOOK_SECRET: string;
  PORTONE_STORE_ID: string;
  // LLM Provider API Keys (set via wrangler secret put)
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  kakaoId: string;
  email: string | null;
  displayName: string;
  role: "user" | "admin";
}

export type AppContext = Context<{ Bindings: Env; Variables: { user: AuthUser } }>;

// ---------------------------------------------------------------------------
// API Response
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Enum Types
// ---------------------------------------------------------------------------

export type UserRole = "user" | "admin";
export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded" | "vbank_issued";
export type PayMethod = "card" | "vbank" | "kakaopay" | "naverpay" | "phone";
export type CreditTransactionType = "purchase" | "usage" | "reservation" | "settlement" | "refund" | "bonus" | "trial";
export type AgentRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AgentConfigStatus = "active" | "inactive" | "archived";
export type ConsentType = "terms_of_service" | "privacy_policy" | "marketing";

// ---------------------------------------------------------------------------
// D1 Row Types (match migration schema)
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  kakao_id: string;
  email: string | null;
  display_name: string;
  profile_image_url: string | null;
  role: UserRole;
  locale: string;
  timezone: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreditBalanceRow {
  user_id: string;
  total_credits: number;
  used_credits: number;
  reserved_credits: number;
  available_credits: number;
  updated_at: string;
}

export interface PaymentOrderRow {
  id: string;
  user_id: string;
  merchant_uid: string;
  imp_uid: string | null;
  package_code: string;
  amount_krw: number;
  credits_to_grant: number;
  pay_method: PayMethod | null;
  status: PaymentStatus;
  vbank_num: string | null;
  vbank_date: string | null;
  pg_provider: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditTransactionRow {
  id: string;
  user_id: string;
  payment_order_id: string | null;
  agent_run_id: string | null;
  type: CreditTransactionType;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export interface WebhookEventRow {
  id: string;
  idempotency_key: string;
  imp_uid: string;
  event_type: string;
  payload_json: string;
  processed_at: string | null;
  created_at: string;
}

export interface AgentConfigRow {
  id: string;
  user_id: string;
  agent_template_id: string;
  name: string;
  description: string;
  config_json: string;
  status: AgentConfigStatus;
  estimated_credits_per_run: number;
  created_at: string;
  updated_at: string;
}

export interface AgentRunRow {
  id: string;
  agent_config_id: string;
  user_id: string;
  status: AgentRunStatus;
  credits_reserved: number;
  credits_actual: number | null;
  input_json: string;
  output_json: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface UsageLogRow {
  id: string;
  agent_run_id: string;
  user_id: string;
  resource_type: string;
  resource_detail: string;
  quantity: number;
  credit_cost: number;
  created_at: string;
}

export interface ConsentRecordRow {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  consent_version: string;
  granted: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Credit Package
// ---------------------------------------------------------------------------

export interface CreditPackage {
  code: string;
  name: string;
  nameKo: string;
  amountKrw: number;
  credits: number;
  bonusCredits: number;
  totalCredits: number;
}

// ---------------------------------------------------------------------------
// Queue Message Types
// ---------------------------------------------------------------------------

export interface UsageQueueMessage {
  id: string;
  agentRunId: string;
  userId: string;
  resourceType: string;
  resourceDetail: string;
  quantity: number;
  creditCost: number;
  createdAt: string;
}
