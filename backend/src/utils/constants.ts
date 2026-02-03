import type { CreditPackage } from "../types";

export const CREDIT_PACKAGES: Record<string, CreditPackage> = {
  trial: {
    code: "trial",
    name: "Trial",
    nameKo: "체험판",
    amountKrw: 0,
    credits: 100,
    bonusCredits: 0,
    totalCredits: 100,
  },
  starter: {
    code: "starter",
    name: "Starter",
    nameKo: "스타터",
    amountKrw: 9900,
    credits: 1000,
    bonusCredits: 100,
    totalCredits: 1100,
  },
  pro: {
    code: "pro",
    name: "Pro",
    nameKo: "프로",
    amountKrw: 29900,
    credits: 3000,
    bonusCredits: 500,
    totalCredits: 3500,
  },
  business: {
    code: "business",
    name: "Business",
    nameKo: "비즈니스",
    amountKrw: 99000,
    credits: 10000,
    bonusCredits: 2000,
    totalCredits: 12000,
  },
};

export const API_PREFIX = "/api";

export const CORS_MAX_AGE = 86400;
