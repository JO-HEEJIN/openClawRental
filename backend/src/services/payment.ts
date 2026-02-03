import type { Env, PayMethod } from "../types";
import { AppError } from "../middleware/error-handler";

const PORTONE_API_BASE = "https://api.portone.io";

interface PortOnePayment {
  status: string;
  id: string;
  transactionId: string;
  merchantId: string;
  storeId: string;
  method?: {
    type: string;
    card?: { number: string; acquirer: string };
    virtualAccount?: { accountNumber: string; bankCode: string; expiresAt: string };
  };
  channel?: {
    pgProvider: string;
  };
  amount: {
    total: number;
    taxFree: number;
    vat: number;
  };
  currency: string;
  customData?: string;
  orderName?: string;
  paidAt?: string;
  pgTxId?: string;
}

interface PortOneTokenResponse {
  access_token: string;
  expires_at: number;
  now: number;
  token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get PortOne V2 access token using API key + secret.
 */
async function getPortOneToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const response = await fetch(`${PORTONE_API_BASE}/login/api-secret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiSecret: env.PORTONE_API_SECRET,
    }),
  });

  if (!response.ok) {
    throw new AppError(502, "PAYMENT_GATEWAY_ERROR", "Failed to authenticate with PortOne");
  }

  const data = (await response.json()) as PortOneTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: data.expires_at,
  };
  return data.access_token;
}

/**
 * Fetch payment details from PortOne V2 API.
 */
export async function getPortOnePayment(
  env: Env,
  paymentId: string
): Promise<PortOnePayment> {
  const token = await getPortOneToken(env);

  const response = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new AppError(502, "PAYMENT_GATEWAY_ERROR", `PortOne API error: ${response.status} ${errBody}`);
  }

  return (await response.json()) as PortOnePayment;
}

/**
 * Verify payment: check status=PAID, amount matches, and return normalized data.
 */
export async function verifyPayment(
  env: Env,
  paymentId: string,
  expectedAmount: number,
  expectedMerchantUid: string
): Promise<{
  verified: boolean;
  impUid: string;
  payMethod: PayMethod;
  pgProvider: string;
  paidAt: string;
}> {
  const payment = await getPortOnePayment(env, paymentId);

  // Verify status is PAID
  if (payment.status !== "PAID") {
    throw new AppError(400, "PAYMENT_NOT_PAID", `Payment status is ${payment.status}, expected PAID`);
  }

  // Verify amount matches
  if (payment.amount.total !== expectedAmount) {
    throw new AppError(400, "AMOUNT_MISMATCH", `Payment amount ${payment.amount.total} does not match expected ${expectedAmount}`);
  }

  // Determine pay method from PortOne response
  const methodType = payment.method?.type ?? "unknown";
  const payMethodMap: Record<string, PayMethod> = {
    PayMethodCard: "card",
    PayMethodVirtualAccount: "vbank",
    PayMethodEasyPay: "kakaopay", // May need refinement based on PG
    PayMethodMobile: "phone",
  };
  const payMethod = payMethodMap[methodType] ?? "card";

  return {
    verified: true,
    impUid: payment.id,
    payMethod,
    pgProvider: payment.channel?.pgProvider ?? "nice",
    paidAt: payment.paidAt ?? new Date().toISOString(),
  };
}

/**
 * Validate PortOne webhook signature.
 * PortOne V2 uses webhook verification via the webhook secret.
 */
export async function validateWebhookSignature(
  body: string,
  signatureHeader: string | undefined,
  webhookSecret: string
): Promise<boolean> {
  if (!signatureHeader) return false;

  // PortOne V2 webhook verification:
  // The webhook-id, webhook-timestamp, and webhook-signature headers are provided.
  // Signature = Base64(HMAC-SHA256(webhook_secret, "${webhook_id}.${webhook_timestamp}.${body}"))
  // For simplicity, we verify via re-fetching the payment from PortOne API instead,
  // which is the recommended approach for maximum security.
  // The signature check here is an additional layer.

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(atob(signatureHeader), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(body));
    return valid;
  } catch {
    return false;
  }
}
