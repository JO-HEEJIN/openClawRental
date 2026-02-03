import type { Context } from "hono";

export interface Env {
  // D1 Database
  DB: D1Database;
  // R2 Bucket
  STORAGE: R2Bucket;
  // Durable Objects
  CREDIT_BALANCE: DurableObjectNamespace;
  // Environment variables
  ENVIRONMENT: string;
  CORS_ORIGINS: string;
  RATE_LIMIT_MAX: string;
  RATE_LIMIT_WINDOW_SECONDS: string;
  PAYMENT_RATE_LIMIT_MAX: string;
  PAYMENT_RATE_LIMIT_WINDOW_SECONDS: string;
  // Secrets (set via wrangler secret put)
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  PORTONE_API_KEY: string;
  PORTONE_API_SECRET: string;
  PORTONE_WEBHOOK_SECRET: string;
}

export interface AuthUser {
  userId: string;
  clerkId: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
}

export type AppContext = Context<{ Bindings: Env; Variables: { user: AuthUser } }>;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export type UserRole = "user" | "admin";
export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded" | "vbank_issued";
export type PayMethod = "card" | "vbank" | "kakaopay" | "naverpay" | "phone";
export type CreditTransactionType = "purchase" | "usage" | "reservation" | "settlement" | "refund" | "bonus" | "trial";
export type AgentRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AgentConfigStatus = "active" | "inactive" | "archived";
export type ConsentType = "terms_of_service" | "privacy_policy" | "marketing";

export interface CreditPackage {
  code: string;
  name: string;
  nameKo: string;
  amountKrw: number;
  credits: number;
  bonusCredits: number;
  totalCredits: number;
}
