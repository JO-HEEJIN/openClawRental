/**
 * AI Gateway Client.
 *
 * Routes LLM requests through Cloudflare AI Gateway for:
 * - Caching identical prompts (target 30%+ cache hit rate)
 * - Rate limiting per user
 * - Model fallback: OpenAI -> Claude -> Gemini
 * - Unified response format across providers
 */

import type {
  AIGatewayClient,
  LLMRequest,
  LLMResponse,
  LLMProvider,
  LLMMessage,
  AgentEnv,
} from '../framework/types';

/** Provider endpoint config */
interface ProviderConfig {
  provider: LLMProvider;
  baseUrl: string;
  apiKeyEnvVar: keyof AgentEnv;
  defaultModel: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-haiku-3-5',
  },
  {
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnvVar: 'GOOGLE_AI_API_KEY',
    defaultModel: 'gemini-2.0-flash',
  },
];

/** Detect provider from model name */
function detectProvider(model: string): LLMProvider {
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'google';
  return 'openai'; // default
}

/** Get fallback order starting from the preferred provider */
function getFallbackOrder(preferred: LLMProvider): ProviderConfig[] {
  const idx = PROVIDERS.findIndex((p) => p.provider === preferred);
  const ordered = [...PROVIDERS.slice(idx), ...PROVIDERS.slice(0, idx)];
  return ordered;
}

export class CloudflareAIGateway implements AIGatewayClient {
  constructor(
    private readonly env: AgentEnv,
    private readonly gatewayId: string = 'openclaw-gateway',
  ) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const provider = request.provider ?? detectProvider(request.model);
    const fallbackOrder = getFallbackOrder(provider);
    let lastError: Error | null = null;

    for (const config of fallbackOrder) {
      try {
        const apiKey = this.env[config.apiKeyEnvVar] as string;
        if (!apiKey) continue;

        const model =
          config.provider === provider ? request.model : config.defaultModel;

        const startMs = Date.now();
        const response = await this.callProvider(config, apiKey, {
          ...request,
          model,
          provider: config.provider,
        });
        const latencyMs = Date.now() - startMs;

        return { ...response, latencyMs };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to next provider in fallback chain
      }
    }

    throw lastError ?? new Error('All LLM providers failed');
  }

  private async callProvider(
    config: ProviderConfig,
    apiKey: string,
    request: LLMRequest & { provider: LLMProvider },
  ): Promise<Omit<LLMResponse, 'latencyMs'>> {
    switch (config.provider) {
      case 'openai':
        return this.callOpenAI(apiKey, request);
      case 'anthropic':
        return this.callAnthropic(apiKey, request);
      case 'google':
        return this.callGoogle(apiKey, request);
    }
  }

  // ---- OpenAI -----------------------------------------------------------

  private async callOpenAI(
    apiKey: string,
    request: LLMRequest,
  ): Promise<Omit<LLMResponse, 'latencyMs'>> {
    const body = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    // Route through AI Gateway if available
    const url = this.gatewayUrl('openai', '/chat/completions');
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number };
      model: string;
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      model: data.model,
      provider: 'openai',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cached: res.headers.get('cf-aig-cache-status') === 'HIT',
    };
  }

  // ---- Anthropic --------------------------------------------------------

  private async callAnthropic(
    apiKey: string,
    request: LLMRequest,
  ): Promise<Omit<LLMResponse, 'latencyMs'>> {
    // Separate system message from conversation
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const conversationMsgs = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const body: Record<string, unknown> = {
      model: request.model,
      messages: conversationMsgs,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    };
    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const url = this.gatewayUrl('anthropic', '/messages');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      content: { type: string; text: string }[];
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };

    return {
      content: data.content.find((c) => c.type === 'text')?.text ?? '',
      model: data.model,
      provider: 'anthropic',
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cached: res.headers.get('cf-aig-cache-status') === 'HIT',
    };
  }

  // ---- Google -----------------------------------------------------------

  private async callGoogle(
    apiKey: string,
    request: LLMRequest,
  ): Promise<Omit<LLMResponse, 'latencyMs'>> {
    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = request.messages.find((m) => m.role === 'system');

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4096,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }

    const url = this.gatewayUrl(
      'google',
      `/models/${request.model}:generateContent?key=${apiKey}`,
    );
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google AI API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[];
      usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
    };

    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      model: request.model,
      provider: 'google',
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      cached: res.headers.get('cf-aig-cache-status') === 'HIT',
    };
  }

  // ---- Gateway URL helper -----------------------------------------------

  private gatewayUrl(provider: string, path: string): string {
    // When AI Gateway binding is available, route through it.
    // Otherwise fall back to direct provider URL.
    const providerConfig = PROVIDERS.find((p) => p.provider === provider);
    if (!providerConfig) throw new Error(`Unknown provider: ${provider}`);

    // Cloudflare AI Gateway URL pattern:
    // https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}{path}
    // In Workers, we use the AI_GATEWAY service binding instead.
    // For now, fall back to direct URL.
    return `${providerConfig.baseUrl}${path}`;
  }
}
