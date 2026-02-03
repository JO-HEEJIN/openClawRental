import { BaseAgent } from '../../framework/agent';
import type { AgentMeta, AgentInput, AgentOutput, ValidationResult, ExecutionContext, ProgressEvent } from '../../framework/types';
import { YouTubeTool } from '../../tools/youtube';
import { InstagramTool } from '../../tools/instagram';
import { ok, fail, requireStrings, fieldError } from '../../utils/validation';

export class TrendResearchAgent extends BaseAgent {
  readonly meta: AgentMeta = { id: 'trend-research', name: 'Trend Research Agent', description: 'Analyzes trending topics on YouTube Shorts and Instagram Reels', category: 'trend-research', version: '1.0.0', estimatedCredits: { min: 5, max: 10 } };

  validate(input: AgentInput): ValidationResult {
    const errors = requireStrings(input.params as Record<string, unknown>, ['niche']);
    const platforms = (input.params as Record<string, unknown>)['platforms'];
    if (!Array.isArray(platforms) || platforms.length === 0) errors.push(fieldError('platforms', 'At least one platform required', 'REQUIRED'));
    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(input: AgentInput, ctx: ExecutionContext): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const p = input.params as { niche: string; keywords?: string[]; regionCode?: string; platforms: string[] };
    const keywords = p.keywords ?? [p.niche];
    const region = p.regionCode ?? 'KR';
    const report: Record<string, unknown> = { niche: p.niche, generatedAt: new Date().toISOString() };

    if (p.platforms.includes('youtube')) {
      yield this.progress(input.runId, 'youtube-search', 'Searching YouTube trending...', 10);
      this.checkAborted(ctx.signal);
      const yt = new YouTubeTool(ctx.env.YOUTUBE_API_KEY);
      const results: import('../../tools/youtube').YouTubeTrendResult[] = [];
      for (const kw of keywords.slice(0, 5)) {
        const r = await yt.searchTrending({ query: `${kw} shorts`, maxResults: 10, regionCode: region, videoDuration: 'short', order: 'viewCount', publishedAfter: new Date(Date.now() - 7 * 86400000).toISOString() });
        results.push(...r); ctx.trackUsage(this.apiCallUsage('youtube-data-api'));
      }
      yield this.progress(input.runId, 'youtube-analyze', 'Analyzing trends...', 30);
      const tagFreq = new Map<string, { count: number; totalViews: number }>();
      for (const v of results) for (const tag of v.tags) { const l = tag.toLowerCase(); const e = tagFreq.get(l) ?? { count: 0, totalViews: 0 }; e.count++; e.totalViews += v.viewCount; tagFreq.set(l, e); }
      report.youtube = {
        trendingTopics: keywords.map(kw => { const m = results.filter(v => v.title.toLowerCase().includes(kw.toLowerCase()) || v.tags.some(t => t.toLowerCase().includes(kw.toLowerCase()))); return { topic: kw, videoCount: m.length, avgViews: m.length ? Math.round(m.reduce((s, v) => s + v.viewCount, 0) / m.length) : 0, competitionLevel: m.length > 15 ? 'high' : m.length > 5 ? 'medium' : 'low', examples: m.slice(0, 3).map(v => ({ title: v.title, views: v.viewCount, videoId: v.videoId })) }; }),
        topKeywords: Array.from(tagFreq.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 20).map(([k, d]) => ({ keyword: k, frequency: d.count, avgViews: Math.round(d.totalViews / d.count) })),
      };
    }

    if (p.platforms.includes('instagram')) {
      yield this.progress(input.runId, 'instagram', 'Analyzing Instagram hashtags...', 50);
      this.checkAborted(ctx.signal);
      const ig = new InstagramTool(ctx.env.INSTAGRAM_ACCESS_TOKEN);
      const igUid = (input.config['instagramUserId'] as string) ?? '';
      if (igUid) {
        const hashtags = [];
        for (const kw of keywords.slice(0, 5)) { try { const h = await ig.searchHashtags(kw, igUid); ctx.trackUsage(this.apiCallUsage('instagram-graph-api')); for (const x of h) hashtags.push({ hashtag: x.name, mediaCount: x.mediaCount, competitionLevel: x.mediaCount > 1e6 ? 'high' : x.mediaCount > 1e5 ? 'medium' : 'low' }); } catch {} }
        report.instagram = { trendingHashtags: hashtags.sort((a, b) => b.mediaCount - a.mediaCount).slice(0, 20) };
      }
    }

    yield this.progress(input.runId, 'ai-analysis', 'Generating AI insights...', 70);
    this.checkAborted(ctx.signal);
    const llm = await ctx.aiGateway.chat({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a social media trend analyst for Korean Shorts/Reels.' }, { role: 'user', content: `Analyze trends for "${p.niche}" (${region}). Data: ${JSON.stringify(report).slice(0, 3000)}. Provide insights and recommendations. Korean if KR.` }], temperature: 0.7, maxTokens: 2048, cacheable: true });
    ctx.trackUsage(this.llmUsage(llm.model, llm.inputTokens, llm.outputTokens));
    report.aiInsights = llm.content;

    yield this.progress(input.runId, 'complete', 'Trend report ready', 100);
    return { success: true, data: report, summary: `Trend analysis for "${p.niche}" completed.`, artifacts: [], usage: [] };
  }
}
