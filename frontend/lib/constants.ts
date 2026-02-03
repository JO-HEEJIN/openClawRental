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
    credits: 1_100,
    bonusCredits: 100,
    totalCredits: 1_200,
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    nameKo: "프로",
    price: 29_900,
    credits: 3_500,
    bonusCredits: 500,
    totalCredits: 4_000,
  },
  {
    id: "business",
    name: "Business",
    nameKo: "비즈니스",
    price: 99_000,
    credits: 12_000,
    bonusCredits: 2_000,
    totalCredits: 14_000,
  },
];

// Agent categories
export const AGENT_CATEGORIES = [
  { id: "shorts", label: "YouTube Shorts", labelKo: "유튜브 쇼츠" },
  { id: "reels", label: "Instagram Reels", labelKo: "인스타 릴스" },
  { id: "tiktok", label: "TikTok", labelKo: "틱톡" },
  { id: "editing", label: "Video Editing", labelKo: "영상 편집" },
  { id: "thumbnail", label: "Thumbnails", labelKo: "썸네일" },
  { id: "caption", label: "Captions", labelKo: "자막" },
] as const;

// Navigation items
export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "대시보드", icon: "LayoutDashboard" },
  { href: "/dashboard/agents", label: "AI 에이전트", icon: "Bot" },
  { href: "/dashboard/credits", label: "크레딧", icon: "Coins" },
  { href: "/dashboard/settings", label: "설정", icon: "Settings" },
] as const;
