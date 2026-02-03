import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";
import { koKR } from "@clerk/localizations";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "OpenClaw - AI 에이전트 렌탈 플랫폼",
    template: "%s | OpenClaw",
  },
  description:
    "한국 숏폼 크리에이터를 위한 AI 에이전트 렌탈 플랫폼. 쇼츠, 릴스, 틱톡 콘텐츠를 AI로 자동화하세요.",
  keywords: ["AI", "에이전트", "숏폼", "쇼츠", "릴스", "틱톡", "크리에이터"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider localization={{ ...koKR }}>
      <html lang="ko">
        <body
          className={`${notoSansKR.variable} ${geistMono.variable} font-sans antialiased`}
        >
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
