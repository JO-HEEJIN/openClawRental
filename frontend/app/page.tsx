import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Zap, Shield, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">OpenClaw</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/auth/login">
              <Button variant="ghost">로그인</Button>
            </Link>
            <Link href="/auth/signup">
              <Button>무료로 시작하기</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex items-center">
        <div className="container mx-auto px-4 py-20 text-center">
          <Badge variant="secondary" className="mb-4">
            Beta 출시 - 가입 시 100 크레딧 무료 지급
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            숏폼 크리에이터를 위한
            <br />
            <span className="text-primary">AI 에이전트 플랫폼</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            쇼츠, 릴스, 틱톡 콘텐츠를 AI로 자동화하세요.
            <br />
            크레딧을 충전하고, 원하는 AI 에이전트를 선택해서 바로 실행하면 됩니다.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/auth/signup">
              <Button size="lg" className="text-lg px-8">
                무료로 시작하기
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" size="lg" className="text-lg px-8">
                더 알아보기
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            왜 OpenClaw인가요?
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <Bot className="h-10 w-10 text-primary mb-2" />
                <CardTitle>다양한 AI 에이전트</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                영상 편집, 자막 생성, 썸네일 제작 등 숏폼에 특화된 AI 에이전트를
                골라서 사용하세요.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Zap className="h-10 w-10 text-primary mb-2" />
                <CardTitle>종량제 크레딧</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                월정액 없이 필요한 만큼만 크레딧을 충전하세요. 9,900원부터
                시작할 수 있습니다.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary mb-2" />
                <CardTitle>안전한 결제</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                PortOne V2 기반의 안전한 결제 시스템. 카카오페이, 토스, 카드 결제를
                지원합니다.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Sparkles className="h-10 w-10 text-primary mb-2" />
                <CardTitle>한국 크리에이터 최적화</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                한국어 우선 UX, KST 시간대, 원화 표시 등 한국 크리에이터에 맞춘
                경험을 제공합니다.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 OpenClaw. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
