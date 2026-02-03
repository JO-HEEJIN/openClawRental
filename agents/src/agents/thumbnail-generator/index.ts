/**
 * Thumbnail Generator Agent.
 *
 * Generates AI-powered thumbnails for YouTube Shorts and Instagram Reels.
 * Supports text overlay planning and stores results in R2.
 *
 * Credit cost: 20-40 credits/run
 */

import { BaseAgent } from '../../framework/agent';
import type {
  AgentMeta,
  AgentInput,
  AgentOutput,
  ValidationResult,
  ExecutionContext,
  ProgressEvent,
  ArtifactRef,
} from '../../framework/types';
import { ImageGenTool } from '../../tools/image-gen';
import { ok, fail, requireStrings, requireOneOf, fieldError } from '../../utils/validation';

interface ThumbnailParams {
  topic: string;
  style: 'minimalist' | 'bold' | 'aesthetic' | 'meme' | 'professional';
  textOverlay?: string;
  colorScheme?: string;
  mood?: string;
  orientation: 'portrait' | 'landscape' | 'square';
  variations?: number;
}

interface ThumbnailOutput {
  topic: string;
  thumbnails: ThumbnailResult[];
  designSuggestions: string[];
}

interface ThumbnailResult {
  url: string;
  r2Key: string;
  style: string;
  prompt: string;
  revisedPrompt: string;
  sizeBytes: number;
  textOverlayPlan?: TextOverlayPlan;
}

interface TextOverlayPlan {
  text: string;
  position: 'top' | 'center' | 'bottom';
  suggestedFont: string;
  suggestedSize: string;
  suggestedColor: string;
  backgroundColor?: string;
}

const STYLE_PROMPTS: Record<string, string> = {
  minimalist: 'Clean, minimal design with lots of white space, simple shapes, modern typography area',
  bold: 'Bold, vibrant colors, high contrast, energetic composition, strong visual impact',
  aesthetic: 'Soft pastel colors, dreamy atmosphere, aesthetically pleasing, Instagram-worthy',
  meme: 'Internet culture style, bold text-friendly layout, reaction-style composition, relatable',
  professional: 'Corporate clean, trustworthy blue tones, sharp imagery, data-visualization friendly',
};

export class ThumbnailGeneratorAgent extends BaseAgent {
  readonly meta: AgentMeta = {
    id: 'thumbnail-generator',
    name: 'Thumbnail Generator Agent',
    description: 'Creates AI-generated thumbnails optimized for Shorts and Reels',
    category: 'thumbnail-generator',
    version: '1.0.0',
    estimatedCredits: { min: 20, max: 40 },
  };

  validate(input: AgentInput): ValidationResult {
    const errors = requireStrings(input.params as Record<string, unknown>, ['topic']);

    const styleErr = requireOneOf(
      input.params as Record<string, unknown>,
      'style',
      ['minimalist', 'bold', 'aesthetic', 'meme', 'professional'],
    );
    if (styleErr) errors.push(styleErr);

    const orientErr = requireOneOf(
      input.params as Record<string, unknown>,
      'orientation',
      ['portrait', 'landscape', 'square'],
    );
    if (orientErr) errors.push(orientErr);

    const params = input.params as Partial<ThumbnailParams>;
    if (params.variations !== undefined && (params.variations < 1 || params.variations > 4)) {
      errors.push(fieldError('variations', 'variations must be between 1 and 4', 'OUT_OF_RANGE'));
    }

    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(
    input: AgentInput,
    ctx: ExecutionContext,
  ): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const params = input.params as ThumbnailParams;
    const variations = params.variations ?? 1;
    const imageGen = new ImageGenTool(ctx.env.OPENAI_API_KEY);

    const thumbnails: ThumbnailResult[] = [];
    const artifacts: ArtifactRef[] = [];

    // ---- Step 1: Plan text overlay if requested ----
    let textOverlayPlan: TextOverlayPlan | undefined;

    if (params.textOverlay) {
      yield this.progress(input.runId, 'text-plan', 'Planning text overlay...', 5);

      const overlayResponse = await ctx.aiGateway.chat({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a graphic designer specializing in social media thumbnails.',
          },
          {
            role: 'user',
            content: [
              `Plan a text overlay for a ${params.orientation} thumbnail.`,
              `Text: "${params.textOverlay}"`,
              `Style: ${params.style}`,
              `Topic: ${params.topic}`,
              '',
              'Suggest: position (top/center/bottom), font style, font size (relative), text color hex, optional background color hex.',
              'Output as JSON: {"text": "...", "position": "...", "suggestedFont": "...", "suggestedSize": "...", "suggestedColor": "#...", "backgroundColor": "#..."}',
            ].join('\n'),
          },
        ],
        temperature: 0.7,
        maxTokens: 256,
        cacheable: true,
      });

      ctx.trackUsage(
        this.llmUsage(overlayResponse.model, overlayResponse.inputTokens, overlayResponse.outputTokens),
      );

      try {
        const jsonMatch = overlayResponse.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          textOverlayPlan = JSON.parse(jsonMatch[0]) as TextOverlayPlan;
        }
      } catch {
        textOverlayPlan = {
          text: params.textOverlay,
          position: 'bottom',
          suggestedFont: 'Noto Sans KR Bold',
          suggestedSize: '48px',
          suggestedColor: '#FFFFFF',
          backgroundColor: '#000000CC',
        };
      }
    }

    // ---- Step 2: Generate image(s) ----
    const dimensions = this.getDimensions(params.orientation);

    for (let i = 0; i < variations; i++) {
      const varLabel = variations > 1 ? ` (variation ${i + 1}/${variations})` : '';
      yield this.progress(
        input.runId,
        'generate',
        `Generating thumbnail${varLabel}...`,
        10 + (i / variations) * 70,
      );
      this.checkAborted(ctx.signal);

      const styleDesc = STYLE_PROMPTS[params.style] ?? STYLE_PROMPTS['bold'];
      const prompt = imageGen.buildThumbnailPrompt(
        params.topic,
        `${styleDesc}. ${params.mood ? `Mood: ${params.mood}.` : ''} ${params.colorScheme ? `Color scheme: ${params.colorScheme}.` : ''}`,
        params.textOverlay,
      );

      const result = await imageGen.generate({
        prompt,
        width: dimensions.width,
        height: dimensions.height,
        style: params.style === 'meme' || params.style === 'bold' ? 'vivid' : 'natural',
        quality: 'standard',
      });

      ctx.trackUsage(this.apiCallUsage('image-generation'));

      // ---- Step 3: Store in R2 ----
      yield this.progress(
        input.runId,
        'store',
        `Storing thumbnail${varLabel}...`,
        80 + (i / variations) * 15,
      );

      const r2Key = `thumbnails/${input.userId}/${input.runId}/${i}.png`;
      await ctx.storage.put(r2Key, result.imageData, {
        httpMetadata: { contentType: result.contentType },
        customMetadata: {
          topic: params.topic,
          style: params.style,
          runId: input.runId,
        },
      });

      ctx.trackUsage(this.storageUsage(result.imageData.byteLength));

      const artifact: ArtifactRef = {
        key: r2Key,
        bucket: 'AGENT_STORAGE',
        contentType: result.contentType,
        sizeBytes: result.imageData.byteLength,
      };
      artifacts.push(artifact);

      thumbnails.push({
        url: '', // Will be resolved by the API layer with a signed URL
        r2Key,
        style: params.style,
        prompt,
        revisedPrompt: result.revisedPrompt,
        sizeBytes: result.imageData.byteLength,
        textOverlayPlan,
      });
    }

    // ---- Step 4: Design suggestions ----
    yield this.progress(input.runId, 'suggestions', 'Generating design tips...', 95);

    const suggestResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a YouTube Shorts thumbnail expert.',
        },
        {
          role: 'user',
          content: `Give 3-5 brief tips for improving a ${params.style} thumbnail about "${params.topic}" for ${params.orientation} format. Keep each tip to one sentence. Output as JSON string array.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 512,
      cacheable: true,
    });

    ctx.trackUsage(
      this.llmUsage(suggestResponse.model, suggestResponse.inputTokens, suggestResponse.outputTokens),
    );

    let designSuggestions: string[] = [];
    try {
      const jsonMatch = suggestResponse.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        designSuggestions = JSON.parse(jsonMatch[0]) as string[];
      }
    } catch {
      designSuggestions = ['Use high contrast text for readability on mobile devices.'];
    }

    yield this.progress(input.runId, 'complete', 'Thumbnails ready', 100);

    const output: ThumbnailOutput = {
      topic: params.topic,
      thumbnails,
      designSuggestions,
    };

    return {
      success: true,
      data: output as unknown as Record<string, unknown>,
      summary: `Generated ${thumbnails.length} ${params.style} thumbnail(s) for "${params.topic}".`,
      artifacts,
      usage: [],
    };
  }

  private getDimensions(orientation: string): { width: number; height: number } {
    switch (orientation) {
      case 'portrait':
        return { width: 1080, height: 1920 };
      case 'landscape':
        return { width: 1920, height: 1080 };
      case 'square':
        return { width: 1080, height: 1080 };
      default:
        return { width: 1080, height: 1920 };
    }
  }
}
