"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  ArrowLeft,
  Coins,
  PlayCircle,
  Loader2,
  AlertTriangle,
  CreditCard,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { formatNumber, formatDateKST } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import type { AgentConfig, AgentRun, CreditBalance } from "@/types";

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState(0);
  const [inputJson, setInputJson] = useState("{}");

  useEffect(() => {
    async function fetchData() {
      try {
        const [configRes, balanceRes, runsRes] = await Promise.all([
          api.get<{ config: AgentConfig }>(`/agents/configs/${params.id}`),
          api.get<CreditBalance>("/credits/balance"),
          api.get<{ runs: AgentRun[]; total: number }>(`/agents/runs?limit=10`),
        ]);
        if (configRes.success && configRes.data) setConfig(configRes.data.config);
        if (balanceRes.success && balanceRes.data) setBalance(balanceRes.data.availableCredits);
        if (runsRes.success && runsRes.data) {
          setRuns(runsRes.data.runs.filter((r) => r.agentConfigId === params.id));
        }
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [params.id]);

  const hasEnoughCredits = config ? balance >= config.estimatedCreditsPerRun : false;

  async function handleRun() {
    if (!config || !hasEnoughCredits) return;

    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = JSON.parse(inputJson);
    } catch {
      toast({ title: "입력 오류", description: "유효한 JSON 형식이 아닙니다.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ runId: string; creditsReserved: number; status: string }>(
        "/agents/runs",
        { agentConfigId: config.id, input: parsedInput }
      );

      if (res.success && res.data) {
        toast({ title: "실행 시작", description: `에이전트 실행이 시작되었습니다. (${formatNumber(res.data.creditsReserved)} 크레딧 예약)` });
        router.push(`/dashboard/runs/${res.data.runId}`);
      } else {
        toast({ title: "실행 실패", description: res.error?.message || "에이전트 실행에 실패했습니다.", variant: "destructive" });
      }
    } catch {
      toast({ title: "오류", description: "에이전트 실행 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!config) return;
    const res = await api.delete<{ message: string }>(`/agents/configs/${config.id}`);
    if (res.success) {
      toast({ title: "보관됨", description: "에이전트 설정이 보관되었습니다." });
      router.push("/dashboard/agents");
    } else {
      toast({ title: "오류", description: res.error?.message || "보관 처리에 실패했습니다.", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" className="gap-1" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          뒤로
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">에이전트 설정을 찾을 수 없습니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const balanceAfterRun = balance - config.estimatedCreditsPerRun;

  return (
    <div className="space-y-6">
      <Button variant="ghost" className="gap-1" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4" />
        에이전트 목록
      </Button>

      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <Bot className="h-7 w-7 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{config.name}</h1>
            <Badge variant={config.status === "active" ? "default" : "secondary"}>
              {config.status === "active" ? "활성" : config.status === "paused" ? "일시정지" : "보관됨"}
            </Badge>
          </div>
          {config.templateName && (
            <p className="text-sm text-muted-foreground mt-0.5">{config.templateName}</p>
          )}
          {config.description && (
            <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Coins className="h-4 w-4" />
              ~{formatNumber(config.estimatedCreditsPerRun)} 크레딧/실행
            </span>
            <span>생성: {formatDateKST(config.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Config JSON */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">현재 설정</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(config.configJson, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Run Input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">실행 입력</CardTitle>
              <CardDescription>에이전트 실행에 전달할 입력 데이터 (JSON)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="input-json">입력 JSON</Label>
                <textarea
                  id="input-json"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={inputJson}
                  onChange={(e) => setInputJson(e.target.value)}
                  placeholder='{"topic": "겨울 브이로그", "style": "casual"}'
                />
              </div>
            </CardContent>
          </Card>

          {/* Recent Runs for this config */}
          {runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">최근 실행 이력</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {runs.map((run) => (
                    <Link
                      key={run.id}
                      href={`/dashboard/runs/${run.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-xs">
                          {run.status === "completed" ? "완료" :
                           run.status === "running" ? "실행 중" :
                           run.status === "failed" ? "실패" :
                           run.status === "cancelled" ? "취소" : "대기"}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatDateKST(run.createdAt)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatNumber(run.creditsActual ?? run.creditsReserved)} 크레딧
                      </span>
                    </Link>
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
              <CardTitle className="text-base">비용 프리뷰</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">예상 크레딧</span>
                <span className="font-semibold">{formatNumber(config.estimatedCreditsPerRun)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">현재 잔액</span>
                <span className={cn("font-semibold", !hasEnoughCredits && "text-destructive")}>
                  {formatNumber(balance)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">실행 후 잔액</span>
                <span className={cn("font-semibold", balanceAfterRun < 0 && "text-destructive")}>
                  {hasEnoughCredits ? formatNumber(balanceAfterRun) : "-"}
                </span>
              </div>
            </CardContent>
          </Card>

          {!hasEnoughCredits && (
            <Card className="border-destructive bg-destructive/5">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">크레딧 부족</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(config.estimatedCreditsPerRun - balance)} 크레딧이 더 필요합니다.
                </p>
                <Link href="/dashboard/credits">
                  <Button size="sm" className="w-full gap-1">
                    <CreditCard className="h-3.5 w-3.5" />
                    크레딧 충전하기
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!hasEnoughCredits || submitting || config.status !== "active"}
            onClick={handleRun}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                실행 중...
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 h-4 w-4" />
                에이전트 실행 ({formatNumber(config.estimatedCreditsPerRun)} 크레딧)
              </>
            )}
          </Button>

          <Button variant="outline" className="w-full gap-1 text-destructive" onClick={handleArchive}>
            <Trash2 className="h-4 w-4" />
            에이전트 보관
          </Button>
        </div>
      </div>
    </div>
  );
}
