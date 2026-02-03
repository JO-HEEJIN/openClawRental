import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";

interface CreditState {
  userId: string;
  totalCredits: number;
  usedCredits: number;
  reservedCredits: number;
}

/**
 * Durable Object for per-user credit balance consistency.
 * Source of truth during active operations (reservations, settlements).
 * D1 is synced transactionally and reconciled hourly.
 */
export class CreditBalanceDO extends DurableObject<Env> {
  private state: CreditState | null = null;

  private async loadState(): Promise<CreditState> {
    if (this.state) return this.state;

    const stored = await this.ctx.storage.get<CreditState>("credit_state");
    if (stored) {
      this.state = stored;
      return this.state;
    }

    this.state = {
      userId: "",
      totalCredits: 0,
      usedCredits: 0,
      reservedCredits: 0,
    };
    return this.state;
  }

  private async saveState(): Promise<void> {
    if (this.state) {
      await this.ctx.storage.put("credit_state", this.state);
    }
  }

  private availableCredits(s: CreditState): number {
    return s.totalCredits - s.usedCredits - s.reservedCredits;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      case "/balance": {
        const s = await this.loadState();
        return Response.json({
          totalCredits: s.totalCredits,
          usedCredits: s.usedCredits,
          reservedCredits: s.reservedCredits,
          availableCredits: this.availableCredits(s),
        });
      }

      case "/initialize": {
        const body = await request.json<{
          userId: string;
          totalCredits: number;
          usedCredits: number;
          reservedCredits: number;
        }>();
        this.state = {
          userId: body.userId,
          totalCredits: body.totalCredits,
          usedCredits: body.usedCredits,
          reservedCredits: body.reservedCredits,
        };
        await this.saveState();
        return Response.json({ success: true });
      }

      case "/grant": {
        const { amount } = await request.json<{ amount: number }>();
        const s = await this.loadState();
        s.totalCredits += amount;
        await this.saveState();
        return Response.json({
          success: true,
          availableCredits: this.availableCredits(s),
        });
      }

      case "/reserve": {
        const { amount } = await request.json<{ amount: number }>();
        const s = await this.loadState();
        if (this.availableCredits(s) < amount) {
          return Response.json({ success: false, error: "INSUFFICIENT_CREDITS" }, { status: 400 });
        }
        s.reservedCredits += amount;
        await this.saveState();
        return Response.json({
          success: true,
          reserved: amount,
          availableCredits: this.availableCredits(s),
        });
      }

      case "/settle": {
        const { reservedAmount, actualAmount } = await request.json<{
          reservedAmount: number;
          actualAmount: number;
        }>();
        const s = await this.loadState();
        s.reservedCredits -= reservedAmount;
        s.usedCredits += actualAmount;
        await this.saveState();
        return Response.json({
          success: true,
          availableCredits: this.availableCredits(s),
        });
      }

      case "/refund": {
        const { amount } = await request.json<{ amount: number }>();
        const s = await this.loadState();
        s.usedCredits = Math.max(0, s.usedCredits - amount);
        await this.saveState();
        return Response.json({
          success: true,
          availableCredits: this.availableCredits(s),
        });
      }

      default:
        return Response.json({ error: "Not found" }, { status: 404 });
    }
  }
}
