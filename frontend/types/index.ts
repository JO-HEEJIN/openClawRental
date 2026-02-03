// OpenClaw shared TypeScript types

// ========== User & Auth ==========
export interface User {
  id: string;
  clerkId: string;
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

export interface CreditTransaction {
  id: string;
  userId: string;
  type: "purchase" | "usage" | "refund" | "bonus";
  amount: number; // positive = credit, negative = debit
  balance: number;
  description: string;
  relatedId?: string; // payment or run ID
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
export type AgentCategory = "shorts" | "reels" | "tiktok" | "editing" | "thumbnail" | "caption";

export interface Agent {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  category: AgentCategory;
  creditCost: number;
  iconUrl?: string;
  rating: number;
  totalRuns: number;
  estimatedDurationMinutes: number;
  inputSchema: Record<string, unknown>;
  active: boolean;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  userId: string;
  agentId: string;
  agent?: Agent;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  creditsUsed: number;
  startedAt?: string;
  completedAt?: string;
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

// ========== Dashboard ==========
export interface DashboardStats {
  creditBalance: number;
  totalRuns: number;
  activeRuns: number;
  creditsUsedThisMonth: number;
}
