"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronRight } from "lucide-react";

export function AccountDeletion() {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          계정 삭제
        </CardTitle>
        <CardDescription>
          계정을 삭제하면 모든 데이터가 영구적으로 제거됩니다. 이 작업은 되돌릴 수 없습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-destructive/10 p-4 text-sm space-y-2">
          <p className="font-medium text-destructive">삭제 시 영구 제거되는 항목:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>프로필 및 계정 정보</li>
            <li>크레딧 잔액 (환불 불가)</li>
            <li>모든 에이전트 설정 및 실행 기록</li>
            <li>결제 내역 및 거래 기록</li>
            <li>생성된 콘텐츠 및 미디어 파일</li>
          </ul>
        </div>

        <div className="rounded-lg border p-4 text-sm space-y-2">
          <p className="font-medium">7일 유예 기간</p>
          <p className="text-muted-foreground">
            삭제 요청 후 7일간의 유예 기간이 있습니다.
            이 기간 내에 다시 로그인하면 삭제가 취소됩니다.
          </p>
        </div>

        <Link href="/dashboard/settings/delete-account">
          <Button variant="destructive" className="gap-2">
            계정 삭제 진행
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
