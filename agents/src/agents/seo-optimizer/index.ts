/**
 * SEO Optimization Agent.
 *
 * Optimizes titles, descriptions, and tags for YouTube Shorts and Instagram Reels.
 * Analyzes competitor metadata and generates optimized alternatives.
 *
 * Credit cost: 5-15 credits/run
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
import { ok, fail, requireStrings, requireOneOf } from '../../utils/validation';

type Platform = 'youtube' | 'instagram' | 'both';
type Language = 'ko' | 'en' | 'ja';

interface SEOParams {
  topic: string;
  platform: Platform;
  language: Language;
  currentTitle?: string;
  currentDescription?: string;
  currentTags?: string[];
  niche?: string;
  targetKeywords?: string[];
}

interface SEOOutput {
  platform: Platform;
  titles: TitleSuggestion[];
  description: DescriptionResult;
  tags: TagResult;
  hashtags: string[];
  seoScore: SEOScore;
}

interface TitleSuggestion {
  title: string;
  characterCount: number;
  score: number;
  reasoning: string;
}

interface DescriptionResult {
  description: string;
  characterCount: number;
  keywordsUsed: string[];
  ctaIncluded: boolean;
}

interface TagResult {
  primary: string[];
  secondary: string[];
  longTail: string[];
  total: number;
}

interface SEOScore {
  overall: number;
  titleScore: number;
  descriptionScore: number;
  tagScore: number;
  improvements: string[];
}

export class SEOOptimizerAgent extends BaseAgent {
  readonly meta: AgentMeta = {
    id: 'seo-optimizer',
    name: 'SEO Optimization Agent',
    description: 'Optimizes titles, descriptions, tags, and hashtags for maximum discoverability',
    category: 'seo-optimizer',
    version: '1.0.0',
    estimatedCredits: { min: 5, max: 15 },
  };

  validate(input: AgentInput): ValidationResult {
    const errors = requireStrings(input.params as Record<string, unknown>, ['topic']);

    const platErr = requireOneOf(
      input.params as Record<string, unknown>,
      'platform',
      ['youtube', 'instagram', 'both'],
    );
    if (platErr) errors.push(platErr);

    const langErr = requireOneOf(
      input.params as Record<string, unknown>,
      'language',
      ['ko', 'en', 'ja'],
    );
    if (langErr) errors.push(langErr);

    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(
    input: AgentInput,
    ctx: ExecutionContext,
  ): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const params = input.params as SEOParams;

    // ---- Step 1: Keyword research ----
    yield this.progress(input.runId, 'keywords', 'Researching keywords...', 10);
    this.checkAborted(ctx.signal);

    const keywordPrompt = [
      `You are a YouTube/Instagram SEO expert specializing in ${params.language === 'ko' ? 'Korean' : params.language === 'ja' ? 'Japanese' : 'English'} content.`,
      '',
      `Research keywords for the topic: "${params.topic}"`,
      params.niche ? `Niche: ${params.niche}` : '',
      params.targetKeywords?.length ? `Target keywords: ${params.targetKeywords.join(', ')}` : '',
      '',
      'Provide:',
      '1. 10 high-volume primary keywords',
      '2. 10 medium-competition secondary keywords',
      '3. 10 long-tail keywords (3+ words)',
      '',
      'Output as JSON: {"primary": [...], "secondary": [...], "longTail": [...]}',
    ].join('\n');

    const keywordResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an SEO keyword research specialist.' },
        { role: 'user', content: keywordPrompt },
      ],
      temperature: 0.5,
      maxTokens: 1024,
      cacheable: true,
    });

    ctx.trackUsage(this.llmUsage(keywordResponse.model, keywordResponse.inputTokens, keywordResponse.outputTokens));

    let tags: TagResult = { primary: [], secondary: [], longTail: [], total: 0 };
    try {
      const jsonMatch = keywordResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { primary: string[]; secondary: string[]; longTail: string[] };
        tags = {
          primary: parsed.primary ?? [],
          secondary: parsed.secondary ?? [],
          longTail: parsed.longTail ?? [],
          total: (parsed.primary?.length ?? 0) + (parsed.secondary?.length ?? 0) + (parsed.longTail?.length ?? 0),
        };
      }
    } catch {
      // Continue with empty tags
    }

    // ---- Step 2: Generate optimized titles ----
    yield this.progress(input.runId, 'titles', 'Generating optimized titles...', 30);
    this.checkAborted(ctx.signal);

    const titlePrompt = [
      `Generate 5 SEO-optimized titles for a ${params.platform === 'instagram' ? 'Reel' : 'YouTube Short'}.`,
      `Topic: "${params.topic}"`,
      params.currentTitle ? `Current title: "${params.currentTitle}"` : '',
      `Primary keywords to include: ${tags.primary.slice(0, 5).join(', ')}`,
      '',
      'Requirements:',
      params.platform === 'youtube' || params.platform === 'both'
        ? '- YouTube: max 100 characters, front-load keywords'
        : '',
      '- Include emotional triggers or curiosity gaps',
      '- Use power words that drive clicks',
      `- Language: ${params.language === 'ko' ? 'Korean' : params.language === 'ja' ? 'Japanese' : 'English'}`,
      '',
      'Output as JSON array: [{"title": "...", "characterCount": N, "score": 0-100, "reasoning": "..."}]',
      'Score based on: keyword placement, emotional appeal, clarity, length optimization.',
    ].join('\n');

    const titleResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a viral content title optimizer.' },
        { role: 'user', content: titlePrompt },
      ],
      temperature: 0.8,
      maxTokens: 1024,
    });

    ctx.trackUsage(this.llmUsage(titleResponse.model, titleResponse.inputTokens, titleResponse.outputTokens));

    let titles: TitleSuggestion[] = [];
    try {
      const jsonMatch = titleResponse.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        titles = JSON.parse(jsonMatch[0]) as TitleSuggestion[];
      }
    } catch {
      // Continue with empty titles
    }

    // ---- Step 3: Generate optimized description ----
    yield this.progress(input.runId, 'description', 'Writing optimized description...', 55);
    this.checkAborted(ctx.signal);

    const descPrompt = [
      `Write an SEO-optimized description for a ${params.platform === 'instagram' ? 'Reel' : 'YouTube Short'}.`,
      `Topic: "${params.topic}"`,
      `Best title: "${titles[0]?.title ?? params.topic}"`,
      params.currentDescription ? `Current description: "${params.currentDescription}"` : '',
      `Keywords to include: ${[...tags.primary.slice(0, 3), ...tags.secondary.slice(0, 3)].join(', ')}`,
      '',
      'Requirements:',
      params.platform === 'youtube' || params.platform === 'both'
        ? '- YouTube: max 5000 chars, first 2 lines most important (shown before "Show more")'
        : '',
      params.platform === 'instagram' || params.platform === 'both'
        ? '- Instagram: max 2200 chars, first line is caption preview'
        : '',
      '- Include a clear call to action',
      '- Natural keyword integration (no keyword stuffing)',
      `- Language: ${params.language === 'ko' ? 'Korean' : params.language === 'ja' ? 'Japanese' : 'English'}`,
      '',
      'Output as JSON: {"description": "...", "characterCount": N, "keywordsUsed": [...], "ctaIncluded": true}',
    ].join('\n');

    const descResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a social media SEO copywriter.' },
        { role: 'user', content: descPrompt },
      ],
      temperature: 0.7,
      maxTokens: 1024,
    });

    ctx.trackUsage(this.llmUsage(descResponse.model, descResponse.inputTokens, descResponse.outputTokens));

    let description: DescriptionResult = {
      description: '',
      characterCount: 0,
      keywordsUsed: [],
      ctaIncluded: false,
    };
    try {
      const jsonMatch = descResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        description = JSON.parse(jsonMatch[0]) as DescriptionResult;
      }
    } catch {
      // Continue with empty description
    }

    // ---- Step 4: Generate hashtags ----
    yield this.progress(input.runId, 'hashtags', 'Generating hashtags...', 75);

    const hashtagPrompt = [
      `Generate 30 optimized hashtags for a ${params.platform} post about "${params.topic}".`,
      '',
      'Mix of:',
      '- 5 high-volume hashtags (1M+ posts)',
      '- 10 medium-volume hashtags (100K-1M posts)',
      '- 10 niche-specific hashtags (10K-100K posts)',
      '- 5 branded/unique hashtags',
      '',
      `Language: ${params.language === 'ko' ? 'Korean (mix Korean and English hashtags)' : params.language === 'ja' ? 'Japanese (mix Japanese and English)' : 'English'}`,
      '',
      'Output as JSON string array: ["#hashtag1", "#hashtag2", ...]',
    ].join('\n');

    const hashtagResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a social media hashtag strategist.' },
        { role: 'user', content: hashtagPrompt },
      ],
      temperature: 0.7,
      maxTokens: 512,
      cacheable: true,
    });

    ctx.trackUsage(this.llmUsage(hashtagResponse.model, hashtagResponse.inputTokens, hashtagResponse.outputTokens));

    let hashtags: string[] = [];
    try {
      const jsonMatch = hashtagResponse.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        hashtags = JSON.parse(jsonMatch[0]) as string[];
      }
    } catch {
      // Continue with empty hashtags
    }

    // ---- Step 5: Calculate SEO score ----
    yield this.progress(input.runId, 'score', 'Calculating SEO score...', 90);

    const seoScore = this.calculateSEOScore(titles, description, tags, hashtags);

    yield this.progress(input.runId, 'complete', 'SEO optimization ready', 100);

    const output: SEOOutput = {
      platform: params.platform,
      titles,
      description,
      tags,
      hashtags,
      seoScore,
    };

    return {
      success: true,
      data: output as unknown as Record<string, unknown>,
      summary: `SEO optimization for "${params.topic}" complete. Score: ${seoScore.overall}/100. Generated ${titles.length} titles, ${tags.total} tags, ${hashtags.length} hashtags.`,
      artifacts: [],
      usage: [],
    };
  }

  private calculateSEOScore(
    titles: TitleSuggestion[],
    description: DescriptionResult,
    tags: TagResult,
    hashtags: string[],
  ): SEOScore {
    const improvements: string[] = [];

    // Title score
    let titleScore = 0;
    if (titles.length > 0) {
      const bestTitle = titles.reduce((a, b) => (a.score > b.score ? a : b));
      titleScore = bestTitle.score;
      if (bestTitle.characterCount > 70) {
        improvements.push('Consider a shorter title for better mobile display');
      }
    } else {
      improvements.push('No optimized titles generated');
    }

    // Description score
    let descriptionScore = 0;
    if (description.description.length > 0) {
      descriptionScore = 50;
      if (description.keywordsUsed.length >= 3) descriptionScore += 20;
      if (description.ctaIncluded) descriptionScore += 15;
      if (description.characterCount >= 100) descriptionScore += 15;
    } else {
      improvements.push('Add an optimized description');
    }

    // Tag score
    let tagScore = 0;
    if (tags.total > 0) {
      tagScore = Math.min(100, (tags.total / 30) * 100);
      if (tags.longTail.length < 5) {
        improvements.push('Add more long-tail keywords for niche targeting');
      }
    } else {
      improvements.push('Add keyword tags for discoverability');
    }

    // Hashtag bonus
    if (hashtags.length < 10) {
      improvements.push('Use at least 10 hashtags for better reach');
    }

    const overall = Math.round((titleScore * 0.4 + descriptionScore * 0.35 + tagScore * 0.25));

    return { overall, titleScore, descriptionScore, tagScore, improvements };
  }
}
