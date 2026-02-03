import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot } from "lucide-react";

export const metadata: Metadata = {
  title: "로그인",
};

export default function LoginPage() {
  // TODO: Replace with Clerk <SignIn /> component in Task #4
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="flex items-center justify-center gap-2 mb-4">
            <Bot className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">OpenClaw</span>
          </Link>
          <CardTitle className="text-2xl">로그인</CardTitle>
          <CardDescription>
            계정에 로그인하여 AI 에이전트를 사용하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Clerk 인증이 연동되면 여기에 로그인 폼이 표시됩니다.
          </p>
          <div className="space-y-2">
            <Button className="w-full" disabled>
              카카오로 로그인
            </Button>
            <Button variant="outline" className="w-full" disabled>
              Google로 로그인
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            계정이 없으신가요?{" "}
            <Link href="/auth/signup" className="text-primary underline">
              회원가입
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
