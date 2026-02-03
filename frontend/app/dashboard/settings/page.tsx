import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "설정",
};

export default function SettingsPage() {
  // TODO: Implement settings UI in Task #13
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">설정</h1>
      <Card>
        <CardHeader>
          <CardTitle>계정 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            프로필, 인증, 알림, 결제 내역 등 설정이 여기에 표시됩니다. (Task #13에서 구현 예정)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
