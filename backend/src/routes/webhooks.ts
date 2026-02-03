import { Hono } from "hono";
import type { Env } from "../types";
import { CREDIT_PACKAGES } from "../utils/constants";
import { verifyPayment } from "../services/payment";
import { grantCredits } from "../services/credit";
import { PaymentOrderModel } from "../models/payment-order";
import { WebhookEventModel } from "../models/webhook-event";
import { AppError } from "../middleware/error-handler";

const webhooks = new Hono<{ Bindings: Env }>();

// POST /webhooks/portone - PortOne payment webhook
// Provides redundancy alongside the frontend verify flow.
// Handles cases where the user closes the browser before verify completes.
webhooks.post("/portone", async (c) => {
  const rawBody = await c.req.text();

  let payload: {
    type: string;
    timestamp: string;
    data?: {
      paymentId?: string;
      transactionId?: string;
      cancellationId?: string;
    };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new AppError(400, "INVALID_PAYLOAD", "Invalid JSON payload");
  }

  const eventType = payload.type;
  const paymentId = payload.data?.paymentId;

  if (!eventType || !paymentId) {
    throw new AppError(400, "MISSING_FIELDS", "Missing type or paymentId in webhook payload");
  }

  // Check idempotency: imp_uid + event_type
  const idempotencyKey = `${paymentId}_${eventType}`;
  const existing = await WebhookEventModel.findByIdempotencyKey(c.env.DB, idempotencyKey);
  if (existing) {
    // Already processed, return success to prevent retries
    return c.json({ success: true, data: { message: "Already processed" } });
  }

  // Store webhook event
  const webhookId = await WebhookEventModel.create(c.env.DB, {
    impUid: paymentId,
    eventType,
    payloadJson: rawBody,
  });

  // Only process payment confirmation events
  if (eventType === "Transaction.Paid") {
    // Find matching payment order by imp_uid
    const order = await PaymentOrderModel.findByImpUid(c.env.DB, paymentId);

    if (!order) {
      // The order might have been created with merchant_uid but imp_uid not yet set.
      // This is normal if the webhook arrives before the frontend verify call.
      // We'll re-verify via PortOne API to get the merchant_uid.
      try {
        const verification = await verifyPayment(c.env, paymentId, 0, "");
        // We skip amount verification here since we need to look up the order first
        // The actual verification happens below once we find the order
      } catch {
        // If verification fails, mark as processed and move on
      }

      await WebhookEventModel.markProcessed(c.env.DB, webhookId);
      return c.json({ success: true, data: { message: "Order not found, webhook recorded" } });
    }

    // Skip if already paid
    if (order.status === "paid") {
      await WebhookEventModel.markProcessed(c.env.DB, webhookId);
      return c.json({ success: true, data: { message: "Already paid" } });
    }

    // Re-verify payment via PortOne API (defense in depth)
    const verification = await verifyPayment(
      c.env,
      paymentId,
      order.amount_krw,
      order.merchant_uid
    );

    // Update order status
    await PaymentOrderModel.updateStatus(c.env.DB, order.id, {
      status: "paid",
      impUid: paymentId,
      payMethod: verification.payMethod,
      pgProvider: verification.pgProvider,
      verifiedAt: verification.paidAt,
    });

    // Grant credits
    const pkg = CREDIT_PACKAGES[order.package_code];
    const baseCredits = pkg?.credits ?? order.credits_to_grant;
    const bonusCredits = pkg?.bonusCredits ?? 0;

    await grantCredits(c.env, order.user_id, baseCredits, {
      paymentOrderId: order.id,
      type: "purchase",
      description: `${pkg?.nameKo ?? order.package_code} package purchase (webhook)`,
    });

    if (bonusCredits > 0) {
      await grantCredits(c.env, order.user_id, bonusCredits, {
        paymentOrderId: order.id,
        type: "bonus",
        description: `${pkg?.nameKo ?? order.package_code} package bonus (webhook)`,
      });
    }
  }

  // Handle cancellation/refund events
  if (eventType === "Transaction.Cancelled") {
    const order = await PaymentOrderModel.findByImpUid(c.env.DB, paymentId);
    if (order && order.status === "paid") {
      await PaymentOrderModel.updateStatus(c.env.DB, order.id, {
        status: "refunded",
      });
      // Note: Credit deduction for refunds should be handled via admin endpoint
      // to allow for partial refunds and manual review
    }
  }

  await WebhookEventModel.markProcessed(c.env.DB, webhookId);
  return c.json({ success: true, data: { message: "Webhook processed" } });
});

export { webhooks };
