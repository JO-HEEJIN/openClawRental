"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Bell, Bot, Coins, LayoutDashboard, Menu, PlayCircle, Settings } from "lucide-react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { CreditBalance } from "@/types";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "AI 에이전트", icon: Bot },
  { href: "/dashboard/runs", label: "실행 내역", icon: PlayCircle },
  { href: "/dashboard/credits", label: "크레딧", icon: Coins },
  { href: "/dashboard/settings", label: "설정", icon: Settings },
];

export function DashboardHeader() {
  const pathname = usePathname();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    api.get<CreditBalance>("/credits/balance").then((res) => {
      if (res.success && res.data) setCredits(res.data.availableCredits);
    });
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">메뉴 열기</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-16 items-center border-b px-6">
            <Link href="/" className="flex items-center gap-2">
              <Bot className="h-7 w-7 text-primary" />
              <span className="text-lg font-bold">OpenClaw</span>
            </Link>
          </div>
          <nav className="space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          <span className="font-bold">OpenClaw</span>
        </Link>
      </div>
      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <Link href="/dashboard/credits">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Coins className="h-4 w-4" />
            <span className="text-sm font-medium">
              {credits !== null ? formatNumber(credits) : "-"}
            </span>
          </Button>
        </Link>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="sr-only">알림</span>
        </Button>

        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: "h-9 w-9",
            },
          }}
        />
      </div>
    </header>
  );
}
