"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { formatDateKST } from "@/lib/format";
import { User, Mail, Shield, Loader2 } from "lucide-react";

interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  profileImageUrl?: string;
  role: string;
  locale: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
}

interface UserData {
  user: UserProfile;
  credits: {
    totalCredits: number;
    usedCredits: number;
    reservedCredits: number;
    availableCredits: number;
  } | null;
  consents: Record<string, boolean>;
}

export function ProfileSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    setLoading(true);
    const res = await api.get<UserData>("/auth/me");
    if (res.success && res.data) {
      setProfile(res.data.user);
      setDisplayName(res.data.user.displayName);
    } else {
      toast({ title: "프로필 로드 실패", description: res.error?.message, variant: "destructive" });
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!displayName.trim()) {
      toast({ title: "입력 오류", description: "표시 이름을 입력해주세요.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await api.post("/auth/profile", { displayName: displayName.trim() });
    if (res.success) {
      toast({ title: "저장 완료", description: "프로필이 업데이트되었습니다." });
      await loadProfile();
    } else {
      toast({ title: "저장 실패", description: res.error?.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleExportData() {
    setExporting(true);
    const res = await api.get<UserData>("/auth/me");
    if (res.success && res.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openclaw-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "내보내기 완료", description: "데이터가 다운로드되었습니다." });
    } else {
      toast({ title: "내보내기 실패", description: res.error?.message, variant: "destructive" });
    }
    setExporting(false);
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

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          프로필을 불러올 수 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            프로필 정보
          </CardTitle>
          <CardDescription>기본 프로필 설정을 관리합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">표시 이름</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="이름을 입력하세요"
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label>이메일</Label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{profile.email ?? "이메일 미설정"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>계정 유형</Label>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
                {profile.role === "admin" ? "관리자" : "일반 사용자"}
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>가입일</Label>
            <p className="text-sm text-muted-foreground">{formatDateKST(profile.createdAt)}</p>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleSave} disabled={saving || displayName === profile.displayName}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auth Connections */}
      <Card>
        <CardHeader>
          <CardTitle>연결된 계정</CardTitle>
          <CardDescription>소셜 로그인 연동 상태입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEE500]">
                <span className="text-sm font-bold text-[#391B1B]">K</span>
              </div>
              <div>
                <p className="text-sm font-medium">카카오</p>
                <p className="text-xs text-muted-foreground">
                  {profile.email ?? "연결됨"}
                </p>
              </div>
            </div>
            <Badge variant="secondary">연결됨</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Data Export (PIPA compliance) */}
      <Card>
        <CardHeader>
          <CardTitle>데이터 내보내기</CardTitle>
          <CardDescription>
            개인정보 보호법(PIPA)에 따라 저장된 개인 데이터를 내보낼 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExportData} disabled={exporting}>
            {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            내 데이터 내보내기 (JSON)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
