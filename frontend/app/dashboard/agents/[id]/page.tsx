import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "에이전트 상세",
};

export default function AgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // TODO: Implement agent detail + configuration UI in Task #12
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">에이전트 상세</h1>
      <Card>
        <CardHeader>
          <CardTitle>에이전트 ID: {params.id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            에이전트 상세 정보 및 설정 UI가 여기에 표시됩니다. (Task #12에서 구현 예정)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
