"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot } from "lucide-react";
import { api } from "@/lib/api";
import { AGENT_CATEGORIES } from "@/lib/constants";

const PLATFORMS = [
  { id: "youtube", label: "YouTube Shorts" },
  { id: "instagram", label: "Instagram Reels" },
  { id: "tiktok", label: "TikTok" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [step, setStep] = useState<"consent" | "profile">("consent");
  const [termsOfService, setTermsOfService] = useState(false);
  const [privacyPolicy, setPrivacyPolicy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [contentCategory, setContentCategory] = useState("");
  const [primaryPlatform, setPrimaryPlatform] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmitConsent = termsOfService && privacyPolicy;

  async function handleConsentSubmit() {
    if (!canSubmitConsent) return;
    setLoading(true);
    try {
      await api.post("/auth/consent", {
        termsOfService,
        privacyPolicy,
        marketing,
      });
      setStep("profile");
    } catch {
      // If API is not available yet, still proceed to profile step
      setStep("profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSubmit() {
    setLoading(true);
    try {
      if (contentCategory || primaryPlatform) {
        await api.post("/auth/profile", {
          contentCategory: contentCategory || undefined,
          primaryPlatform: primaryPlatform || undefined,
        });
      }
    } catch {
      // Non-critical, proceed regardless
    } finally {
      setLoading(false);
      router.push("/dashboard");
    }
  }

  function handleSkipProfile() {
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <Bot className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-2xl font-bold">
            {user?.firstName
              ? `${user.firstName}님, 환영합니다!`
              : "환영합니다!"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            서비스 이용을 위해 아래 사항을 확인해 주세요
          </p>
        </div>

        {step === "consent" && (
          <Card>
            <CardHeader>
              <CardTitle>약관 동의</CardTitle>
              <CardDescription>
                서비스 이용을 위해 필수 약관에 동의해 주세요
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsOfService}
                  onChange={(e) => setTermsOfService(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border"
                />
                <div>
                  <span className="text-sm font-medium">
                    이용약관 동의{" "}
                    <span className="text-destructive">(필수)</span>
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    OpenClaw 서비스 이용약관에 동의합니다.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyPolicy}
                  onChange={(e) => setPrivacyPolicy(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border"
                />
                <div>
                  <span className="text-sm font-medium">
                    개인정보 처리방침 동의{" "}
                    <span className="text-destructive">(필수)</span>
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    개인정보의 수집 및 이용에 동의합니다.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border"
                />
                <div>
                  <span className="text-sm font-medium">
                    마케팅 정보 수신 동의{" "}
                    <span className="text-muted-foreground">(선택)</span>
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    이벤트, 할인 등 마케팅 정보를 받아보실 수 있습니다.
                  </p>
                </div>
              </label>

              <Button
                className="w-full mt-4"
                disabled={!canSubmitConsent || loading}
                onClick={handleConsentSubmit}
              >
                {loading ? "처리 중..." : "동의하고 계속하기"}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "profile" && (
          <Card>
            <CardHeader>
              <CardTitle>프로필 설정</CardTitle>
              <CardDescription>
                더 나은 추천을 위해 알려주세요 (건너뛰기 가능)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category">주요 콘텐츠 카테고리</Label>
                <Select
                  value={contentCategory}
                  onValueChange={setContentCategory}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="카테고리 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.labelKo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform">주요 플랫폼</Label>
                <Select
                  value={primaryPlatform}
                  onValueChange={setPrimaryPlatform}
                >
                  <SelectTrigger id="platform">
                    <SelectValue placeholder="플랫폼 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSkipProfile}
                >
                  건너뛰기
                </Button>
                <Button
                  className="flex-1"
                  disabled={loading}
                  onClick={handleProfileSubmit}
                >
                  {loading ? "저장 중..." : "완료"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
