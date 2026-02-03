import { CreditPackage } from "@/types";

// API configuration
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787/api/v1";

// PortOne (public storeId only - no secrets in frontend)
export const PORTONE_STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID || "";

// Credit packages (VAT inclusive, KRW)
export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: "trial",
    name: "Trial",
    nameKo: "체험판",
    price: 0,
    credits: 100,
    bonusCredits: 0,
    totalCredits: 100,
  },
  {
    id: "starter",
    name: "Starter",
    nameKo: "스타터",
    price: 9_900,
    credits: 1_000,
    bonusCredits: 100,
    totalCredits: 1_100,
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    nameKo: "프로",
    price: 29_900,
    credits: 3_000,
    bonusCredits: 500,
    totalCredits: 3_500,
  },
  {
    id: "business",
    name: "Business",
    nameKo: "비즈니스",
    price: 99_000,
    credits: 10_000,
    bonusCredits: 2_000,
    totalCredits: 12_000,
  },
];

// Agent categories
export const AGENT_CATEGORIES = [
  { id: "trend", label: "Trends", labelKo: "트렌드" },
  { id: "script", label: "Scripts", labelKo: "스크립트" },
  { id: "thumbnail", label: "Thumbnails", labelKo: "썸네일" },
  { id: "seo", label: "SEO", labelKo: "SEO" },
  { id: "analysis", label: "Analysis", labelKo: "분석" },
  { id: "editing", label: "Video Editing", labelKo: "영상 편집" },
  { id: "caption", label: "Captions", labelKo: "자막" },
] as const;

// Pay methods for PortOne
export const PAY_METHODS = [
  { id: "card", label: "신용/체크카드", icon: "CreditCard" },
  { id: "trans", label: "실시간 계좌이체", icon: "Building" },
  { id: "kakaopay", label: "카카오페이", icon: "Wallet" },
  { id: "naverpay", label: "네이버페이", icon: "Wallet" },
  { id: "tosspay", label: "토스페이", icon: "Wallet" },
  { id: "vbank", label: "가상계좌", icon: "Landmark" },
] as const;

// Navigation items
export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "대시보드", icon: "LayoutDashboard" },
  { href: "/dashboard/agents", label: "AI 에이전트", icon: "Bot" },
  { href: "/dashboard/runs", label: "실행 내역", icon: "PlayCircle" },
  { href: "/dashboard/credits", label: "크레딧", icon: "Coins" },
  { href: "/dashboard/settings", label: "설정", icon: "Settings" },
] as const;
