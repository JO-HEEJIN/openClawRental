import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Bot } from "lucide-react";

export const metadata: Metadata = {
  title: "로그인",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 mb-6"
          >
            <Bot className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">OpenClaw</span>
          </Link>
          <h1 className="text-2xl font-bold">로그인</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            계정에 로그인하여 AI 에이전트를 사용하세요
          </p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto w-full",
              card: "shadow-none border rounded-lg",
              socialButtonsBlockButton:
                "font-medium",
              socialButtonsBlockButtonText: "font-medium",
              formButtonPrimary:
                "bg-primary hover:bg-primary/90 text-primary-foreground",
            },
          }}
          routing="path"
          path="/auth/login"
          signUpUrl="/auth/signup"
          forceRedirectUrl="/dashboard"
        />
        <p className="text-center text-sm text-muted-foreground">
          계정이 없으신가요?{" "}
          <Link href="/auth/signup" className="text-primary underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
