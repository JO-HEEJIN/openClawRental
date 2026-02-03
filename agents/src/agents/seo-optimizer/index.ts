import { BaseAgent } from '../../framework/agent';
import type { AgentMeta, AgentInput, AgentOutput, ValidationResult, ExecutionContext, ProgressEvent } from '../../framework/types';
import { ok, fail, requireStrings, requireOneOf } from '../../utils/validation';

const LANG: Record<string, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

export class SEOOptimizerAgent extends BaseAgent {
  readonly meta: AgentMeta = { id: 'seo-optimizer', name: 'SEO Optimization Agent', description: 'Optimizes titles, descriptions, tags, and hashtags', category: 'seo-optimizer', version: '1.0.0', estimatedCredits: { min: 5, max: 15 } };

  validate(input: AgentInput): ValidationResult {
    const errors = requireStrings(input.params as Record<string, unknown>, ['topic']);
    const pE = requireOneOf(input.params as Record<string, unknown>, 'platform', ['youtube', 'instagram', 'both']); if (pE) errors.push(pE);
    const lE = requireOneOf(input.params as Record<string, unknown>, 'language', ['ko', 'en', 'ja']); if (lE) errors.push(lE);
    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(input: AgentInput, ctx: ExecutionContext): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const p = input.params as { topic: string; platform: string; language: string; niche?: string; targetKeywords?: string[] };
    const lang = LANG[p.language] ?? 'Korean';

    yield this.progress(input.runId, 'keywords', 'Researching keywords...', 10); this.checkAborted(ctx.signal);
    const kwR = await ctx.aiGateway.chat({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'SEO keyword specialist.' }, { role: 'user', content: `Keywords for "${p.topic}" (${lang}). ${p.niche ? `Niche: ${p.niche}.` : ''} JSON: {"primary":[10],"secondary":[10],"longTail":[10]}` }], temperature: 0.5, maxTokens: 1024, cacheable: true });
    ctx.trackUsage(this.llmUsage(kwR.model, kwR.inputTokens, kwR.outputTokens));
    let tags = { primary: [] as string[], secondary: [] as string[], longTail: [] as string[] };
    try { tags = JSON.parse(kwR.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch {}

    yield this.progress(input.runId, 'titles', 'Optimizing titles...', 30); this.checkAborted(ctx.signal);
    const tR = await ctx.aiGateway.chat({ model: 'gpt-4o', messages: [{ role: 'system', content: 'Viral title optimizer.' }, { role: 'user', content: `5 SEO titles for "${p.topic}" (${p.platform}). Keywords: ${tags.primary.slice(0, 5).join(', ')}. Max 100 chars. ${lang}. JSON: [{"title":"...","characterCount":N,"score":0-100,"reasoning":"..."}]` }], temperature: 0.8, maxTokens: 1024 });
    ctx.trackUsage(this.llmUsage(tR.model, tR.inputTokens, tR.outputTokens));
    let titles: { title: string; characterCount: number; score: number; reasoning: string }[] = [];
    try { titles = JSON.parse(tR.content.match(/\[[\s\S]*\]/)?.[0] ?? '[]'); } catch {}

    yield this.progress(input.runId, 'description', 'Writing description...', 55); this.checkAborted(ctx.signal);
    const dR = await ctx.aiGateway.chat({ model: 'gpt-4o', messages: [{ role: 'system', content: 'SEO copywriter.' }, { role: 'user', content: `SEO description for "${p.topic}" (${p.platform}). Keywords: ${[...tags.primary.slice(0, 3), ...tags.secondary.slice(0, 3)].join(', ')}. Include CTA. ${lang}. JSON: {"description":"...","characterCount":N,"keywordsUsed":[...],"ctaIncluded":true}` }], temperature: 0.7, maxTokens: 1024 });
    ctx.trackUsage(this.llmUsage(dR.model, dR.inputTokens, dR.outputTokens));
    let desc = { description: '', characterCount: 0, keywordsUsed: [] as string[], ctaIncluded: false };
    try { desc = JSON.parse(dR.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch {}

    yield this.progress(input.runId, 'hashtags', 'Generating hashtags...', 75);
    const hR = await ctx.aiGateway.chat({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'Hashtag strategist.' }, { role: 'user', content: `30 hashtags for "${p.topic}" (${p.platform}). ${lang}. JSON string array.` }], temperature: 0.7, maxTokens: 512, cacheable: true });
    ctx.trackUsage(this.llmUsage(hR.model, hR.inputTokens, hR.outputTokens));
    let hashtags: string[] = []; try { hashtags = JSON.parse(hR.content.match(/\[[\s\S]*\]/)?.[0] ?? '[]'); } catch {}

    const tagTotal = (tags.primary?.length ?? 0) + (tags.secondary?.length ?? 0) + (tags.longTail?.length ?? 0);
    const tScore = titles.length ? Math.max(...titles.map(t => t.score)) : 0;
    const dScore = desc.description.length ? 50 + (desc.keywordsUsed.length >= 3 ? 20 : 0) + (desc.ctaIncluded ? 15 : 0) + (desc.characterCount >= 100 ? 15 : 0) : 0;
    const overall = Math.round(tScore * 0.4 + dScore * 0.35 + Math.min(100, (tagTotal / 30) * 100) * 0.25);

    yield this.progress(input.runId, 'complete', 'SEO ready', 100);
    return { success: true, data: { platform: p.platform, titles, description: desc, tags: { ...tags, total: tagTotal }, hashtags, seoScore: { overall, titleScore: tScore, descriptionScore: dScore, tagScore: Math.min(100, (tagTotal / 30) * 100) } }, summary: `SEO for "${p.topic}". Score: ${overall}/100.`, artifacts: [], usage: [] };
  }
}
