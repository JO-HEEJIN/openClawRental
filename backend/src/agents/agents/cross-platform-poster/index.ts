/**
 * Cross-Platform Post Agent.
 *
 * Uploads content to YouTube Shorts and Instagram Reels.
 * Handles metadata, scheduling, and cross-platform formatting.
 *
 * Credit cost: 10-20 credits/run
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

interface PostParams {
  platforms: ('youtube' | 'instagram')[];
  videoR2Key: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  youtube?: {
    categoryId: string;
    privacyStatus: 'private' | 'unlisted' | 'public';
    accessToken: string;
  };
  instagram?: {
    igUserId: string;
    accessToken: string;
    shareToFeed: boolean;
  };
}

interface PostResult {
  platforms: PlatformPostResult[];
  summary: string;
}

interface PlatformPostResult {
  platform: 'youtube' | 'instagram';
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

export class CrossPlatformPosterAgent extends BaseAgent {
  readonly meta: AgentMeta = {
    id: 'cross-platform-poster',
    name: 'Cross-Platform Post Agent',
    description: 'Uploads Shorts/Reels to YouTube and Instagram with optimized metadata',
    category: 'cross-platform-poster',
    version: '1.0.0',
    estimatedCredits: { min: 10, max: 20 },
  };

  validate(input: AgentInput): ValidationResult {
    const params = input.params as Partial<PostParams>;
    const errors = requireStrings(input.params as Record<string, unknown>, [
      'videoR2Key',
      'title',
      'description',
    ]);

    if (!params.platforms || !Array.isArray(params.platforms) || params.platforms.length === 0) {
      errors.push(fieldError('platforms', 'At least one platform is required', 'REQUIRED'));
    }

    if (params.platforms?.includes('youtube') && !params.youtube?.accessToken) {
      errors.push(fieldError('youtube.accessToken', 'YouTube access token is required for YouTube posting', 'REQUIRED'));
    }

    if (params.platforms?.includes('instagram') && !params.instagram?.accessToken) {
      errors.push(fieldError('instagram.accessToken', 'Instagram access token is required for Instagram posting', 'REQUIRED'));
    }

    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(
    input: AgentInput,
    ctx: ExecutionContext,
  ): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const params = input.params as unknown as PostParams;
    const results: PlatformPostResult[] = [];

    // ---- Step 1: Fetch video from R2 ----
    yield this.progress(input.runId, 'fetch-video', 'Retrieving video from storage...', 5);
    this.checkAborted(ctx.signal);

    const videoObject = await ctx.storage.get(params.videoR2Key);
    if (!videoObject) {
      throw new Error(`Video not found in storage: ${params.videoR2Key}`);
    }
    const videoData = await videoObject.arrayBuffer();

    yield this.progress(input.runId, 'video-ready', 'Video retrieved', 15);

    const totalPlatforms = params.platforms.length;
    let platformIdx = 0;

    // ---- Step 2: Upload to YouTube ----
    if (params.platforms.includes('youtube') && params.youtube) {
      yield this.progress(
        input.runId,
        'youtube-upload',
        'Uploading to YouTube Shorts...',
        20 + (platformIdx / totalPlatforms) * 60,
      );
      this.checkAborted(ctx.signal);

      try {
        const youtube = new YouTubeTool(ctx.env.YOUTUBE_API_KEY);

        // Build YouTube-specific description with tags
        const ytDescription = this.buildYouTubeDescription(
          params.description,
          params.hashtags,
        );

        const uploadResult = await youtube.upload({
          title: params.title,
          description: ytDescription,
          tags: params.tags.slice(0, 500), // YouTube max 500 tags
          categoryId: params.youtube.categoryId ?? '22', // Default: People & Blogs
          privacyStatus: params.youtube.privacyStatus ?? 'private',
          videoData,
          accessToken: params.youtube.accessToken,
        });

        ctx.trackUsage(this.apiCallUsage('youtube-upload'));

        results.push({
          platform: 'youtube',
          success: true,
          postId: uploadResult.videoId,
          url: uploadResult.url,
        });

        yield this.progress(input.runId, 'youtube-done', 'YouTube upload complete', 20 + ((platformIdx + 1) / totalPlatforms) * 60);
      } catch (error) {
        results.push({
          platform: 'youtube',
          success: false,
          error: error instanceof Error ? error.message : 'YouTube upload failed',
        });
      }

      platformIdx++;
    }

    // ---- Step 3: Upload to Instagram ----
    if (params.platforms.includes('instagram') && params.instagram) {
      yield this.progress(
        input.runId,
        'instagram-upload',
        'Uploading to Instagram Reels...',
        20 + (platformIdx / totalPlatforms) * 60,
      );
      this.checkAborted(ctx.signal);

      try {
        const instagram = new InstagramTool(params.instagram.accessToken);

        // Instagram needs a public URL; store temporarily in R2 with a signed URL
        // In practice, the backend generates a presigned URL for the video
        const publicVideoUrl = `https://pub-openclaw.r2.dev/${params.videoR2Key}`;

        const igCaption = this.buildInstagramCaption(
          params.description,
          params.hashtags,
        );

        const uploadResult = await instagram.uploadReel({
          videoUrl: publicVideoUrl,
          caption: igCaption,
          accessToken: params.instagram.accessToken,
          igUserId: params.instagram.igUserId,
          shareToFeed: params.instagram.shareToFeed ?? true,
        });

        ctx.trackUsage(this.apiCallUsage('instagram-upload'));

        results.push({
          platform: 'instagram',
          success: true,
          postId: uploadResult.mediaId,
          url: uploadResult.permalink,
        });

        yield this.progress(input.runId, 'instagram-done', 'Instagram upload complete', 20 + ((platformIdx + 1) / totalPlatforms) * 60);
      } catch (error) {
        results.push({
          platform: 'instagram',
          success: false,
          error: error instanceof Error ? error.message : 'Instagram upload failed',
        });
      }

      platformIdx++;
    }

    // ---- Summary ----
    yield this.progress(input.runId, 'complete', 'Posting complete', 100);

    const successCount = results.filter((r) => r.success).length;
    const output: PostResult = {
      platforms: results,
      summary: `Posted to ${successCount}/${results.length} platforms.`,
    };

    return {
      success: successCount > 0,
      data: output as unknown as Record<string, unknown>,
      summary: output.summary,
      artifacts: [],
      usage: [],
    };
  }

  private buildYouTubeDescription(description: string, hashtags: string[]): string {
    const parts = [description];
    if (hashtags.length > 0) {
      // YouTube: hashtags in description (first 3 shown above title)
      parts.push('');
      parts.push(hashtags.slice(0, 15).join(' '));
    }
    return parts.join('\n');
  }

  private buildInstagramCaption(description: string, hashtags: string[]): string {
    const parts = [description];
    if (hashtags.length > 0) {
      parts.push('');
      parts.push('.');
      parts.push('.');
      parts.push('.');
      parts.push(hashtags.slice(0, 30).join(' '));
    }
    // Instagram max 2200 chars
    return parts.join('\n').slice(0, 2200);
  }
}
