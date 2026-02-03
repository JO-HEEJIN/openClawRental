import { generateId } from "../utils/ulid";
import type { PaymentStatus, PayMethod } from "../types";

export interface PaymentOrderRow {
  id: string;
  user_id: string;
  merchant_uid: string;
  imp_uid: string | null;
  package_code: string;
  amount_krw: number;
  credits_to_grant: number;
  pay_method: PayMethod | null;
  status: PaymentStatus;
  vbank_num: string | null;
  vbank_date: string | null;
  pg_provider: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PaymentOrderModel = {
  async findById(db: D1Database, id: string): Promise<PaymentOrderRow | null> {
    return db.prepare("SELECT * FROM payment_order WHERE id = ?").bind(id).first<PaymentOrderRow>();
  },

  async findByMerchantUid(db: D1Database, merchantUid: string): Promise<PaymentOrderRow | null> {
    return db
      .prepare("SELECT * FROM payment_order WHERE merchant_uid = ?")
      .bind(merchantUid)
      .first<PaymentOrderRow>();
  },

  async findByImpUid(db: D1Database, impUid: string): Promise<PaymentOrderRow | null> {
    return db
      .prepare("SELECT * FROM payment_order WHERE imp_uid = ?")
      .bind(impUid)
      .first<PaymentOrderRow>();
  },

  async create(
    db: D1Database,
    data: {
      userId: string;
      packageCode: string;
      amountKrw: number;
      creditsToGrant: number;
    }
  ): Promise<PaymentOrderRow> {
    const id = generateId();
    const merchantUid = `openclaw_${id}`;
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO payment_order (id, user_id, merchant_uid, package_code, amount_krw, credits_to_grant, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, data.userId, merchantUid, data.packageCode, data.amountKrw, data.creditsToGrant, now, now)
      .run();

    return (await PaymentOrderModel.findById(db, id))!;
  },

  async updateStatus(
    db: D1Database,
    id: string,
    data: {
      status: PaymentStatus;
      impUid?: string;
      payMethod?: PayMethod;
      pgProvider?: string;
      vbankNum?: string;
      vbankDate?: string;
      verifiedAt?: string;
    }
  ): Promise<void> {
    const sets = ["status = ?", "updated_at = datetime('now')"];
    const values: unknown[] = [data.status];
    if (data.impUid !== undefined) {
      sets.push("imp_uid = ?");
      values.push(data.impUid);
    }
    if (data.payMethod !== undefined) {
      sets.push("pay_method = ?");
      values.push(data.payMethod);
    }
    if (data.pgProvider !== undefined) {
      sets.push("pg_provider = ?");
      values.push(data.pgProvider);
    }
    if (data.vbankNum !== undefined) {
      sets.push("vbank_num = ?");
      values.push(data.vbankNum);
    }
    if (data.vbankDate !== undefined) {
      sets.push("vbank_date = ?");
      values.push(data.vbankDate);
    }
    if (data.verifiedAt !== undefined) {
      sets.push("verified_at = ?");
      values.push(data.verifiedAt);
    }
    values.push(id);
    await db.prepare(`UPDATE payment_order SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  },

  async listByUserId(
    db: D1Database,
    userId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<PaymentOrderRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const result = await db
      .prepare("SELECT * FROM payment_order WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(userId, limit, offset)
      .all<PaymentOrderRow>();
    return result.results;
  },
};
