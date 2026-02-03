import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "실행 결과",
};

export default function RunDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // TODO: Implement run results UI in Task #12
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">실행 결과</h1>
      <Card>
        <CardHeader>
          <CardTitle>실행 ID: {params.id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            에이전트 실행 결과가 여기에 표시됩니다. (Task #12에서 구현 예정)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
