import { Hono } from "hono";
import type { Env, AuthUser } from "../types";
import { UserModel } from "../models/user";
import { PaymentOrderModel } from "../models/payment-order";
import { CreditBalanceModel } from "../models/credit-balance";
import { grantCredits } from "../services/credit";
import { AppError } from "../middleware/error-handler";

const admin = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// GET /admin/users - List users (paginated)
admin.get("/users", async (c) => {
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

  const result = await UserModel.list(c.env.DB, { limit, offset });

  return c.json({
    success: true,
    data: {
      users: await Promise.all(
        result.results.map(async (user) => {
          const balance = await CreditBalanceModel.findByUserId(c.env.DB, user.id);
          return {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            role: user.role,
            isActive: user.is_active === 1,
            credits: balance
              ? {
                  total: balance.total_credits,
                  used: balance.used_credits,
                  reserved: balance.reserved_credits,
                  available: balance.available_credits,
                }
              : null,
            createdAt: user.created_at,
          };
        })
      ),
      total: result.total,
      limit,
      offset,
    },
  });
});

// POST /admin/refunds - Process refund for a payment order
admin.post("/refunds", async (c) => {
  const body = await c.req.json<{
    paymentOrderId: string;
    reason?: string;
  }>();

  if (!body.paymentOrderId) {
    throw new AppError(400, "BAD_REQUEST", "paymentOrderId is required");
  }

  const order = await PaymentOrderModel.findById(c.env.DB, body.paymentOrderId);
  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Payment order not found");
  }

  if (order.status !== "paid") {
    throw new AppError(400, "INVALID_STATUS", `Cannot refund order with status ${order.status}`);
  }

  // Update order status to refunded
  await PaymentOrderModel.updateStatus(c.env.DB, order.id, {
    status: "refunded",
  });

  // TODO: Call PortOne refund API for actual PG refund
  // For now, just update the status and deduct credits

  // Deduct the granted credits (negative grant = deduction)
  // We use the DO refund endpoint which reduces usedCredits
  // But for a refund, we actually need to reduce totalCredits
  const balance = await CreditBalanceModel.findByUserId(c.env.DB, order.user_id);
  if (balance) {
    // Reduce total credits by the amount granted
    await c.env.DB
      .prepare(
        `UPDATE credit_balance SET total_credits = MAX(0, total_credits - ?), updated_at = datetime('now') WHERE user_id = ?`
      )
      .bind(order.credits_to_grant, order.user_id)
      .run();
  }

  const adminUser = c.get("user");
  return c.json({
    success: true,
    data: {
      message: "Refund processed",
      orderId: order.id,
      amountKrw: order.amount_krw,
      creditsDeducted: order.credits_to_grant,
      processedBy: adminUser.email,
    },
  });
});

// GET /admin/payments - List all payments (paginated)
admin.get("/payments", async (c) => {
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  const status = url.searchParams.get("status");

  let query = "SELECT * FROM payment_order";
  const binds: unknown[] = [];
  if (status) {
    query += " WHERE status = ?";
    binds.push(status);
  }
  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const countQuery = status
    ? "SELECT COUNT(*) as cnt FROM payment_order WHERE status = ?"
    : "SELECT COUNT(*) as cnt FROM payment_order";
  const countBinds = status ? [status] : [];

  const [results, countResult] = await Promise.all([
    c.env.DB.prepare(query).bind(...binds).all(),
    c.env.DB.prepare(countQuery).bind(...countBinds).first<{ cnt: number }>(),
  ]);

  return c.json({
    success: true,
    data: {
      payments: results.results.map((p: Record<string, unknown>) => ({
        id: p.id,
        userId: p.user_id,
        merchantUid: p.merchant_uid,
        impUid: p.imp_uid,
        packageCode: p.package_code,
        amountKrw: p.amount_krw,
        creditsToGrant: p.credits_to_grant,
        payMethod: p.pay_method,
        status: p.status,
        pgProvider: p.pg_provider,
        createdAt: p.created_at,
      })),
      total: countResult?.cnt ?? 0,
      limit,
      offset,
    },
  });
});

// POST /admin/credits/grant - Grant credits to a user (admin bonus)
admin.post("/credits/grant", async (c) => {
  const body = await c.req.json<{
    userId: string;
    amount: number;
    reason: string;
  }>();

  if (!body.userId || !body.amount || !body.reason) {
    throw new AppError(400, "BAD_REQUEST", "userId, amount, and reason are required");
  }

  if (body.amount <= 0 || body.amount > 100000) {
    throw new AppError(400, "INVALID_AMOUNT", "Amount must be between 1 and 100,000");
  }

  // Verify user exists
  const user = await UserModel.findById(c.env.DB, body.userId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  // Ensure credit balance exists
  await CreditBalanceModel.initialize(c.env.DB, body.userId);

  // Grant credits
  const balance = await grantCredits(c.env.DB, body.userId, body.amount, {
    type: "bonus",
    description: `Admin grant: ${body.reason}`,
  });

  const adminUser = c.get("user");
  return c.json({
    success: true,
    data: {
      message: "Credits granted",
      userId: body.userId,
      amount: body.amount,
      balance,
      grantedBy: adminUser.email,
    },
  });
});

export { admin };
