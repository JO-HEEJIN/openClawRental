"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { formatNumber, formatDateKST, formatRelativeTimeKo } from "@/lib/format";
import type { AgentRun } from "@/types";

type RunStatus = "all" | "pending" | "running" | "completed" | "failed" | "cancelled";

const STATUS_META: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: "대기", icon: Clock, className: "text-muted-foreground" },
  running: { label: "실행 중", icon: Loader2, className: "text-blue-600" },
  completed: { label: "완료", icon: CheckCircle2, className: "text-green-600" },
  failed: { label: "실패", icon: XCircle, className: "text-destructive" },
  cancelled: { label: "취소", icon: XCircle, className: "text-muted-foreground" },
};

export default function RunsPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RunStatus>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const limit = 20;
      const offset = (page - 1) * limit;
      const statusParam = statusFilter !== "all" ? `&status=${statusFilter}` : "";
      const res = await api.get<{ runs: AgentRun[]; total: number }>(
        `/agents/runs?limit=${limit}&offset=${offset}${statusParam}`
      );
      if (res.success && res.data) {
        setRuns(res.data.runs);
        setTotal(res.data.total);
        setTotalPages(Math.max(1, Math.ceil(res.data.total / limit)));
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">실행 내역</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">총 {formatNumber(total)}건</span>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as RunStatus);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="running">실행 중</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
              <SelectItem value="failed">실패</SelectItem>
              <SelectItem value="cancelled">취소</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PlayCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              {statusFilter === "all"
                ? "아직 실행 내역이 없습니다. AI 에이전트를 실행해 보세요."
                : "해당 상태의 실행 내역이 없습니다."}
            </p>
            <Link href="/dashboard/agents">
              <Button variant="outline">에이전트 실행하기</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {runs.map((run) => {
              const meta = STATUS_META[run.status] || STATUS_META.pending;
              const StatusIcon = meta.icon;
              const credits = run.creditsActual ?? run.creditsReserved;
              return (
                <Link
                  key={run.id}
                  href={`/dashboard/runs/${run.id}`}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusIcon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        meta.className,
                        run.status === "running" && "animate-spin"
                      )}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {run.config?.name || run.agentConfigId.slice(0, 8)}
                        </p>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDateKST(run.createdAt)}
                        {run.durationMs != null && ` -- ${(run.durationMs / 1000).toFixed(1)}s`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium">{formatNumber(credits)} 크레딧</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTimeKo(run.createdAt)}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
