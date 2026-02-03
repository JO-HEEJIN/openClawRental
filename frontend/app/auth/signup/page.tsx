import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot } from "lucide-react";

export const metadata: Metadata = {
  title: "회원가입",
};

export default function SignUpPage() {
  // TODO: Replace with Clerk <SignUp /> component in Task #4
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="flex items-center justify-center gap-2 mb-4">
            <Bot className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">OpenClaw</span>
          </Link>
          <CardTitle className="text-2xl">회원가입</CardTitle>
          <CardDescription>
            무료로 가입하고 100 크레딧을 받으세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Clerk 인증이 연동되면 여기에 회원가입 폼이 표시됩니다.
          </p>
          <div className="space-y-2">
            <Button className="w-full" disabled>
              카카오로 시작하기
            </Button>
            <Button variant="outline" className="w-full" disabled>
              Google로 시작하기
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <Link href="/auth/login" className="text-primary underline">
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
