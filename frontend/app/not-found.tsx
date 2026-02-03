import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold">404</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          페이지를 찾을 수 없습니다.
        </p>
        <Link href="/">
          <Button className="mt-6">홈으로 돌아가기</Button>
        </Link>
      </div>
    </div>
  );
}
