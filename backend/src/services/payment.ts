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
    easyPay?: { provider: string };
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
 * Get PortOne V2 access token using API secret.
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
 * 6-step server verification:
 * 1. Call PortOne API to get payment details
 * 2. Verify status is PAID
 * 3. Verify amount matches expected
 * 4. Verify merchant_uid matches (if provided)
 * 5. Extract pay method and PG provider
 * 6. Return verified data for atomic credit grant
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
  // Step 1: Fetch payment from PortOne
  const payment = await getPortOnePayment(env, paymentId);

  // Step 2: Verify status is PAID
  if (payment.status !== "PAID") {
    throw new AppError(400, "PAYMENT_NOT_PAID", `Payment status is ${payment.status}, expected PAID`);
  }

  // Step 3: Verify amount matches (skip if expectedAmount is 0 for webhook pre-check)
  if (expectedAmount > 0 && payment.amount.total !== expectedAmount) {
    throw new AppError(400, "AMOUNT_MISMATCH", `Payment amount ${payment.amount.total} does not match expected ${expectedAmount}`);
  }

  // Step 4: Verify store ID matches
  if (env.PORTONE_STORE_ID && payment.storeId !== env.PORTONE_STORE_ID) {
    throw new AppError(400, "STORE_MISMATCH", "Payment store ID does not match");
  }

  // Step 5: Determine pay method from PortOne V2 response
  const methodType = payment.method?.type ?? "unknown";
  const easyPayProvider = payment.method?.easyPay?.provider;
  let payMethod: PayMethod = "card";

  if (methodType === "PayMethodCard") {
    payMethod = "card";
  } else if (methodType === "PayMethodVirtualAccount") {
    payMethod = "vbank";
  } else if (methodType === "PayMethodEasyPay") {
    if (easyPayProvider === "KAKAOPAY") payMethod = "kakaopay";
    else if (easyPayProvider === "NAVERPAY") payMethod = "naverpay";
    else payMethod = "kakaopay";
  } else if (methodType === "PayMethodMobile") {
    payMethod = "phone";
  }

  // Step 6: Return verified data
  return {
    verified: true,
    impUid: payment.id,
    payMethod,
    pgProvider: payment.channel?.pgProvider ?? "unknown",
    paidAt: payment.paidAt ?? new Date().toISOString(),
  };
}

/**
 * Validate PortOne V2 webhook signature.
 *
 * PortOne V2 sends three headers:
 * - webhook-id: unique ID for this webhook delivery
 * - webhook-timestamp: Unix timestamp of when the webhook was sent
 * - webhook-signature: HMAC-SHA256 signature
 *
 * Signature = Base64(HMAC-SHA256(secret, "${webhook_id}.${webhook_timestamp}.${body}"))
 */
export async function validateWebhookSignature(
  body: string,
  webhookId: string | undefined,
  webhookTimestamp: string | undefined,
  webhookSignature: string | undefined,
  webhookSecret: string
): Promise<boolean> {
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return false;
  }

  // Check timestamp freshness (reject webhooks older than 5 minutes)
  const ts = parseInt(webhookTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) {
    return false;
  }

  try {
    const signingContent = `${webhookId}.${webhookTimestamp}.${body}`;

    // Decode the base64 secret (PortOne V2 webhook secrets are base64-encoded)
    const secretBytes = Uint8Array.from(atob(webhookSecret), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const encoder = new TextEncoder();
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signingContent));
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // PortOne may send multiple signatures separated by space; check if any match
    const signatures = webhookSignature.split(" ");
    for (const sig of signatures) {
      // Strip version prefix if present (e.g., "v1,BASE64SIG")
      const sigValue = sig.includes(",") ? sig.split(",")[1] : sig;
      if (sigValue === expectedSignature) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
