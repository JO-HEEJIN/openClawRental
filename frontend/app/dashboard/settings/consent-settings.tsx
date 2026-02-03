"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Loader2, FileCheck, ExternalLink } from "lucide-react";

interface ConsentState {
  terms_of_service: boolean;
  privacy_policy: boolean;
  marketing: boolean;
}

const CONSENT_VERSION = "1.0";

export function ConsentSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentState>({
    terms_of_service: false,
    privacy_policy: false,
    marketing: false,
  });

  useEffect(() => {
    loadConsents();
  }, []);

  async function loadConsents() {
    setLoading(true);
    const res = await api.get<{ user: unknown; credits: unknown; consents: Record<string, boolean> }>("/auth/me");
    if (res.success && res.data) {
      setConsents({
        terms_of_service: res.data.consents.terms_of_service ?? false,
        privacy_policy: res.data.consents.privacy_policy ?? false,
        marketing: res.data.consents.marketing ?? false,
      });
    }
    setLoading(false);
  }

  async function toggleConsent(type: keyof ConsentState) {
    // Terms and privacy cannot be withdrawn (required)
    if ((type === "terms_of_service" || type === "privacy_policy") && consents[type]) {
      toast({
        title: "필수 동의",
        description: "이용약관 및 개인정보 처리방침 동의는 철회할 수 없습니다. 계정 삭제를 통해 처리됩니다.",
        variant: "destructive",
      });
      return;
    }

    const newValue = !consents[type];
    setSaving(type);

    const res = await api.post("/auth/consent", {
      consentType: type,
      consentVersion: CONSENT_VERSION,
      granted: newValue,
    });

    if (res.success) {
      setConsents((prev) => ({ ...prev, [type]: newValue }));
      toast({
        title: newValue ? "동의 완료" : "동의 철회",
        description: newValue
          ? "동의가 기록되었습니다."
          : "마케팅 수신 동의가 철회되었습니다.",
      });
    } else {
      toast({ title: "처리 실패", description: res.error?.message, variant: "destructive" });
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck className="h-5 w-5" />
          동의 관리
        </CardTitle>
        <CardDescription>
          서비스 이용 관련 동의 항목을 관리합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Terms of Service */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="font-medium">이용약관</Label>
              <span className="text-xs text-destructive">(필수)</span>
            </div>
            <p className="text-xs text-muted-foreground">서비스 이용에 필수적인 약관입니다.</p>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs">
              전문 보기 <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <Button
            variant={consents.terms_of_service ? "default" : "outline"}
            size="sm"
            disabled
          >
            {consents.terms_of_service ? "동의함" : "미동의"}
          </Button>
        </div>

        {/* Privacy Policy */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="font-medium">개인정보 처리방침</Label>
              <span className="text-xs text-destructive">(필수)</span>
            </div>
            <p className="text-xs text-muted-foreground">개인정보 수집 및 이용에 관한 동의입니다.</p>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs">
              전문 보기 <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <Button
            variant={consents.privacy_policy ? "default" : "outline"}
            size="sm"
            disabled
          >
            {consents.privacy_policy ? "동의함" : "미동의"}
          </Button>
        </div>

        <Separator />

        {/* Marketing */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="font-medium">마케팅 수신 동의</Label>
              <span className="text-xs text-muted-foreground">(선택)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              이벤트, 프로모션, 신기능 안내 등 마케팅 정보를 받습니다.
            </p>
          </div>
          <Button
            variant={consents.marketing ? "default" : "outline"}
            size="sm"
            onClick={() => toggleConsent("marketing")}
            disabled={saving === "marketing"}
          >
            {saving === "marketing" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            {consents.marketing ? "동의함" : "동의하기"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
