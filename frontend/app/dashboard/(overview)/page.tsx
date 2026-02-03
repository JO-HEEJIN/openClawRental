"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Coins,
  PlayCircle,
  TrendingUp,
  Plus,
  CreditCard,
  Search,
  Star,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatNumber, formatRelativeTimeKo } from "@/lib/format";
import type { DashboardStats, AgentRun, WeeklyUsage, CreditBalance } from "@/types";

const STATUS_MAP: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  queued: { label: "대기 중", icon: Clock, className: "text-muted-foreground" },
  running: { label: "실행 중", icon: Loader2, className: "text-blue-600" },
  completed: { label: "완료", icon: CheckCircle2, className: "text-green-600" },
  failed: { label: "실패", icon: XCircle, className: "text-destructive" },
  cancelled: { label: "취소됨", icon: XCircle, className: "text-muted-foreground" },
};

function BarChart({ data }: { data: WeeklyUsage[] }) {
  const maxCredits = Math.max(...data.map((d) => d.credits), 1);
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map((d) => {
        const height = Math.max((d.credits / maxCredits) * 100, 4);
        const dayLabel = new Date(d.date).toLocaleDateString("ko-KR", {
          weekday: "short",
        });
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {formatNumber(d.credits)}
            </span>
            <div
              className="w-full bg-primary rounded-t-sm transition-all"
              style={{ height: `${height}%` }}
            />
            <span className="text-xs text-muted-foreground">{dayLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    creditBalance: 0,
    totalRuns: 0,
    activeRuns: 0,
    creditsUsedThisMonth: 0,
  });
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [weeklyUsage] = useState<WeeklyUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [balanceRes, runsRes] = await Promise.all([
          api.get<CreditBalance>("/credits/balance"),
          api.get<{ runs: AgentRun[]; total: number }>("/agents/runs?limit=5"),
        ]);
        if (balanceRes.success && balanceRes.data) {
          setStats((prev) => ({
            ...prev,
            creditBalance: balanceRes.data!.availableCredits,
          }));
        }
        if (runsRes.success && runsRes.data) {
          setRecentRuns(runsRes.data.runs);
          setStats((prev) => ({
            ...prev,
            totalRuns: runsRes.data!.total,
          }));
        }
      } catch {
        // API not available yet -- show defaults
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  // Generate placeholder weekly data if API returns empty
  const chartData =
    weeklyUsage.length > 0
      ? weeklyUsage
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return { date: d.toISOString(), credits: 0, runs: 0 };
        });

  const balanceWarning =
    stats.creditBalance === 0
      ? "destructive"
      : stats.creditBalance < 10
        ? "destructive"
        : stats.creditBalance < 50
          ? "warning"
          : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">대시보드</h1>
        {balanceWarning && (
          <Badge
            variant={balanceWarning === "warning" ? "secondary" : "destructive"}
          >
            {stats.creditBalance === 0
              ? "크레딧 없음"
              : stats.creditBalance < 10
                ? "크레딧 부족 (10 미만)"
                : "크레딧 부족 (50 미만)"}
          </Badge>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              크레딧 잔액
            </CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats.creditBalance)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              이번 달 실행
            </CardTitle>
            <PlayCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats.totalRuns)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              이번 달 사용 크레딧
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats.creditsUsedThisMonth)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              즐겨찾기 에이전트
            </CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.favoriteAgentName || "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/dashboard/agents">
          <Button variant="outline" className="w-full justify-start gap-2 h-12">
            <Plus className="h-4 w-4" />
            새 실행
          </Button>
        </Link>
        <Link href="/dashboard/credits">
          <Button variant="outline" className="w-full justify-start gap-2 h-12">
            <CreditCard className="h-4 w-4" />
            크레딧 충전
          </Button>
        </Link>
        <Link href="/dashboard/agents">
          <Button variant="outline" className="w-full justify-start gap-2 h-12">
            <Search className="h-4 w-4" />
            에이전트 둘러보기
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Usage Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">주간 크레딧 사용량</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={chartData} />
          </CardContent>
        </Card>

        {/* Recent Runs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">최근 실행</CardTitle>
            <Link href="/dashboard/runs">
              <Button variant="ghost" size="sm" className="gap-1">
                전체 보기
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                아직 실행 내역이 없습니다. AI 에이전트를 실행해 보세요.
              </p>
            ) : (
              <div className="space-y-3">
                {recentRuns.map((run) => {
                  const status = STATUS_MAP[run.status] || STATUS_MAP.queued;
                  const StatusIcon = status.icon;
                  return (
                    <Link
                      key={run.id}
                      href={`/dashboard/runs/${run.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Bot className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {run.config?.name || run.agentConfigId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTimeKo(run.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {(run.creditsActual ?? run.creditsReserved) > 0 &&
                            `${formatNumber(run.creditsActual ?? run.creditsReserved)} 크레딧`}
                        </span>
                        <StatusIcon
                          className={`h-4 w-4 ${status.className} ${
                            run.status === "running" ? "animate-spin" : ""
                          }`}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
