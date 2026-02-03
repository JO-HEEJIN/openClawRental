import { Hono } from "hono";
import type { Env, AuthUser, CreditTransactionType } from "../types";
import { CREDIT_PACKAGES } from "../utils/constants";
import { getBalance, grantCredits } from "../services/credit";
import { verifyPayment } from "../services/payment";
import { PaymentOrderModel } from "../models/payment-order";
import { CreditTransactionModel } from "../models/credit-transaction";
import { CreditBalanceModel } from "../models/credit-balance";
import { AppError } from "../middleware/error-handler";
import { isValidPackageCode } from "../utils/validation";

const credits = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// GET /credits/balance - Get current credit balance
credits.get("/balance", async (c) => {
  const user = c.get("user");
  const balance = await getBalance(c.env.DB, user.userId);
  return c.json({ success: true, data: balance });
});

// GET /credits/packages - List available credit packages
credits.get("/packages", async (c) => {
  return c.json({
    success: true,
    data: { packages: Object.values(CREDIT_PACKAGES) },
  });
});

// POST /credits/prepare - Create a payment order before calling PortOne SDK
credits.post("/prepare", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ packageCode: string }>();

  if (!body.packageCode || !isValidPackageCode(body.packageCode)) {
    throw new AppError(400, "INVALID_PACKAGE", "Invalid package code");
  }

  const pkg = CREDIT_PACKAGES[body.packageCode];

  // Trial package: check if user already claimed
  if (body.packageCode === "trial") {
    const balance = await CreditBalanceModel.findByUserId(c.env.DB, user.userId);
    if (balance && balance.total_credits > 0) {
      throw new AppError(409, "TRIAL_ALREADY_CLAIMED", "Trial credits already claimed");
    }

    // Grant trial credits immediately (no payment needed)
    await grantCredits(c.env.DB, user.userId, pkg.totalCredits, {
      type: "trial",
      description: "Trial credit package",
    });

    return c.json({
      success: true,
      data: {
        type: "trial",
        creditsGranted: pkg.totalCredits,
        message: "Trial credits granted",
      },
    });
  }

  // Paid packages: create payment order
  const order = await PaymentOrderModel.create(c.env.DB, {
    userId: user.userId,
    packageCode: body.packageCode,
    amountKrw: pkg.amountKrw,
    creditsToGrant: pkg.totalCredits,
  });

  return c.json({
    success: true,
    data: {
      type: "payment",
      orderId: order.id,
      merchantUid: order.merchant_uid,
      amount: pkg.amountKrw,
      packageCode: body.packageCode,
      packageName: pkg.nameKo,
      creditsToGrant: pkg.totalCredits,
    },
  });
});

// POST /credits/verify - Verify payment via PortOne and grant credits
// Step 4-6 of the 6-step server-verified payment flow
credits.post("/verify", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ impUid: string; merchantUid: string }>();

  if (!body.impUid || !body.merchantUid) {
    throw new AppError(400, "BAD_REQUEST", "impUid and merchantUid are required");
  }

  // Find the payment order
  const order = await PaymentOrderModel.findByMerchantUid(c.env.DB, body.merchantUid);
  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Payment order not found");
  }

  // Verify the order belongs to this user
  if (order.user_id !== user.userId) {
    throw new AppError(403, "FORBIDDEN", "Order does not belong to this user");
  }

  // Check if already verified
  if (order.status === "paid") {
    throw new AppError(409, "ALREADY_VERIFIED", "Payment already verified and credits granted");
  }

  // Step 5: Verify payment via PortOne API
  const verification = await verifyPayment(
    c.env,
    body.impUid,
    order.amount_krw,
    order.merchant_uid
  );

  // Step 6: Atomically grant credits
  // Update payment order status
  await PaymentOrderModel.updateStatus(c.env.DB, order.id, {
    status: "paid",
    impUid: body.impUid,
    payMethod: verification.payMethod,
    pgProvider: verification.pgProvider,
    verifiedAt: verification.paidAt,
  });

  // Grant credits (DO + D1 + transaction record)
  const pkg = CREDIT_PACKAGES[order.package_code];
  const baseCredits = pkg?.credits ?? order.credits_to_grant;
  const bonusCredits = pkg?.bonusCredits ?? 0;

  // Grant base credits as purchase
  await grantCredits(c.env.DB, user.userId, baseCredits, {
    paymentOrderId: order.id,
    type: "purchase",
    description: `${pkg?.nameKo ?? order.package_code} package purchase`,
  });

  // Grant bonus credits separately if any
  if (bonusCredits > 0) {
    await grantCredits(c.env.DB, user.userId, bonusCredits, {
      paymentOrderId: order.id,
      type: "bonus",
      description: `${pkg?.nameKo ?? order.package_code} package bonus`,
    });
  }

  const balance = await getBalance(c.env.DB, user.userId);

  return c.json({
    success: true,
    data: {
      orderId: order.id,
      creditsGranted: order.credits_to_grant,
      balance,
    },
  });
});

// GET /credits/transactions - Get credit transaction history
credits.get("/transactions", async (c) => {
  const user = c.get("user");
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  const type = url.searchParams.get("type") as CreditTransactionType | null;

  const result = await CreditTransactionModel.listByUserId(c.env.DB, user.userId, {
    limit,
    offset,
    type: type ?? undefined,
  });

  return c.json({
    success: true,
    data: {
      transactions: result.results.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        balanceAfter: tx.balance_after,
        description: tx.description,
        paymentOrderId: tx.payment_order_id,
        agentRunId: tx.agent_run_id,
        createdAt: tx.created_at,
      })),
      total: result.total,
      limit,
      offset,
    },
  });
});

export { credits };
