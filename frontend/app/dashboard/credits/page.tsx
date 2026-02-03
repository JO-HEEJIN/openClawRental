import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "크레딧",
};

export default function CreditsPage() {
  // TODO: Implement credit purchase UI with PortOne V2 in Task #8
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">크레딧</h1>
      <Card>
        <CardHeader>
          <CardTitle>크레딧 충전</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            결제 연동 후 크레딧 패키지를 구매할 수 있습니다. (Task #8에서 구현 예정)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
