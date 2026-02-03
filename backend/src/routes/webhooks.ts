import { Hono } from "hono";
import type { Env } from "../types";
import { CREDIT_PACKAGES } from "../utils/constants";
import { verifyPayment, validateWebhookSignature } from "../services/payment";
import { grantCredits } from "../services/credit";
import { PaymentOrderModel } from "../models/payment-order";
import { WebhookEventModel } from "../models/webhook-event";
import { AppError } from "../middleware/error-handler";

const webhooks = new Hono<{ Bindings: Env }>();

// POST /webhooks/portone - PortOne V2 payment webhook
// Provides redundancy alongside the frontend verify flow.
// Handles cases where the user closes the browser before verify completes.
webhooks.post("/portone", async (c) => {
  const rawBody = await c.req.text();

  // Step 1: Validate webhook signature
  const webhookId = c.req.header("webhook-id");
  const webhookTimestamp = c.req.header("webhook-timestamp");
  const webhookSignature = c.req.header("webhook-signature");

  if (c.env.PORTONE_WEBHOOK_SECRET) {
    const isValid = await validateWebhookSignature(
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      c.env.PORTONE_WEBHOOK_SECRET
    );

    if (!isValid) {
      throw new AppError(401, "INVALID_SIGNATURE", "Invalid webhook signature");
    }
  }

  // Parse payload
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

  // Step 2: Check idempotency (imp_uid + event_type)
  const idempotencyKey = `${paymentId}_${eventType}`;
  const existing = await WebhookEventModel.findByIdempotencyKey(c.env.DB, idempotencyKey);
  if (existing) {
    return c.json({ success: true, data: { message: "Already processed" } });
  }

  // Store webhook event
  const webhookEventId = await WebhookEventModel.create(c.env.DB, {
    impUid: paymentId,
    eventType,
    payloadJson: rawBody,
  });

  // Step 3-6: Process payment confirmation events
  if (eventType === "Transaction.Paid") {
    const order = await PaymentOrderModel.findByImpUid(c.env.DB, paymentId);

    if (!order) {
      // Webhook arrived before frontend verify -- record and return
      await WebhookEventModel.markProcessed(c.env.DB, webhookEventId);
      return c.json({ success: true, data: { message: "Order not found, webhook recorded" } });
    }

    // Skip if already paid (idempotency at order level)
    if (order.status === "paid") {
      await WebhookEventModel.markProcessed(c.env.DB, webhookEventId);
      return c.json({ success: true, data: { message: "Already paid" } });
    }

    // Step 3: Re-verify payment via PortOne API (defense in depth)
    const verification = await verifyPayment(
      c.env,
      paymentId,
      order.amount_krw,
      order.merchant_uid
    );

    // Step 4-5: Update order status
    await PaymentOrderModel.updateStatus(c.env.DB, order.id, {
      status: "paid",
      impUid: paymentId,
      payMethod: verification.payMethod,
      pgProvider: verification.pgProvider,
      verifiedAt: verification.paidAt,
    });

    // Step 6: Atomic credit grant via D1 batch
    const pkg = CREDIT_PACKAGES[order.package_code];
    const baseCredits = pkg?.credits ?? order.credits_to_grant;
    const bonusCredits = pkg?.bonusCredits ?? 0;

    await grantCredits(c.env.DB, order.user_id, baseCredits, {
      paymentOrderId: order.id,
      type: "purchase",
      description: `${pkg?.nameKo ?? order.package_code} package purchase (webhook)`,
    });

    if (bonusCredits > 0) {
      await grantCredits(c.env.DB, order.user_id, bonusCredits, {
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
    }
  }

  await WebhookEventModel.markProcessed(c.env.DB, webhookEventId);
  return c.json({ success: true, data: { message: "Webhook processed" } });
});

export { webhooks };
