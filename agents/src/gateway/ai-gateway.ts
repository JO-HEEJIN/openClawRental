import type { AIGatewayClient, LLMRequest, LLMResponse, LLMProvider, AgentEnv } from '../framework/types';

interface ProviderConfig { provider: LLMProvider; baseUrl: string; apiKeyEnvVar: keyof AgentEnv; defaultModel: string; }

const PROVIDERS: ProviderConfig[] = [
  { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKeyEnvVar: 'OPENAI_API_KEY', defaultModel: 'gpt-4o-mini' },
  { provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKeyEnvVar: 'ANTHROPIC_API_KEY', defaultModel: 'claude-haiku-3-5' },
  { provider: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKeyEnvVar: 'GOOGLE_AI_API_KEY', defaultModel: 'gemini-2.0-flash' },
];

function detectProvider(model: string): LLMProvider {
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'google';
  return 'openai';
}

export class CloudflareAIGateway implements AIGatewayClient {
  constructor(private readonly env: AgentEnv) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const provider = request.provider ?? detectProvider(request.model);
    const idx = PROVIDERS.findIndex(p => p.provider === provider);
    const fallbackOrder = [...PROVIDERS.slice(idx), ...PROVIDERS.slice(0, idx)];
    let lastError: Error | null = null;

    for (const config of fallbackOrder) {
      try {
        const apiKey = this.env[config.apiKeyEnvVar] as string;
        if (!apiKey) continue;
        const model = config.provider === provider ? request.model : config.defaultModel;
        const startMs = Date.now();
        const response = await this.callProvider(config, apiKey, { ...request, model, provider: config.provider });
        return { ...response, latencyMs: Date.now() - startMs };
      } catch (error) { lastError = error instanceof Error ? error : new Error(String(error)); }
    }
    throw lastError ?? new Error('All LLM providers failed');
  }

  private async callProvider(config: ProviderConfig, apiKey: string, request: LLMRequest & { provider: LLMProvider }): Promise<Omit<LLMResponse, 'latencyMs'>> {
    switch (config.provider) {
      case 'openai': return this.callOpenAI(apiKey, request);
      case 'anthropic': return this.callAnthropic(apiKey, request);
      case 'google': return this.callGoogle(apiKey, request);
    }
  }

  private async callOpenAI(apiKey: string, req: LLMRequest): Promise<Omit<LLMResponse, 'latencyMs'>> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: req.model, messages: req.messages.map(m => ({ role: m.role, content: m.content })), temperature: req.temperature ?? 0.7, max_tokens: req.maxTokens ?? 4096 }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[]; usage: { prompt_tokens: number; completion_tokens: number }; model: string };
    return { content: data.choices[0]?.message?.content ?? '', model: data.model, provider: 'openai', inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0, cached: res.headers.get('cf-aig-cache-status') === 'HIT' };
  }

  private async callAnthropic(apiKey: string, req: LLMRequest): Promise<Omit<LLMResponse, 'latencyMs'>> {
    const sys = req.messages.find(m => m.role === 'system');
    const msgs = req.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const body: Record<string, unknown> = { model: req.model, messages: msgs, max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 0.7 };
    if (sys) body.system = sys.content;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content: { type: string; text: string }[]; usage: { input_tokens: number; output_tokens: number }; model: string };
    return { content: data.content.find(c => c.type === 'text')?.text ?? '', model: data.model, provider: 'anthropic', inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0, cached: res.headers.get('cf-aig-cache-status') === 'HIT' };
  }

  private async callGoogle(apiKey: string, req: LLMRequest): Promise<Omit<LLMResponse, 'latencyMs'>> {
    const contents = req.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const sys = req.messages.find(m => m.role === 'system');
    const body: Record<string, unknown> = { contents, generationConfig: { temperature: req.temperature ?? 0.7, maxOutputTokens: req.maxTokens ?? 4096 } };
    if (sys) body.systemInstruction = { parts: [{ text: sys.content }] };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google AI error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { candidates: { content: { parts: { text: string }[] } }[]; usageMetadata: { promptTokenCount: number; candidatesTokenCount: number } };
    return { content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '', model: req.model, provider: 'google', inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0, cached: res.headers.get('cf-aig-cache-status') === 'HIT' };
  }
}
