"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Coins,
  CreditCard,
  Building2,
  Wallet,
  Landmark,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { CREDIT_PACKAGES, PORTONE_STORE_ID, PAY_METHODS } from "@/lib/constants";
import { formatKRW, formatNumber, formatDateKST } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import type {
  CreditBalance,
  CreditPackage,
  CreditTransaction,
  PayMethod,
  TransactionFilter,
  PortOnePaymentResponse,
} from "@/types";

const PAY_METHOD_ICONS: Record<string, React.ElementType> = {
  card: CreditCard,
  trans: Building2,
  kakaopay: Wallet,
  naverpay: Wallet,
  tosspay: Wallet,
  vbank: Landmark,
};

const TX_TYPE_LABELS: Record<string, string> = {
  purchase: "충전",
  usage: "사용",
  refund: "환불",
  bonus: "보너스",
  trial: "체험판",
};

const TX_TYPE_COLORS: Record<string, string> = {
  purchase: "text-green-600",
  usage: "text-destructive",
  refund: "text-blue-600",
  bonus: "text-primary",
  trial: "text-blue-600",
};

declare global {
  interface Window {
    IMP?: {
      init: (storeId: string) => void;
      request_pay: (
        params: Record<string, unknown>,
        callback: (response: PortOnePaymentResponse) => void
      ) => void;
    };
  }
}

export default function CreditsPage() {
  const [selectedPkg, setSelectedPkg] = useState<CreditPackage | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [paying, setPaying] = useState(false);
  const [balance, setBalance] = useState<CreditBalance | null>(null);

  const [vbankInfo, setVbankInfo] = useState<{
    num: string;
    name: string;
    deadline: string;
  } | null>(null);

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [txFilter, setTxFilter] = useState<TransactionFilter>("all");
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txLoading, setTxLoading] = useState(false);

  const purchasablePackages = CREDIT_PACKAGES.filter((p) => p.price > 0);

  useEffect(() => {
    if (document.getElementById("iamport-sdk")) return;
    const script = document.createElement("script");
    script.id = "iamport-sdk";
    script.src = "https://cdn.iamport.kr/v1/iamport.js";
    script.async = true;
    script.onload = () => {
      if (window.IMP && PORTONE_STORE_ID) {
        window.IMP.init(PORTONE_STORE_ID);
      }
    };
    document.head.appendChild(script);
  }, []);

  const fetchBalance = useCallback(async () => {
    const res = await api.get<CreditBalance>("/credits/balance");
    if (res.success && res.data) setBalance(res.data);
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const limit = 10;
      const offset = (txPage - 1) * limit;
      const filter = txFilter === "all" ? "" : `&type=${txFilter}`;
      const res = await api.get<{ transactions: CreditTransaction[]; total: number; limit: number; offset: number }>(
        `/credits/transactions?limit=${limit}&offset=${offset}${filter}`
      );
      if (res.success && res.data) {
        setTransactions(res.data.transactions);
        setTxTotalPages(Math.max(1, Math.ceil(res.data.total / limit)));
      }
    } catch {
      // API not available
    } finally {
      setTxLoading(false);
    }
  }, [txPage, txFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  async function handlePayment() {
    if (!selectedPkg) return;
    if (!window.IMP) {
      toast({ title: "결제 오류", description: "결제 모듈을 불러올 수 없습니다.", variant: "destructive" });
      return;
    }
    if (selectedPkg.price === 0) return;

    setPaying(true);
    setVbankInfo(null);

    try {
      // Step 1: Create payment order on backend (server generates merchant_uid)
      const prepRes = await api.post<{
        type: string;
        orderId: string;
        merchantUid: string;
        amount: number;
        packageName: string;
        creditsToGrant: number;
      }>("/credits/prepare", { packageCode: selectedPkg.id });

      if (!prepRes.success || !prepRes.data) {
        toast({ title: "결제 준비 실패", description: prepRes.error?.message || "결제 준비에 실패했습니다.", variant: "destructive" });
        setPaying(false);
        return;
      }

      const { merchantUid, amount, packageName } = prepRes.data;

      // Step 2-3: Call PortOne SDK with server-generated merchantUid
      let pg = "html5_inicis";
      if (payMethod === "kakaopay") pg = "kakaopay";
      else if (payMethod === "naverpay") pg = "naverpay";
      else if (payMethod === "tosspay") pg = "tosspay";

      window.IMP.request_pay(
        {
          pg,
          pay_method: payMethod,
          merchant_uid: merchantUid,
          name: `OpenClaw ${packageName}`,
          amount,
          currency: "KRW",
          buyer_email: "",
          m_redirect_url: `${window.location.origin}/dashboard/credits`,
        },
        async (response: PortOnePaymentResponse) => {
          if (response.error_msg) {
            setPaying(false);
            toast({ title: "결제 실패", description: response.error_msg, variant: "destructive" });
            return;
          }

          if (payMethod === "vbank" && response.vbank_num && response.vbank_name) {
            setVbankInfo({
              num: response.vbank_num,
              name: response.vbank_name,
              deadline: response.vbank_date
                ? new Date(response.vbank_date * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
                : "",
            });
          }

          // Step 4-6: Server-side verification and credit grant
          try {
            const verifyRes = await api.post<{
              orderId: string;
              creditsGranted: number;
              balance: CreditBalance;
            }>("/credits/verify", {
              impUid: response.imp_uid,
              merchantUid: response.merchant_uid,
            });

            if (verifyRes.success && verifyRes.data) {
              setBalance(verifyRes.data.balance);
              toast({
                title: "결제 완료",
                description: `${formatNumber(verifyRes.data.creditsGranted)} 크레딧이 충전되었습니다.`,
              });
              fetchTransactions();
            } else {
              toast({
                title: "결제 확인 실패",
                description: verifyRes.error?.message || "결제 확인에 실패했습니다. 고객센터에 문의해 주세요.",
                variant: "destructive",
              });
            }
          } catch {
            toast({ title: "서버 오류", description: "결제 확인 중 오류가 발생했습니다.", variant: "destructive" });
          } finally {
            setPaying(false);
          }
        }
      );
    } catch {
      toast({ title: "결제 오류", description: "결제 처리 중 오류가 발생했습니다.", variant: "destructive" });
      setPaying(false);
    }
  }

  const availableCredits = balance?.availableCredits ?? 0;

  const balanceClass =
    availableCredits === 0
      ? "text-destructive"
      : availableCredits < 10
        ? "text-destructive"
        : availableCredits < 50
          ? "text-yellow-600"
          : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">크레딧</h1>
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-muted-foreground" />
          <span className={cn("text-xl font-bold", balanceClass)}>
            {formatNumber(availableCredits)}
          </span>
          <span className="text-sm text-muted-foreground">크레딧</span>
        </div>
      </div>

      {availableCredits < 50 && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3",
            availableCredits === 0
              ? "border-destructive bg-destructive/5"
              : availableCredits < 10
                ? "border-destructive bg-destructive/5"
                : "border-yellow-500 bg-yellow-500/5"
          )}
        >
          <AlertTriangle
            className={cn(
              "h-4 w-4 shrink-0",
              availableCredits < 10 ? "text-destructive" : "text-yellow-600"
            )}
          />
          <span className="text-sm">
            {availableCredits === 0
              ? "크레딧이 없습니다. 에이전트를 실행하려면 크레딧을 충전해 주세요."
              : availableCredits < 10
                ? "크레딧이 10 미만입니다. 곧 실행이 중단될 수 있습니다."
                : "크레딧이 50 미만입니다. 충전을 권장합니다."}
          </span>
        </div>
      )}

      <Tabs defaultValue="purchase">
        <TabsList>
          <TabsTrigger value="purchase">크레딧 충전</TabsTrigger>
          <TabsTrigger value="history">거래 내역</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase" className="space-y-6 mt-4">
          <div>
            <h2 className="text-lg font-semibold mb-3">패키지 선택</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {purchasablePackages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={cn(
                    "cursor-pointer transition-all relative",
                    selectedPkg?.id === pkg.id
                      ? "ring-2 ring-primary"
                      : "hover:border-primary/50"
                  )}
                  onClick={() => setSelectedPkg(pkg)}
                >
                  {pkg.popular && (
                    <Badge className="absolute -top-2.5 left-4">인기</Badge>
                  )}
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{pkg.nameKo}</CardTitle>
                    <CardDescription>{pkg.name}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold">
                      {formatKRW(pkg.price)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatNumber(pkg.credits)} 크레딧
                      {pkg.bonusCredits > 0 && (
                        <span className="text-primary">
                          {" "}+ {formatNumber(pkg.bonusCredits)} 보너스
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      총 {formatNumber(pkg.totalCredits)} 크레딧 (VAT 포함)
                    </div>
                    {selectedPkg?.id === pkg.id && (
                      <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {selectedPkg && (
            <>
              <Separator />
              <div>
                <h2 className="text-lg font-semibold mb-3">결제 수단</h2>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                  {PAY_METHODS.map((method) => {
                    const Icon = PAY_METHOD_ICONS[method.id] || Wallet;
                    return (
                      <Button
                        key={method.id}
                        variant={payMethod === method.id ? "default" : "outline"}
                        className="justify-start gap-2 h-11"
                        onClick={() => setPayMethod(method.id as PayMethod)}
                      >
                        <Icon className="h-4 w-4" />
                        {method.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <Separator />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">결제 요약</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">패키지</span>
                    <span className="font-medium">{selectedPkg.nameKo} ({selectedPkg.name})</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">크레딧</span>
                    <span>
                      {formatNumber(selectedPkg.credits)}
                      {selectedPkg.bonusCredits > 0 && ` + ${formatNumber(selectedPkg.bonusCredits)} 보너스`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">결제 수단</span>
                    <span>{PAY_METHODS.find((m) => m.id === payMethod)?.label}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-semibold">결제 금액</span>
                    <span className="text-lg font-bold">{formatKRW(selectedPkg.price)}</span>
                  </div>
                  <Button className="w-full mt-2" size="lg" disabled={paying} onClick={handlePayment}>
                    {paying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        결제 처리 중...
                      </>
                    ) : (
                      `${formatKRW(selectedPkg.price)} 결제하기`
                    )}
                  </Button>
                </CardContent>
              </Card>
              {vbankInfo && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardHeader>
                    <CardTitle className="text-base">가상계좌 입금 정보</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">은행명</span>
                      <span className="font-medium">{vbankInfo.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">계좌번호</span>
                      <span className="font-mono font-medium">{vbankInfo.num}</span>
                    </div>
                    {vbankInfo.deadline && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">입금기한</span>
                        <span className="font-medium">{vbankInfo.deadline}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      입금 확인 후 크레딧이 자동으로 충전됩니다.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">거래 내역</h2>
            <Select
              value={txFilter}
              onValueChange={(v) => {
                setTxFilter(v as TransactionFilter);
                setTxPage(1);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="purchase">충전</SelectItem>
                <SelectItem value="usage">사용</SelectItem>
                <SelectItem value="refund">환불</SelectItem>
                <SelectItem value="bonus">보너스</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {txLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">거래 내역이 없습니다.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {TX_TYPE_LABELS[tx.type] || tx.type}
                        </Badge>
                        <span className="text-sm">{tx.description}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDateKST(tx.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-semibold", TX_TYPE_COLORS[tx.type])}>
                        {tx.amount > 0 ? "+" : ""}{formatNumber(tx.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        잔액 {formatNumber(tx.balanceAfter)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {txTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" size="icon" disabled={txPage <= 1} onClick={() => setTxPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{txPage} / {txTotalPages}</span>
                  <Button variant="outline" size="icon" disabled={txPage >= txTotalPages} onClick={() => setTxPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
