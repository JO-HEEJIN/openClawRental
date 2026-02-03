import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "AI 에이전트",
};

export default function AgentsPage() {
  // TODO: Implement agent marketplace UI in Task #12
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI 에이전트</h1>
      <Card>
        <CardHeader>
          <CardTitle>에이전트 마켓플레이스</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            API 연동 후 사용 가능한 AI 에이전트 목록이 표시됩니다. (Task #12에서 구현 예정)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
