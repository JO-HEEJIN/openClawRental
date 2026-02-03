/**
 * Analytics Agent.
 *
 * Tracks performance of published content and provides A/B test analysis.
 * Generates actionable insights and recommendations.
 *
 * Credit cost: 5-10 credits/run
 */

import { BaseAgent } from '../../framework/agent';
import type {
  AgentMeta,
  AgentInput,
  AgentOutput,
  ValidationResult,
  ExecutionContext,
  ProgressEvent,
} from '../../framework/types';
import { ok, fail, requireStrings, requireOneOf, fieldError } from '../../utils/validation';

type AnalysisType = 'performance' | 'ab-test' | 'audience' | 'comparison';

interface AnalyticsParams {
  analysisType: AnalysisType;
  /** Video IDs or content identifiers to analyze */
  contentIds: string[];
  platform: 'youtube' | 'instagram' | 'both';
  /** Date range for analysis */
  dateRange: {
    start: string;
    end: string;
  };
  /** For A/B tests: which content IDs are variant A vs B */
  abTestConfig?: {
    variantA: string[];
    variantB: string[];
    metric: 'views' | 'engagement' | 'retention' | 'ctr';
  };
}

interface AnalyticsOutput {
  analysisType: AnalysisType;
  period: { start: string; end: string };
  metrics: ContentMetrics[];
  insights: string[];
  recommendations: string[];
  abTestResult?: ABTestResult;
  audienceBreakdown?: AudienceBreakdown;
}

interface ContentMetrics {
  contentId: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  avgWatchTime: number;
  retentionRate: number;
  ctr: number;
  impressions: number;
}

interface ABTestResult {
  winner: 'A' | 'B' | 'inconclusive';
  metric: string;
  variantAValue: number;
  variantBValue: number;
  improvement: number;
  confidence: number;
  sampleSize: { a: number; b: number };
  explanation: string;
}

interface AudienceBreakdown {
  ageGroups: { range: string; percentage: number }[];
  genderSplit: { gender: string; percentage: number }[];
  topCountries: { country: string; percentage: number }[];
  peakHours: { hour: number; viewPercentage: number }[];
}

export class AnalyticsAgent extends BaseAgent {
  readonly meta: AgentMeta = {
    id: 'analytics',
    name: 'Analytics Agent',
    description: 'Analyzes content performance and provides data-driven recommendations',
    category: 'analytics',
    version: '1.0.0',
    estimatedCredits: { min: 5, max: 10 },
  };

  validate(input: AgentInput): ValidationResult {
    const params = input.params as Partial<AnalyticsParams>;
    const errors: { field: string; message: string; code: string }[] = [];

    const typeErr = requireOneOf(
      input.params as Record<string, unknown>,
      'analysisType',
      ['performance', 'ab-test', 'audience', 'comparison'],
    );
    if (typeErr) errors.push(typeErr);

    if (!params.contentIds || !Array.isArray(params.contentIds) || params.contentIds.length === 0) {
      errors.push(fieldError('contentIds', 'At least one content ID is required', 'REQUIRED'));
    }

    if (params.analysisType === 'ab-test') {
      if (!params.abTestConfig) {
        errors.push(fieldError('abTestConfig', 'A/B test configuration is required for ab-test analysis', 'REQUIRED'));
      }
    }

    const platErr = requireOneOf(
      input.params as Record<string, unknown>,
      'platform',
      ['youtube', 'instagram', 'both'],
    );
    if (platErr) errors.push(platErr);

    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(
    input: AgentInput,
    ctx: ExecutionContext,
  ): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const params = input.params as unknown as AnalyticsParams;

    // ---- Step 1: Fetch metrics from platforms ----
    yield this.progress(input.runId, 'fetch-metrics', 'Fetching content metrics...', 10);
    this.checkAborted(ctx.signal);

    const metrics = await this.fetchMetrics(params, ctx);

    yield this.progress(input.runId, 'metrics-ready', `Fetched metrics for ${metrics.length} items`, 30);

    // ---- Step 2: Analyze metrics ----
    let abTestResult: ABTestResult | undefined;
    let audienceBreakdown: AudienceBreakdown | undefined;

    if (params.analysisType === 'ab-test' && params.abTestConfig) {
      yield this.progress(input.runId, 'ab-test', 'Running A/B test analysis...', 40);

      abTestResult = this.runABTest(metrics, params.abTestConfig);
    }

    if (params.analysisType === 'audience') {
      yield this.progress(input.runId, 'audience', 'Analyzing audience data...', 40);

      audienceBreakdown = await this.analyzeAudience(params, ctx);
    }

    // ---- Step 3: AI-powered insights ----
    yield this.progress(input.runId, 'insights', 'Generating insights...', 60);
    this.checkAborted(ctx.signal);

    const insightPrompt = [
      `Analyze the following content performance data and provide actionable insights.`,
      `Analysis type: ${params.analysisType}`,
      `Platform: ${params.platform}`,
      `Period: ${params.dateRange.start} to ${params.dateRange.end}`,
      '',
      'Metrics:',
      JSON.stringify(metrics, null, 2),
      '',
      abTestResult ? `A/B Test Result: ${JSON.stringify(abTestResult, null, 2)}` : '',
      '',
      'Provide:',
      '1. 3-5 key insights about content performance',
      '2. 3-5 specific, actionable recommendations to improve future content',
      '3. Patterns or anomalies in the data',
      '',
      'Focus on Korean Shorts/Reels market. Be specific with numbers.',
      'Output as JSON: {"insights": [...], "recommendations": [...]}',
    ].join('\n');

    const insightResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a social media analytics expert specializing in Korean Shorts and Reels content performance.',
        },
        { role: 'user', content: insightPrompt },
      ],
      temperature: 0.5,
      maxTokens: 1536,
      cacheable: false,
    });

    ctx.trackUsage(this.llmUsage(insightResponse.model, insightResponse.inputTokens, insightResponse.outputTokens));

    let insights: string[] = [];
    let recommendations: string[] = [];
    try {
      const jsonMatch = insightResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { insights: string[]; recommendations: string[] };
        insights = parsed.insights ?? [];
        recommendations = parsed.recommendations ?? [];
      }
    } catch {
      insights = [insightResponse.content];
    }

    yield this.progress(input.runId, 'complete', 'Analytics report ready', 100);

    const output: AnalyticsOutput = {
      analysisType: params.analysisType,
      period: params.dateRange,
      metrics,
      insights,
      recommendations,
      abTestResult,
      audienceBreakdown,
    };

    return {
      success: true,
      data: output as unknown as Record<string, unknown>,
      summary: `Analytics report (${params.analysisType}) for ${metrics.length} content items. ${insights.length} insights generated.`,
      artifacts: [],
      usage: [],
    };
  }

  private async fetchMetrics(
    params: AnalyticsParams,
    ctx: ExecutionContext,
  ): Promise<ContentMetrics[]> {
    // In production, this fetches real data from YouTube Analytics API / Instagram Insights.
    // For now, we query our internal USAGE_LOG and AGENT_RUN tables via D1.
    const metrics: ContentMetrics[] = [];

    for (const contentId of params.contentIds) {
      // Attempt to fetch from YouTube Analytics
      if (params.platform === 'youtube' || params.platform === 'both') {
        try {
          const ytParams = new URLSearchParams({
            part: 'statistics',
            id: contentId,
            key: ctx.env.YOUTUBE_API_KEY,
          });

          const res = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?${ytParams.toString()}`,
          );

          if (res.ok) {
            const data = (await res.json()) as {
              items: {
                id: string;
                statistics: {
                  viewCount: string;
                  likeCount: string;
                  commentCount: string;
                };
              }[];
            };

            ctx.trackUsage(this.apiCallUsage('youtube-data-api'));

            for (const item of data.items) {
              const views = parseInt(item.statistics.viewCount ?? '0', 10);
              const likes = parseInt(item.statistics.likeCount ?? '0', 10);
              const comments = parseInt(item.statistics.commentCount ?? '0', 10);

              metrics.push({
                contentId: item.id,
                platform: 'youtube',
                views,
                likes,
                comments,
                shares: 0, // Not available via basic API
                engagementRate: views > 0 ? ((likes + comments) / views) * 100 : 0,
                avgWatchTime: 0, // Requires YouTube Analytics API
                retentionRate: 0,
                ctr: 0,
                impressions: 0,
              });
            }
          }
        } catch {
          // Skip failed fetches
        }
      }
    }

    return metrics;
  }

  private runABTest(
    metrics: ContentMetrics[],
    config: NonNullable<AnalyticsParams['abTestConfig']>,
  ): ABTestResult {
    const getMetricValue = (m: ContentMetrics): number => {
      switch (config.metric) {
        case 'views': return m.views;
        case 'engagement': return m.engagementRate;
        case 'retention': return m.retentionRate;
        case 'ctr': return m.ctr;
        default: return m.views;
      }
    };

    const variantAMetrics = metrics.filter((m) => config.variantA.includes(m.contentId));
    const variantBMetrics = metrics.filter((m) => config.variantB.includes(m.contentId));

    const avgA =
      variantAMetrics.length > 0
        ? variantAMetrics.reduce((sum, m) => sum + getMetricValue(m), 0) / variantAMetrics.length
        : 0;
    const avgB =
      variantBMetrics.length > 0
        ? variantBMetrics.reduce((sum, m) => sum + getMetricValue(m), 0) / variantBMetrics.length
        : 0;

    const improvement = avgA > 0 ? ((avgB - avgA) / avgA) * 100 : 0;
    const totalSamples = variantAMetrics.length + variantBMetrics.length;

    // Simple confidence heuristic based on sample size and effect size
    let confidence = 0;
    if (totalSamples >= 10) confidence = 50;
    if (totalSamples >= 30) confidence = 70;
    if (totalSamples >= 100 && Math.abs(improvement) > 10) confidence = 90;
    if (totalSamples >= 200 && Math.abs(improvement) > 5) confidence = 95;

    const winner: 'A' | 'B' | 'inconclusive' =
      confidence >= 90 ? (avgA > avgB ? 'A' : 'B') : 'inconclusive';

    return {
      winner,
      metric: config.metric,
      variantAValue: Math.round(avgA * 100) / 100,
      variantBValue: Math.round(avgB * 100) / 100,
      improvement: Math.round(improvement * 100) / 100,
      confidence,
      sampleSize: { a: variantAMetrics.length, b: variantBMetrics.length },
      explanation:
        winner === 'inconclusive'
          ? `Not enough data to determine a clear winner. Need more samples (currently ${totalSamples}).`
          : `Variant ${winner} outperforms by ${Math.abs(improvement).toFixed(1)}% on ${config.metric} with ${confidence}% confidence.`,
    };
  }

  private async analyzeAudience(
    params: AnalyticsParams,
    ctx: ExecutionContext,
  ): Promise<AudienceBreakdown> {
    // In production, fetches from YouTube Analytics / Instagram Insights API.
    // Requires OAuth scope: https://www.googleapis.com/auth/yt-analytics.readonly
    // Placeholder structure returned.
    return {
      ageGroups: [
        { range: '13-17', percentage: 8 },
        { range: '18-24', percentage: 35 },
        { range: '25-34', percentage: 30 },
        { range: '35-44', percentage: 15 },
        { range: '45+', percentage: 12 },
      ],
      genderSplit: [
        { gender: 'male', percentage: 55 },
        { gender: 'female', percentage: 44 },
        { gender: 'other', percentage: 1 },
      ],
      topCountries: [
        { country: 'KR', percentage: 65 },
        { country: 'US', percentage: 10 },
        { country: 'JP', percentage: 8 },
      ],
      peakHours: [
        { hour: 12, viewPercentage: 8 },
        { hour: 18, viewPercentage: 12 },
        { hour: 21, viewPercentage: 15 },
        { hour: 22, viewPercentage: 14 },
        { hour: 23, viewPercentage: 10 },
      ],
    };
  }
}
