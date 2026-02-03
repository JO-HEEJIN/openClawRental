import { BaseAgent } from '../../framework/agent';
import type { AgentMeta, AgentInput, AgentOutput, ValidationResult, ExecutionContext, ProgressEvent } from '../../framework/types';
import { ok, fail, requireOneOf, fieldError } from '../../utils/validation';

export class AnalyticsAgent extends BaseAgent {
  readonly meta: AgentMeta = { id: 'analytics', name: 'Analytics Agent', description: 'Analyzes content performance with A/B test support', category: 'analytics', version: '1.0.0', estimatedCredits: { min: 5, max: 10 } };

  validate(input: AgentInput): ValidationResult {
    const p = input.params as Record<string, unknown>;
    const errors: { field: string; message: string; code: string }[] = [];
    const tE = requireOneOf(p, 'analysisType', ['performance', 'ab-test', 'audience', 'comparison']); if (tE) errors.push(tE);
    if (!Array.isArray(p['contentIds']) || !(p['contentIds'] as string[]).length) errors.push(fieldError('contentIds', 'Required', 'REQUIRED'));
    if (p['analysisType'] === 'ab-test' && !p['abTestConfig']) errors.push(fieldError('abTestConfig', 'Required for A/B test', 'REQUIRED'));
    const pE = requireOneOf(p, 'platform', ['youtube', 'instagram', 'both']); if (pE) errors.push(pE);
    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(input: AgentInput, ctx: ExecutionContext): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const p = input.params as { analysisType: string; contentIds: string[]; platform: string; dateRange: { start: string; end: string }; abTestConfig?: { variantA: string[]; variantB: string[]; metric: string } };

    yield this.progress(input.runId, 'fetch', 'Fetching metrics...', 10); this.checkAborted(ctx.signal);
    const metrics: { contentId: string; platform: string; views: number; likes: number; comments: number; engagementRate: number }[] = [];
    for (const id of p.contentIds) {
      if (p.platform === 'youtube' || p.platform === 'both') {
        try {
          const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'statistics', id, key: ctx.env.YOUTUBE_API_KEY })}`);
          if (r.ok) { const d = (await r.json()) as { items: { id: string; statistics: { viewCount: string; likeCount: string; commentCount: string } }[] }; ctx.trackUsage(this.apiCallUsage('youtube-data-api')); for (const i of d.items) { const v = parseInt(i.statistics.viewCount ?? '0'); const l = parseInt(i.statistics.likeCount ?? '0'); const c = parseInt(i.statistics.commentCount ?? '0'); metrics.push({ contentId: i.id, platform: 'youtube', views: v, likes: l, comments: c, engagementRate: v > 0 ? ((l + c) / v) * 100 : 0 }); } }
        } catch {}
      }
    }

    let abResult: Record<string, unknown> | undefined;
    if (p.analysisType === 'ab-test' && p.abTestConfig) {
      yield this.progress(input.runId, 'ab-test', 'Running A/B test...', 40);
      const cfg = p.abTestConfig; const getVal = (m: typeof metrics[0]) => cfg.metric === 'engagement' ? m.engagementRate : m.views;
      const vA = metrics.filter(m => cfg.variantA.includes(m.contentId)); const vB = metrics.filter(m => cfg.variantB.includes(m.contentId));
      const avgA = vA.length ? vA.reduce((s, m) => s + getVal(m), 0) / vA.length : 0; const avgB = vB.length ? vB.reduce((s, m) => s + getVal(m), 0) / vB.length : 0;
      const imp = avgA > 0 ? ((avgB - avgA) / avgA) * 100 : 0; const n = vA.length + vB.length;
      const conf = n >= 200 && Math.abs(imp) > 5 ? 95 : n >= 100 && Math.abs(imp) > 10 ? 90 : n >= 30 ? 70 : 50;
      abResult = { winner: conf >= 90 ? (avgA > avgB ? 'A' : 'B') : 'inconclusive', metric: cfg.metric, variantA: Math.round(avgA * 100) / 100, variantB: Math.round(avgB * 100) / 100, improvement: Math.round(imp * 100) / 100, confidence: conf };
    }

    yield this.progress(input.runId, 'insights', 'Generating insights...', 60); this.checkAborted(ctx.signal);
    const ir = await ctx.aiGateway.chat({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'Social media analytics expert for Korean Shorts/Reels.' }, { role: 'user', content: `Analyze: ${JSON.stringify({ metrics, abResult }).slice(0, 3000)}. Type: ${p.analysisType}. Period: ${p.dateRange.start}-${p.dateRange.end}. JSON: {"insights":[...],"recommendations":[...]}` }], temperature: 0.5, maxTokens: 1536 });
    ctx.trackUsage(this.llmUsage(ir.model, ir.inputTokens, ir.outputTokens));
    let insights: string[] = []; let recs: string[] = [];
    try { const d = JSON.parse(ir.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { insights?: string[]; recommendations?: string[] }; insights = d.insights ?? []; recs = d.recommendations ?? []; } catch { insights = [ir.content]; }

    yield this.progress(input.runId, 'complete', 'Report ready', 100);
    return { success: true, data: { analysisType: p.analysisType, period: p.dateRange, metrics, insights, recommendations: recs, abTestResult: abResult }, summary: `Analytics (${p.analysisType}) for ${metrics.length} items.`, artifacts: [], usage: [] };
  }
}
