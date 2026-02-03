"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { AlertTriangle, ArrowLeft, Loader2, ShieldAlert } from "lucide-react";

export default function DeleteAccountPage() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { toast } = useToast();

  const [step, setStep] = useState<"info" | "reauth" | "confirm" | "done">("info");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reauthenticated, setReauthenticated] = useState(false);

  async function handleReauth() {
    // Clerk re-authentication: verify the user is who they say they are
    // In production, this would use Clerk's `user.verifySession()` or similar
    // For MVP, we verify by checking the current session is valid
    try {
      const res = await api.get("/auth/me");
      if (res.success) {
        setReauthenticated(true);
        setStep("confirm");
      } else {
        toast({
          title: "인증 실패",
          description: "세션이 만료되었습니다. 다시 로그인해주세요.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "인증 오류",
        description: "다시 시도해주세요.",
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (confirmText !== "DELETE" || !reauthenticated) return;

    setDeleting(true);
    const res = await api.delete("/auth/me");
    if (res.success) {
      setStep("done");
    } else {
      toast({
        title: "삭제 요청 실패",
        description: res.error?.message ?? "다시 시도해주세요.",
        variant: "destructive",
      });
      setDeleting(false);
    }
  }

  async function handleSignOutAndRedirect() {
    await signOut();
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/settings")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">계정 삭제</h1>
      </div>

      {/* Step 1: Information */}
      {step === "info" && (
        <div className="space-y-6">
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                계정 삭제 안내
              </CardTitle>
              <CardDescription>
                계정 삭제를 요청하기 전에 아래 내용을 반드시 확인하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-destructive/10 p-4 text-sm space-y-3">
                <p className="font-medium text-destructive">삭제 시 영구 제거되는 데이터:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1.5">
                  <li>프로필 및 계정 정보 (이름, 이메일, 프로필 사진)</li>
                  <li>크레딧 잔액 -- 남은 크레딧은 환불되지 않습니다</li>
                  <li>모든 에이전트 설정 및 실행 기록</li>
                  <li>결제 내역 및 크레딧 거래 기록</li>
                  <li>생성된 콘텐츠 (스크립트, 썸네일, SEO 데이터 등)</li>
                  <li>R2에 저장된 미디어 파일</li>
                  <li>동의 기록</li>
                </ul>
              </div>

              <Separator />

              <div className="rounded-lg border p-4 text-sm space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  7일 유예 기간
                </p>
                <p className="text-muted-foreground">
                  삭제 요청 후 7일간의 유예 기간이 있습니다.
                  이 기간 내에 다시 로그인하면 삭제 요청이 자동으로 취소됩니다.
                  7일이 지나면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
                </p>
              </div>

              <div className="rounded-lg border p-4 text-sm space-y-2">
                <p className="font-medium">삭제 전 권장 사항</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-sm"
                      onClick={() => router.push("/dashboard/settings")}
                    >
                      설정 &gt; 프로필
                    </Button>
                    에서 데이터 내보내기를 먼저 진행하세요
                  </li>
                  <li>남은 크레딧이 있다면 환불을 먼저 요청하세요</li>
                  <li>필요한 콘텐츠를 미리 다운로드하세요</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => router.push("/dashboard/settings")}>
                  돌아가기
                </Button>
                <Button variant="destructive" onClick={() => setStep("reauth")}>
                  계속 진행
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Re-authentication */}
      {step === "reauth" && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              본인 확인
            </CardTitle>
            <CardDescription>
              보안을 위해 계정 삭제 전 본인 인증이 필요합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              현재 세션을 통해 본인 확인을 진행합니다.
              아래 버튼을 클릭하여 인증을 완료하세요.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("info")}>
                뒤로
              </Button>
              <Button onClick={handleReauth}>
                본인 확인
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Type DELETE confirmation */}
      {step === "confirm" && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              최종 확인
            </CardTitle>
            <CardDescription>
              이 작업은 되돌릴 수 없습니다. 확인을 위해 아래에 DELETE를 입력하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="text-muted-foreground">
                계정 삭제를 확인하려면 아래 입력란에 영문 대문자로{" "}
                <span className="font-mono font-bold text-destructive">DELETE</span>를
                정확히 입력하세요.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmDelete">확인 입력</Label>
              <Input
                id="confirmDelete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className="font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setStep("reauth"); setConfirmText(""); }}>
                뒤로
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || deleting}
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                계정 영구 삭제
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === "done" && (
        <Card>
          <CardHeader>
            <CardTitle>삭제 요청이 접수되었습니다</CardTitle>
            <CardDescription>
              7일 후 계정과 모든 데이터가 영구 삭제됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 text-sm space-y-2">
              <p className="font-medium">유예 기간 안내</p>
              <p className="text-muted-foreground">
                7일 이내에 다시 로그인하면 삭제 요청이 자동으로 취소됩니다.
                7일이 지나면 모든 데이터가 영구 삭제되며 복구할 수 없습니다.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSignOutAndRedirect}>
                로그아웃 후 홈으로
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
