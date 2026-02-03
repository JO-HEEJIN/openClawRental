import { Hono } from "hono";
import type { Env, AuthUser, UsageQueueMessage } from "../types";
import { AppError } from "../middleware/error-handler";
import { generateId } from "../utils/ulid";
import {
  checkBalance,
  calculateCreditCost,
  deductCredits,
  getProviderConfig,
  isSupportedModel,
} from "../services/billing";
import { createStreamProxy, parseNonStreamingUsage } from "../services/stream";

const proxy = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

async function enqueuUsageLog(
  queue: Queue<UsageQueueMessage>,
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  creditCost: number,
  agentRunId?: string
): Promise<void> {
  const message: UsageQueueMessage = {
    id: generateId(),
    agentRunId: agentRunId ?? `proxy_${generateId()}`,
    userId,
    resourceType: "llm_call",
    resourceDetail: model,
    quantity: inputTokens + outputTokens,
    creditCost,
    createdAt: new Date().toISOString(),
  };
  try {
    await queue.send(message);
  } catch (err) {
    console.error("Failed to enqueue usage log:", err);
  }
}

// POST /v1/chat/completions - OpenAI-compatible proxy endpoint
proxy.post("/v1/chat/completions", async (c) => {
  const user = c.get("user");

  // 1. Pre-flight balance check
  const balanceCheck = await checkBalance(c.env.DB, user.userId);
  if (!balanceCheck.allowed) {
    throw new AppError(
      402,
      "INSUFFICIENT_CREDITS",
      `Insufficient credits. Available: ${balanceCheck.availableCredits}. Please purchase more credits.`
    );
  }

  // 2. Parse request body
  const body = await c.req.json<Record<string, unknown>>();
  const model = (body.model as string) ?? "gpt-4o-mini";
  const stream = body.stream !== false; // default to streaming

  if (!isSupportedModel(model)) {
    throw new AppError(400, "UNSUPPORTED_MODEL", `Model "${model}" is not supported.`);
  }

  // 3. Get provider config and build upstream request
  const providerConfig = getProviderConfig(model, c.env);

  let upstreamBody: Record<string, unknown>;
  let upstreamHeaders: Record<string, string>;

  if (providerConfig.provider === "openai") {
    // OpenAI: forward request as-is, add stream_options for usage in final chunk
    upstreamBody = {
      ...body,
      model,
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    };
    upstreamHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${providerConfig.apiKey}`,
    };
  } else {
    // Anthropic: transform OpenAI chat format to Anthropic Messages API format
    const messages = body.messages as Array<{ role: string; content: string }>;
    let systemPrompt: string | undefined;
    const anthropicMessages: Array<{ role: string; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt = msg.content;
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    upstreamBody = {
      model,
      messages: anthropicMessages,
      max_tokens: (body.max_tokens as number) ?? 4096,
      stream,
      ...(systemPrompt ? { system: systemPrompt } : {}),
    };
    upstreamHeaders = {
      "Content-Type": "application/json",
      "x-api-key": providerConfig.apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  // 4. Proxy request to LLM provider
  const upstreamResponse = await fetch(providerConfig.url, {
    method: "POST",
    headers: upstreamHeaders,
    body: JSON.stringify(upstreamBody),
  });

  // Handle upstream errors
  if (!upstreamResponse.ok) {
    const errorBody = await upstreamResponse.text();
    console.error(`LLM provider error (${providerConfig.provider}):`, upstreamResponse.status, errorBody);
    throw new AppError(
      upstreamResponse.status === 429 ? 429 : 502,
      upstreamResponse.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
      upstreamResponse.status === 429
        ? "LLM provider rate limit reached. Please try again later."
        : "LLM provider returned an error. Please try again."
    );
  }

  // 5. Handle response based on streaming mode
  if (stream) {
    const { response, usagePromise } = createStreamProxy(upstreamResponse, providerConfig.provider);

    // 6. Background billing via ctx.waitUntil -- response is already streaming to client
    c.executionCtx.waitUntil(
      usagePromise.then(async (usage) => {
        const creditCost = calculateCreditCost(model, usage.promptTokens, usage.completionTokens);

        await deductCredits(c.env.DB, {
          userId: user.userId,
          model,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          creditCost,
        });

        await enqueuUsageLog(
          c.env.USAGE_QUEUE as Queue<UsageQueueMessage>,
          user.userId,
          model,
          usage.promptTokens,
          usage.completionTokens,
          creditCost
        );
      })
    );

    return response;
  }

  // Non-streaming response
  const responseBody = (await upstreamResponse.json()) as Record<string, unknown>;
  const usage = await parseNonStreamingUsage(responseBody, providerConfig.provider);
  const creditCost = calculateCreditCost(model, usage.promptTokens, usage.completionTokens);

  // Background billing
  c.executionCtx.waitUntil(
    (async () => {
      await deductCredits(c.env.DB, {
        userId: user.userId,
        model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        creditCost,
      });

      await enqueuUsageLog(
        c.env.USAGE_QUEUE as Queue<UsageQueueMessage>,
        user.userId,
        model,
        usage.promptTokens,
        usage.completionTokens,
        creditCost
      );
    })()
  );

  return c.json(responseBody);
});

// GET /v1/models - List available models
proxy.get("/v1/models", async (c) => {
  const models = [
    { id: "gpt-4o", owned_by: "openai", object: "model" },
    { id: "gpt-4o-mini", owned_by: "openai", object: "model" },
    { id: "claude-sonnet-4-20250514", owned_by: "anthropic", object: "model" },
    { id: "claude-haiku-3.5", owned_by: "anthropic", object: "model" },
  ];
  return c.json({ object: "list", data: models });
});

export { proxy };
