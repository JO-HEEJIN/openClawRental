"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";

interface NotificationPrefs {
  agentComplete: boolean;
  agentFailed: boolean;
  creditLow: boolean;
  creditPurchase: boolean;
  weeklyReport: boolean;
  marketing: boolean;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-input"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function NotificationSettings() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    agentComplete: true,
    agentFailed: true,
    creditLow: true,
    creditPurchase: true,
    weeklyReport: false,
    marketing: false,
  });

  function handleToggle(key: keyof NotificationPrefs) {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // In production, save to backend
      toast({
        title: next[key] ? "알림 켜짐" : "알림 꺼짐",
        description: `설정이 저장되었습니다.`,
      });
      return next;
    });
  }

  const sections = [
    {
      title: "에이전트 알림",
      items: [
        { key: "agentComplete" as const, label: "실행 완료", desc: "에이전트 실행이 완료되면 알림을 받습니다." },
        { key: "agentFailed" as const, label: "실행 실패", desc: "에이전트 실행이 실패하면 알림을 받습니다." },
      ],
    },
    {
      title: "크레딧 알림",
      items: [
        { key: "creditLow" as const, label: "잔액 부족", desc: "크레딧이 100 이하로 떨어지면 알림을 받습니다." },
        { key: "creditPurchase" as const, label: "충전 완료", desc: "크레딧 충전이 완료되면 알림을 받습니다." },
      ],
    },
    {
      title: "기타",
      items: [
        { key: "weeklyReport" as const, label: "주간 리포트", desc: "매주 사용 현황 요약을 받습니다." },
        { key: "marketing" as const, label: "마케팅 알림", desc: "이벤트, 프로모션, 신기능 안내를 받습니다." },
      ],
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          알림 설정
        </CardTitle>
        <CardDescription>받고 싶은 알림을 선택합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {sections.map((section, idx) => (
          <div key={section.title}>
            {idx > 0 && <Separator className="mb-6" />}
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">{section.title}</h3>
            <div className="space-y-4">
              {section.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">{item.label}</Label>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Toggle checked={prefs[item.key]} onChange={() => handleToggle(item.key)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
