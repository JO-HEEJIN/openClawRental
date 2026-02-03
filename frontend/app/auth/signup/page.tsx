import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Bot } from "lucide-react";

export const metadata: Metadata = {
  title: "회원가입",
};

export default function SignUpPage() {
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
          <h1 className="text-2xl font-bold">회원가입</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            무료로 가입하고 100 크레딧을 받으세요
          </p>
        </div>
        <SignUp
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
          path="/auth/signup"
          signInUrl="/auth/login"
          forceRedirectUrl="/onboarding"
        />
        <p className="text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link href="/auth/login" className="text-primary underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
