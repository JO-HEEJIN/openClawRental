import { BaseAgent } from '../../framework/agent';
import type { AgentMeta, AgentInput, AgentOutput, ValidationResult, ExecutionContext, ProgressEvent } from '../../framework/types';
import { YouTubeTool } from '../../tools/youtube';
import { InstagramTool } from '../../tools/instagram';
import { ok, fail, requireStrings, fieldError } from '../../utils/validation';

export class CrossPlatformPosterAgent extends BaseAgent {
  readonly meta: AgentMeta = { id: 'cross-platform-poster', name: 'Cross-Platform Post Agent', description: 'Uploads Shorts/Reels to YouTube and Instagram', category: 'cross-platform-poster', version: '1.0.0', estimatedCredits: { min: 10, max: 20 } };

  validate(input: AgentInput): ValidationResult {
    const p = input.params as Record<string, unknown>;
    const errors = requireStrings(p, ['videoR2Key', 'title', 'description']);
    if (!Array.isArray(p['platforms']) || !(p['platforms'] as string[]).length) errors.push(fieldError('platforms', 'Required', 'REQUIRED'));
    if ((p['platforms'] as string[])?.includes('youtube') && !(p['youtube'] as Record<string, unknown>)?.['accessToken']) errors.push(fieldError('youtube.accessToken', 'Required', 'REQUIRED'));
    if ((p['platforms'] as string[])?.includes('instagram') && !(p['instagram'] as Record<string, unknown>)?.['accessToken']) errors.push(fieldError('instagram.accessToken', 'Required', 'REQUIRED'));
    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(input: AgentInput, ctx: ExecutionContext): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const p = input.params as { platforms: string[]; videoR2Key: string; title: string; description: string; tags: string[]; hashtags: string[]; youtube?: { categoryId: string; privacyStatus: string; accessToken: string }; instagram?: { igUserId: string; accessToken: string; shareToFeed: boolean } };
    const results: { platform: string; success: boolean; postId?: string; url?: string; error?: string }[] = [];

    yield this.progress(input.runId, 'fetch', 'Retrieving video...', 5); this.checkAborted(ctx.signal);
    const obj = await ctx.storage.get(p.videoR2Key);
    if (!obj) throw new Error(`Video not found: ${p.videoR2Key}`);
    const videoData = await obj.arrayBuffer();

    if (p.platforms.includes('youtube') && p.youtube) {
      yield this.progress(input.runId, 'youtube', 'Uploading to YouTube...', 20); this.checkAborted(ctx.signal);
      try {
        const yt = new YouTubeTool(ctx.env.YOUTUBE_API_KEY);
        const r = await yt.upload({ title: p.title, description: p.description + (p.hashtags.length ? '\n\n' + p.hashtags.slice(0, 15).join(' ') : ''), tags: p.tags.slice(0, 500), categoryId: p.youtube.categoryId ?? '22', privacyStatus: p.youtube.privacyStatus as 'private' | 'unlisted' | 'public', videoData, accessToken: p.youtube.accessToken });
        ctx.trackUsage(this.apiCallUsage('youtube-upload'));
        results.push({ platform: 'youtube', success: true, postId: r.videoId, url: r.url });
      } catch (e) { results.push({ platform: 'youtube', success: false, error: e instanceof Error ? e.message : 'Failed' }); }
    }

    if (p.platforms.includes('instagram') && p.instagram) {
      yield this.progress(input.runId, 'instagram', 'Uploading to Instagram...', 55); this.checkAborted(ctx.signal);
      try {
        const ig = new InstagramTool(p.instagram.accessToken);
        const r = await ig.uploadReel({ videoUrl: `https://pub-openclaw.r2.dev/${p.videoR2Key}`, caption: (p.description + (p.hashtags.length ? '\n.\n.\n.\n' + p.hashtags.slice(0, 30).join(' ') : '')).slice(0, 2200), accessToken: p.instagram.accessToken, igUserId: p.instagram.igUserId, shareToFeed: p.instagram.shareToFeed ?? true });
        ctx.trackUsage(this.apiCallUsage('instagram-upload'));
        results.push({ platform: 'instagram', success: true, postId: r.mediaId, url: r.permalink });
      } catch (e) { results.push({ platform: 'instagram', success: false, error: e instanceof Error ? e.message : 'Failed' }); }
    }

    yield this.progress(input.runId, 'complete', 'Done', 100);
    const ok = results.filter(r => r.success).length;
    return { success: ok > 0, data: { platforms: results }, summary: `Posted to ${ok}/${results.length} platforms.`, artifacts: [], usage: [] };
  }
}
