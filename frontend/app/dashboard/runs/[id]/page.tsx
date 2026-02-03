"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  RefreshCw,
  XCircle,
  FileText,
  Zap,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { formatNumber, formatDateKST, formatRelativeTimeKo } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import type { AgentRun, UsageLog } from "@/types";

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  className: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  progress: number;
}> = {
  pending: { label: "대기 중", icon: Clock, className: "text-muted-foreground", badgeVariant: "secondary", progress: 10 },
  running: { label: "실행 중", icon: Loader2, className: "text-blue-600", badgeVariant: "default", progress: 55 },
  completed: { label: "완료", icon: CheckCircle2, className: "text-green-600", badgeVariant: "outline", progress: 100 },
  failed: { label: "실패", icon: XCircle, className: "text-destructive", badgeVariant: "destructive", progress: 100 },
  cancelled: { label: "취소됨", icon: Ban, className: "text-muted-foreground", badgeVariant: "secondary", progress: 100 },
};

export default function RunDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchRun = useCallback(async () => {
    try {
      const res = await api.get<{ run: AgentRun; usageLogs: UsageLog[] }>(`/agents/runs/${params.id}`);
      if (res.success && res.data) {
        setRun(res.data.run);
        setUsageLogs(res.data.usageLogs);
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  // Poll while running
  const runStatus = run?.status;
  useEffect(() => {
    if (!runStatus || (runStatus !== "pending" && runStatus !== "running")) return;
    const interval = setInterval(fetchRun, 3000);
    return () => clearInterval(interval);
  }, [runStatus, fetchRun]);

  async function handleCancel() {
    if (!run) return;
    setCancelling(true);
    try {
      const res = await api.post<{ message: string }>(`/agents/runs/${run.id}/cancel`);
      if (res.success) {
        toast({ title: "취소됨", description: "에이전트 실행이 취소되었습니다." });
        fetchRun();
      } else {
        toast({ title: "취소 실패", description: res.error?.message || "취소에 실패했습니다.", variant: "destructive" });
      }
    } catch {
      toast({ title: "오류", description: "취소 처리 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }

  async function handleRerun() {
    if (!run) return;
    try {
      const res = await api.post<{ runId: string; creditsReserved: number }>("/agents/runs", {
        agentConfigId: run.agentConfigId,
        input: run.inputJson ?? {},
      });
      if (res.success && res.data) {
        toast({ title: "재실행 시작", description: "같은 설정으로 에이전트를 다시 실행합니다." });
        router.push(`/dashboard/runs/${res.data.runId}`);
      }
    } catch {
      toast({ title: "오류", description: "재실행에 실패했습니다.", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" className="gap-1" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          뒤로
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">실행 결과를 찾을 수 없습니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const isActive = run.status === "pending" || run.status === "running";
  const credits = run.creditsActual ?? run.creditsReserved;

  const durationStr = run.durationMs
    ? `${(run.durationMs / 1000).toFixed(1)}초`
    : run.startedAt && run.completedAt
      ? `${((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}초`
      : undefined;

  return (
    <div className="space-y-6">
      <Button variant="ghost" className="gap-1" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4" />
        실행 내역
      </Button>

      {/* Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            isActive ? "bg-blue-100" : run.status === "completed" ? "bg-green-100" : "bg-muted"
          )}>
            <StatusIcon className={cn("h-5 w-5", statusConfig.className, isActive && "animate-spin")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">실행 결과</h1>
              <Badge variant={statusConfig.badgeVariant}>{statusConfig.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDateKST(run.createdAt)} ({formatRelativeTimeKo(run.createdAt)})
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {isActive && (
            <Button variant="outline" className="gap-1" disabled={cancelling} onClick={handleCancel}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              취소
            </Button>
          )}
          {(run.status === "completed" || run.status === "failed") && (
            <Button variant="outline" className="gap-1" onClick={handleRerun}>
              <RefreshCw className="h-4 w-4" />
              재실행
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {isActive && (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">진행 상황</span>
                <span className="font-medium">{statusConfig.label}</span>
              </div>
              <Progress value={statusConfig.progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {run.status === "pending" ? "에이전트 실행을 준비하고 있습니다..." : "에이전트가 작업을 처리하고 있습니다..."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Input */}
          {run.inputJson && Object.keys(run.inputJson).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">입력 데이터</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(run.inputJson, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Output */}
          {run.outputJson && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">결과 데이터</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(run.outputJson, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Error */}
          {run.status === "failed" && run.errorMessage && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-base text-destructive">오류 정보</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{run.errorMessage}</p>
              </CardContent>
            </Card>
          )}

          {/* Usage Logs */}
          {usageLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">리소스 사용 내역</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {usageLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <p className="font-medium">{log.resourceType}</p>
                        <p className="text-xs text-muted-foreground">{log.resourceDetail}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatNumber(log.creditCost)} 크레딧</p>
                        <p className="text-xs text-muted-foreground">x{log.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">사용량 요약</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Coins className="h-4 w-4" />
                  {run.creditsActual != null ? "사용 크레딧" : "예약 크레딧"}
                </span>
                <span className="font-semibold">{formatNumber(credits)}</span>
              </div>
              {usageLogs.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Zap className="h-4 w-4" />
                    리소스 항목
                  </span>
                  <span className="font-semibold">{usageLogs.length}</span>
                </div>
              )}
              {durationStr && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    소요 시간
                  </span>
                  <span className="font-semibold">{durationStr}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">실행 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">실행 ID</span>
                <span className="font-mono text-xs">{run.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">설정 ID</span>
                <span className="font-mono text-xs">{run.agentConfigId.slice(0, 12)}...</span>
              </div>
              {run.startedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">시작 시간</span>
                  <span>{formatDateKST(run.startedAt)}</span>
                </div>
              )}
              {run.completedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">완료 시간</span>
                  <span>{formatDateKST(run.completedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
