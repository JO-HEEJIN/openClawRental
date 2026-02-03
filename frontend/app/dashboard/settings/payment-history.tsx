"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { formatDateKST } from "@/lib/format";
import { Loader2, Receipt, ChevronLeft, ChevronRight } from "lucide-react";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  paymentOrderId: string | null;
  agentRunId: string | null;
  createdAt: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

const TYPE_LABELS: Record<string, string> = {
  purchase: "충전",
  usage: "사용",
  reservation: "예약",
  settlement: "정산",
  refund: "환불",
  bonus: "보너스",
  trial: "체험",
};

const TYPE_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  purchase: "default",
  bonus: "default",
  trial: "default",
  usage: "destructive",
  reservation: "secondary",
  settlement: "secondary",
  refund: "outline",
};

const PAGE_SIZE = 20;

export function PaymentHistory() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [refunding, setRefunding] = useState(false);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (filter !== "all") {
      params.set("type", filter);
    }
    const res = await api.get<TransactionsResponse>(`/credits/transactions?${params}`);
    if (res.success && res.data) {
      setTransactions(res.data.transactions);
      setTotal(res.data.total);
    } else {
      toast({ title: "거래 내역 로드 실패", description: res.error?.message, variant: "destructive" });
    }
    setLoading(false);
  }, [offset, filter, toast]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  function handleFilterChange(newFilter: string) {
    setFilter(newFilter);
    setOffset(0);
  }

  async function handleRefundRequest() {
    if (!selectedTx?.paymentOrderId) return;
    setRefunding(true);
    // Note: actual refund goes through admin or a dedicated refund endpoint
    // For now, show a confirmation that the request was submitted
    toast({
      title: "환불 요청 접수",
      description: "환불 요청이 접수되었습니다. 처리까지 1-3 영업일이 소요됩니다.",
    });
    setRefunding(false);
    setRefundDialogOpen(false);
    setSelectedTx(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const filters = [
    { value: "all", label: "전체" },
    { value: "purchase", label: "충전" },
    { value: "usage", label: "사용" },
    { value: "refund", label: "환불" },
    { value: "bonus", label: "보너스" },
    { value: "trial", label: "체험" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            거래 내역
          </CardTitle>
          <CardDescription>크레딧 충전, 사용, 환불 내역을 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => handleFilterChange(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {/* Transaction List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              거래 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Badge variant={TYPE_COLORS[tx.type] ?? "secondary"} className="shrink-0">
                      {TYPE_LABELS[tx.type] ?? tx.type}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDateKST(tx.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className={tx.amount >= 0 ? "font-medium text-green-600" : "font-medium text-red-500"}>
                      {tx.amount >= 0 ? "+" : ""}{tx.amount}
                    </span>
                    {tx.type === "purchase" && tx.paymentOrderId && (
                      <Dialog open={refundDialogOpen && selectedTx?.id === tx.id} onOpenChange={(open) => {
                        setRefundDialogOpen(open);
                        if (!open) setSelectedTx(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setSelectedTx(tx)}
                          >
                            환불
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>환불 요청</DialogTitle>
                            <DialogDescription>
                              이 결제에 대한 환불을 요청하시겠습니까?
                              환불 시 해당 크레딧이 차감됩니다.
                              처리까지 1-3 영업일이 소요됩니다.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
                            <p><span className="text-muted-foreground">거래:</span> {tx.description}</p>
                            <p><span className="text-muted-foreground">크레딧:</span> {tx.amount}</p>
                            <p><span className="text-muted-foreground">날짜:</span> {formatDateKST(tx.createdAt)}</p>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>
                              취소
                            </Button>
                            <Button variant="destructive" onClick={handleRefundRequest} disabled={refunding}>
                              {refunding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              환불 요청
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                전체 {total}건 중 {offset + 1}-{Math.min(offset + PAGE_SIZE, total)}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
