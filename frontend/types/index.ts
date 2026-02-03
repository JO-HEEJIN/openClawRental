// OpenClaw shared TypeScript types

// ========== User & Auth ==========
export interface User {
  id: string;
  kakaoId: string;
  email: string;
  name: string;
  profileImageUrl?: string;
  provider: "kakao" | "google" | "email";
  creditBalance: number;
  plan: "free" | "starter" | "pro" | "business";
  language: "ko" | "en";
  createdAt: string;
  updatedAt: string;
}

// ========== Credits & Payments ==========
export type CreditPackageId = "trial" | "starter" | "pro" | "business";

export interface CreditPackage {
  id: CreditPackageId;
  name: string;
  nameKo: string;
  price: number; // KRW, VAT inclusive
  credits: number;
  bonusCredits: number;
  totalCredits: number;
  popular?: boolean;
}

export interface CreditBalance {
  totalCredits: number;
  usedCredits: number;
  reservedCredits: number;
  availableCredits: number;
}

export interface CreditTransaction {
  id: string;
  type: "purchase" | "usage" | "refund" | "bonus" | "trial";
  amount: number;
  balanceAfter: number;
  description: string;
  paymentOrderId?: string;
  agentRunId?: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  impUid: string;
  merchantUid: string;
  packageId: CreditPackageId;
  amount: number;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
  pgProvider: string;
  createdAt: string;
}

// ========== Agents ==========
export type AgentCategory = "content" | "visual" | "seo" | "localization";

export interface AgentTemplate {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  category: string;
  estimatedCreditsPerRun: number;
  configSchema: Record<string, unknown>;
}

export interface AgentConfig {
  id: string;
  agentTemplateId: string;
  templateName?: string;
  name: string;
  description?: string;
  configJson: Record<string, unknown>;
  status: "active" | "paused" | "archived";
  estimatedCreditsPerRun: number;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentRun {
  id: string;
  agentConfigId: string;
  config?: AgentConfig;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  creditsReserved: number;
  creditsActual?: number;
  inputJson?: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  errorMessage?: string;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface UsageLog {
  id: string;
  resourceType: string;
  resourceDetail: string;
  quantity: number;
  creditCost: number;
  createdAt: string;
}

// ========== API ==========
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ========== Consent & Onboarding ==========
export interface ConsentData {
  termsOfService: boolean;
  privacyPolicy: boolean;
  marketing: boolean;
}

export interface OnboardingProfile {
  contentCategory?: string;
  primaryPlatform?: string;
}

// ========== Dashboard ==========
export interface DashboardStats {
  creditBalance: number;
  totalRuns: number;
  activeRuns: number;
  creditsUsedThisMonth: number;
  favoriteAgentId?: string;
  favoriteAgentName?: string;
}

export interface WeeklyUsage {
  date: string;
  credits: number;
  runs: number;
}

// ========== PortOne ==========
export interface PortOnePaymentResponse {
  imp_uid: string;
  merchant_uid: string;
  paid_amount: number;
  status: string;
  error_msg?: string;
  vbank_num?: string;
  vbank_name?: string;
  vbank_date?: number;
}

export type PayMethod =
  | "card"
  | "trans"
  | "kakaopay"
  | "naverpay"
  | "tosspay"
  | "vbank";

export type TransactionFilter = "all" | "purchase" | "usage" | "refund" | "bonus" | "trial";
