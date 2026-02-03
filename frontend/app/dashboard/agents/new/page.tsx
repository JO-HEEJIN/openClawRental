"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Bot, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import type { AgentTemplate } from "@/types";

export default function NewAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");

  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await api.get<{ templates: AgentTemplate[] }>("/agents/templates");
        if (res.success && res.data) {
          setTemplates(res.data.templates);
          if (templateId) {
            const found = res.data.templates.find((t) => t.id === templateId);
            if (found) {
              setSelectedTemplate(found);
              setName(found.nameKo);
            }
          }
        }
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, [templateId]);

  async function handleCreate() {
    if (!selectedTemplate || !name.trim()) return;

    setSubmitting(true);
    try {
      const res = await api.post<{ config: { id: string } }>("/agents/configs", {
        agentTemplateId: selectedTemplate.id,
        name: name.trim(),
        description: description.trim() || undefined,
        configJson: {},
      });

      if (res.success && res.data) {
        toast({ title: "에이전트 생성 완료", description: `${name} 에이전트가 생성되었습니다.` });
        router.push(`/dashboard/agents/${res.data.config.id}`);
      } else {
        toast({ title: "생성 실패", description: res.error?.message || "에이전트 생성에 실패했습니다.", variant: "destructive" });
      }
    } catch {
      toast({ title: "오류", description: "에이전트 생성 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" className="gap-1" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4" />
        뒤로
      </Button>

      <h1 className="text-2xl font-bold">새 에이전트 설정</h1>

      {/* Template Selection */}
      {!selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">템플릿 선택</CardTitle>
            <CardDescription>사용할 에이전트 템플릿을 선택하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setSelectedTemplate(t);
                    setName(t.nameKo);
                  }}
                >
                  <Bot className="h-8 w-8 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.nameKo}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.descriptionKo}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ~{formatNumber(t.estimatedCreditsPerRun)} 크레딧
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config Form */}
      {selectedTemplate && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">{selectedTemplate.nameKo}</CardTitle>
                <CardDescription className="text-xs">{selectedTemplate.descriptionKo}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름 <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="에이전트 설정 이름"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">설명</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="이 설정에 대한 간단한 설명 (선택)"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedTemplate(null);
                  setName("");
                  setDescription("");
                }}
              >
                템플릿 변경
              </Button>
              <Button disabled={!name.trim() || submitting} onClick={handleCreate}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  "에이전트 생성"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
