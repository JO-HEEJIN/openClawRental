// SSE stream handler for LLM proxy responses.
// Parses streaming chunks from LLM providers, pipes to client, extracts usage data.

import { estimateTokens } from "./billing";

export interface UsageData {
  promptTokens: number;
  completionTokens: number;
}

// Parse an SSE line into event data
function parseSSELine(line: string): string | null {
  if (line.startsWith("data: ")) {
    return line.slice(6);
  }
  return null;
}

// Extract usage from an OpenAI streaming chunk
function extractOpenAIUsage(parsed: Record<string, unknown>): UsageData | null {
  const usage = parsed.usage as Record<string, number> | undefined;
  if (usage && typeof usage.prompt_tokens === "number") {
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens ?? 0,
    };
  }
  return null;
}

// Extract usage from an Anthropic streaming message_stop event
function extractAnthropicUsage(parsed: Record<string, unknown>): UsageData | null {
  const usage = parsed.usage as Record<string, number> | undefined;
  if (usage && typeof usage.input_tokens === "number") {
    return {
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens ?? 0,
    };
  }
  return null;
}

export interface StreamResult {
  response: Response;
  usagePromise: Promise<UsageData>;
}

// Create a streaming proxy that pipes LLM SSE to client and extracts usage
export function createStreamProxy(
  upstreamResponse: Response,
  provider: "openai" | "anthropic"
): StreamResult {
  let resolveUsage: (usage: UsageData) => void;
  const usagePromise = new Promise<UsageData>((resolve) => {
    resolveUsage = resolve;
  });

  let accumulatedContent = "";
  let foundUsage = false;
  let inputEstimateChars = "";

  const upstreamBody = upstreamResponse.body;
  if (!upstreamBody) {
    // Non-streaming response -- shouldn't happen in normal flow
    resolveUsage!({ promptTokens: 0, completionTokens: 0 });
    return {
      response: new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
      }),
      usagePromise,
    };
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let buffer = "";

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Write raw chunk to client immediately
        await writer.write(value);

        // Parse SSE lines to extract usage
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const data = parseSSELine(line.trim());
          if (!data || data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;

            if (provider === "openai") {
              // Accumulate content for fallback estimation
              const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
              if (choices?.[0]) {
                const delta = choices[0].delta as Record<string, string> | undefined;
                if (delta?.content) {
                  accumulatedContent += delta.content;
                }
              }

              const usage = extractOpenAIUsage(parsed);
              if (usage) {
                foundUsage = true;
                resolveUsage!(usage);
              }
            } else if (provider === "anthropic") {
              // Track content for fallback
              const type = parsed.type as string;
              if (type === "content_block_delta") {
                const delta = parsed.delta as Record<string, string> | undefined;
                if (delta?.text) {
                  accumulatedContent += delta.text;
                }
              }
              // Anthropic sends usage in message_start and message_delta
              if (type === "message_start") {
                const message = parsed.message as Record<string, unknown> | undefined;
                if (message?.usage) {
                  const u = message.usage as Record<string, number>;
                  inputEstimateChars = ""; // reset
                  // Store input tokens from message_start
                  inputEstimateChars = String(u.input_tokens ?? 0);
                }
              }
              if (type === "message_delta") {
                const usage = parsed.usage as Record<string, number> | undefined;
                if (usage && typeof usage.output_tokens === "number") {
                  foundUsage = true;
                  resolveUsage!({
                    promptTokens: parseInt(inputEstimateChars) || 0,
                    completionTokens: usage.output_tokens,
                  });
                }
              }
            }
          } catch {
            // Non-JSON SSE line, skip
          }
        }
      }
    } catch (err) {
      console.error("Stream proxy error:", err);
    } finally {
      // If we never found usage data, estimate from content
      if (!foundUsage) {
        resolveUsage!({
          promptTokens: estimateTokens(inputEstimateChars || ""),
          completionTokens: estimateTokens(accumulatedContent),
        });
      }
      await writer.close();
    }
  })();

  // Build response with same headers
  const headers = new Headers(upstreamResponse.headers);
  headers.set("Cache-Control", "no-cache");
  headers.set("X-Accel-Buffering", "no");

  return {
    response: new Response(readable, {
      status: upstreamResponse.status,
      headers,
    }),
    usagePromise,
  };
}

// Handle non-streaming response: parse usage from response body
export async function parseNonStreamingUsage(
  body: Record<string, unknown>,
  provider: "openai" | "anthropic"
): Promise<UsageData> {
  if (provider === "openai") {
    const usage = body.usage as Record<string, number> | undefined;
    if (usage) {
      return {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
      };
    }
  } else if (provider === "anthropic") {
    const usage = body.usage as Record<string, number> | undefined;
    if (usage) {
      return {
        promptTokens: usage.input_tokens ?? 0,
        completionTokens: usage.output_tokens ?? 0,
      };
    }
  }

  // Fallback: estimate from content
  let content = "";
  if (provider === "openai") {
    const choices = body.choices as Array<Record<string, unknown>> | undefined;
    if (choices?.[0]) {
      const msg = choices[0].message as Record<string, string> | undefined;
      content = msg?.content ?? "";
    }
  } else if (provider === "anthropic") {
    const contentBlocks = body.content as Array<Record<string, string>> | undefined;
    if (contentBlocks) {
      content = contentBlocks.map((b) => b.text ?? "").join("");
    }
  }

  return {
    promptTokens: 0,
    completionTokens: estimateTokens(content),
  };
}
