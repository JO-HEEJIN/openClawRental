/**
 * Trend Research Agent.
 *
 * Analyzes YouTube Trending and Instagram hashtags for a user's niche.
 * Outputs a structured trend report with top topics, keywords, and competition level.
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
import { YouTubeTool } from '../../tools/youtube';
import { InstagramTool } from '../../tools/instagram';
import { ok, fail, requireStrings, fieldError } from '../../utils/validation';

interface TrendParams {
  niche: string;
  keywords: string[];
  regionCode: string;
  platforms: ('youtube' | 'instagram')[];
  language: string;
}

interface TrendReport {
  niche: string;
  generatedAt: string;
  youtube?: {
    trendingTopics: TrendTopic[];
    topKeywords: KeywordAnalysis[];
    recommendedCategories: string[];
  };
  instagram?: {
    trendingHashtags: HashtagAnalysis[];
    topPosts: { caption: string; engagement: number; hashtags: string[] }[];
  };
  aiInsights: string;
  recommendations: string[];
}

interface TrendTopic {
  topic: string;
  videoCount: number;
  avgViews: number;
  avgEngagement: number;
  competitionLevel: 'low' | 'medium' | 'high';
  exampleVideos: { title: string; views: number; videoId: string }[];
}

interface KeywordAnalysis {
  keyword: string;
  frequency: number;
  avgViews: number;
  trend: 'rising' | 'stable' | 'declining';
}

interface HashtagAnalysis {
  hashtag: string;
  mediaCount: number;
  competitionLevel: 'low' | 'medium' | 'high';
}

export class TrendResearchAgent extends BaseAgent {
  readonly meta: AgentMeta = {
    id: 'trend-research',
    name: 'Trend Research Agent',
    description: 'Analyzes trending topics on YouTube Shorts and Instagram Reels for your niche',
    category: 'trend-research',
    version: '1.0.0',
    estimatedCredits: { min: 5, max: 10 },
  };

  validate(input: AgentInput): ValidationResult {
    const params = input.params as Partial<TrendParams>;
    const errors = requireStrings(input.params as Record<string, unknown>, ['niche']);

    if (!params.platforms || !Array.isArray(params.platforms) || params.platforms.length === 0) {
      errors.push(fieldError('platforms', 'At least one platform (youtube, instagram) is required', 'REQUIRED'));
    }

    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(
    input: AgentInput,
    ctx: ExecutionContext,
  ): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const params = input.params as TrendParams;
    const niche = params.niche;
    const keywords = params.keywords ?? [niche];
    const region = params.regionCode ?? 'KR';
    const platforms = params.platforms ?? ['youtube'];

    const report: TrendReport = {
      niche,
      generatedAt: new Date().toISOString(),
      aiInsights: '',
      recommendations: [],
    };

    let progressPct = 0;

    // ---- YouTube Trending Analysis ----
    if (platforms.includes('youtube')) {
      yield this.progress(input.runId, 'youtube-search', 'Searching YouTube trending videos...', progressPct = 10);
      this.checkAborted(ctx.signal);

      const youtube = new YouTubeTool(ctx.env.YOUTUBE_API_KEY);
      const allResults = [];

      for (const keyword of keywords.slice(0, 5)) {
        const results = await youtube.searchTrending({
          query: `${keyword} shorts`,
          maxResults: 10,
          regionCode: region,
          videoDuration: 'short',
          order: 'viewCount',
          publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
        allResults.push(...results);
        ctx.trackUsage(this.apiCallUsage('youtube-data-api'));
      }

      yield this.progress(input.runId, 'youtube-analyze', 'Analyzing YouTube trends...', progressPct = 30);

      // Analyze topics from video titles/tags
      const tagFrequency = new Map<string, { count: number; totalViews: number }>();
      for (const video of allResults) {
        for (const tag of video.tags) {
          const lower = tag.toLowerCase();
          const existing = tagFrequency.get(lower) ?? { count: 0, totalViews: 0 };
          existing.count++;
          existing.totalViews += video.viewCount;
          tagFrequency.set(lower, existing);
        }
      }

      const topKeywords: KeywordAnalysis[] = Array.from(tagFrequency.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([keyword, data]) => ({
          keyword,
          frequency: data.count,
          avgViews: Math.round(data.totalViews / data.count),
          trend: 'stable' as const,
        }));

      // Group videos by topic clusters
      const trendingTopics: TrendTopic[] = keywords.map((keyword) => {
        const matchingVideos = allResults.filter(
          (v) =>
            v.title.toLowerCase().includes(keyword.toLowerCase()) ||
            v.tags.some((t) => t.toLowerCase().includes(keyword.toLowerCase())),
        );
        const avgViews =
          matchingVideos.length > 0
            ? Math.round(matchingVideos.reduce((sum, v) => sum + v.viewCount, 0) / matchingVideos.length)
            : 0;
        const avgEngagement =
          matchingVideos.length > 0
            ? Math.round(
                matchingVideos.reduce((sum, v) => sum + v.likeCount + v.commentCount, 0) /
                  matchingVideos.length,
              )
            : 0;

        return {
          topic: keyword,
          videoCount: matchingVideos.length,
          avgViews,
          avgEngagement,
          competitionLevel: matchingVideos.length > 15 ? 'high' : matchingVideos.length > 5 ? 'medium' : 'low',
          exampleVideos: matchingVideos.slice(0, 3).map((v) => ({
            title: v.title,
            views: v.viewCount,
            videoId: v.videoId,
          })),
        };
      });

      report.youtube = {
        trendingTopics,
        topKeywords,
        recommendedCategories: [...new Set(allResults.map((v) => v.categoryId))],
      };
    }

    // ---- Instagram Hashtag Analysis ----
    if (platforms.includes('instagram')) {
      yield this.progress(input.runId, 'instagram-search', 'Analyzing Instagram hashtags...', progressPct = 50);
      this.checkAborted(ctx.signal);

      const instagram = new InstagramTool(ctx.env.INSTAGRAM_ACCESS_TOKEN);
      const igUserId = (input.config['instagramUserId'] as string) ?? '';

      if (igUserId) {
        const hashtagResults: HashtagAnalysis[] = [];

        for (const keyword of keywords.slice(0, 5)) {
          try {
            const hashtags = await instagram.searchHashtags(keyword, igUserId);
            ctx.trackUsage(this.apiCallUsage('instagram-graph-api'));

            for (const h of hashtags) {
              hashtagResults.push({
                hashtag: h.name,
                mediaCount: h.mediaCount,
                competitionLevel:
                  h.mediaCount > 1_000_000 ? 'high' : h.mediaCount > 100_000 ? 'medium' : 'low',
              });
            }
          } catch {
            // Instagram API may fail for some queries
          }
        }

        report.instagram = {
          trendingHashtags: hashtagResults
            .sort((a, b) => b.mediaCount - a.mediaCount)
            .slice(0, 20),
          topPosts: [],
        };
      }
    }

    // ---- AI Insights ----
    yield this.progress(input.runId, 'ai-analysis', 'Generating AI insights...', progressPct = 70);
    this.checkAborted(ctx.signal);

    const insightPrompt = [
      `Analyze the following trend data for the "${niche}" niche in the Korean Shorts/Reels market.`,
      `Region: ${region}`,
      '',
      'YouTube data:',
      JSON.stringify(report.youtube?.trendingTopics?.slice(0, 5) ?? [], null, 2),
      '',
      'Top keywords:',
      JSON.stringify(report.youtube?.topKeywords?.slice(0, 10) ?? [], null, 2),
      '',
      'Provide:',
      '1. Key insights about current trends',
      '2. Content gap opportunities',
      '3. Recommended content angles for Shorts/Reels',
      '4. Best posting times and frequency suggestions',
      '5. Competition assessment',
      '',
      'Respond in Korean if the region is KR, otherwise in English.',
    ].join('\n');

    const llmResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a social media trend analyst specializing in Korean Shorts and Reels content.' },
        { role: 'user', content: insightPrompt },
      ],
      temperature: 0.7,
      maxTokens: 2048,
      cacheable: true,
    });

    ctx.trackUsage(this.llmUsage(llmResponse.model, llmResponse.inputTokens, llmResponse.outputTokens));

    report.aiInsights = llmResponse.content;

    // Parse recommendations from the AI response
    const recLines = llmResponse.content
      .split('\n')
      .filter((line) => /^\d+[\.\)]/.test(line.trim()))
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim());
    report.recommendations = recLines.slice(0, 10);

    yield this.progress(input.runId, 'complete', 'Trend report ready', 100);

    return {
      success: true,
      data: report as unknown as Record<string, unknown>,
      summary: `Trend analysis for "${niche}" completed. Found ${report.youtube?.trendingTopics.length ?? 0} trending topics and ${report.youtube?.topKeywords.length ?? 0} keywords.`,
      artifacts: [],
      usage: [],
    };
  }
}
