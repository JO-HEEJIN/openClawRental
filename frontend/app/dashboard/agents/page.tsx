"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot,
  Coins,
  Plus,
  Loader2,
  Sparkles,
  Image,
  Hash,
  Languages,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatNumber, formatRelativeTimeKo } from "@/lib/format";
import type { AgentTemplate, AgentConfig } from "@/types";

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType }> = {
  content: { label: "콘텐츠", icon: Sparkles },
  visual: { label: "비주얼", icon: Image },
  seo: { label: "SEO", icon: Hash },
  localization: { label: "현지화", icon: Languages },
};

const CONFIG_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "활성", className: "bg-green-100 text-green-800" },
  paused: { label: "일시정지", className: "bg-yellow-100 text-yellow-800" },
  archived: { label: "보관됨", className: "bg-gray-100 text-gray-600" },
};

export default function AgentsPage() {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [templatesRes, configsRes] = await Promise.all([
          api.get<{ templates: AgentTemplate[] }>("/agents/templates"),
          api.get<{ configs: AgentConfig[] }>("/agents/configs"),
        ]);
        if (templatesRes.success && templatesRes.data) setTemplates(templatesRes.data.templates);
        if (configsRes.success && configsRes.data) setConfigs(configsRes.data.configs);
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeConfigs = configs.filter((c) => c.status !== "archived");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI 에이전트</h1>

      <Tabs defaultValue="marketplace">
        <TabsList>
          <TabsTrigger value="marketplace">마켓플레이스</TabsTrigger>
          <TabsTrigger value="my-agents">내 에이전트 ({activeConfigs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            사용 가능한 AI 에이전트 템플릿을 선택하여 설정하세요.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => {
              const catMeta = CATEGORY_META[template.category] || CATEGORY_META.content;
              const CatIcon = catMeta.icon;
              return (
                <Card key={template.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Bot className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{template.nameKo}</CardTitle>
                          <CardDescription className="text-xs">{template.name}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <CatIcon className="h-3 w-3" />
                        {catMeta.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between gap-4">
                    <p className="text-sm text-muted-foreground">{template.descriptionKo}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Coins className="h-4 w-4" />
                        <span>~{formatNumber(template.estimatedCreditsPerRun)} 크레딧/실행</span>
                      </div>
                      <Link href={`/dashboard/agents/new?template=${template.id}`}>
                        <Button size="sm" className="gap-1">
                          <Plus className="h-3 w-3" />
                          설정하기
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="my-agents" className="space-y-4 mt-4">
          {activeConfigs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  아직 설정된 에이전트가 없습니다. 마켓플레이스에서 에이전트를 선택해 보세요.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeConfigs.map((config) => {
                const statusMeta = CONFIG_STATUS_LABELS[config.status] || CONFIG_STATUS_LABELS.active;
                return (
                  <Link key={config.id} href={`/dashboard/agents/${config.id}`}>
                    <Card className="hover:border-primary/50 transition-colors h-full">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{config.name}</CardTitle>
                            {config.templateName && (
                              <CardDescription className="text-xs mt-0.5">
                                {config.templateName}
                              </CardDescription>
                            )}
                          </div>
                          <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {config.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                            {config.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Coins className="h-3 w-3" />
                            ~{formatNumber(config.estimatedCreditsPerRun)} 크레딧/실행
                          </div>
                          <span>{formatRelativeTimeKo(config.createdAt)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
