import { BaseAgent } from '../../framework/agent';
import type { AgentMeta, AgentInput, AgentOutput, ValidationResult, ExecutionContext, ProgressEvent, ArtifactRef } from '../../framework/types';
import { ImageGenTool } from '../../tools/image-gen';
import { ok, fail, requireStrings, requireOneOf, fieldError } from '../../utils/validation';

const STYLES: Record<string, string> = { minimalist: 'Clean minimal white space', bold: 'Bold vibrant high contrast', aesthetic: 'Soft pastel dreamy', meme: 'Internet culture bold text', professional: 'Corporate clean trustworthy' };

export class ThumbnailGeneratorAgent extends BaseAgent {
  readonly meta: AgentMeta = { id: 'thumbnail-generator', name: 'Thumbnail Generator Agent', description: 'Creates AI-generated thumbnails for Shorts and Reels', category: 'thumbnail-generator', version: '1.0.0', estimatedCredits: { min: 20, max: 40 } };

  validate(input: AgentInput): ValidationResult {
    const p = input.params as Record<string, unknown>;
    const errors = requireStrings(p, ['topic']);
    const sE = requireOneOf(p, 'style', ['minimalist', 'bold', 'aesthetic', 'meme', 'professional']); if (sE) errors.push(sE);
    const oE = requireOneOf(p, 'orientation', ['portrait', 'landscape', 'square']); if (oE) errors.push(oE);
    if (p['variations'] !== undefined && (typeof p['variations'] !== 'number' || p['variations'] < 1 || p['variations'] > 4)) errors.push(fieldError('variations', 'Must be 1-4', 'OUT_OF_RANGE'));
    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(input: AgentInput, ctx: ExecutionContext): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const p = input.params as { topic: string; style: string; textOverlay?: string; colorScheme?: string; mood?: string; orientation: string; variations?: number };
    const vars = p.variations ?? 1; const ig = new ImageGenTool(ctx.env.OPENAI_API_KEY);
    const thumbs: Record<string, unknown>[] = []; const artifacts: ArtifactRef[] = [];
    const dims = p.orientation === 'portrait' ? { w: 1080, h: 1920 } : p.orientation === 'landscape' ? { w: 1920, h: 1080 } : { w: 1080, h: 1080 };

    let textPlan: Record<string, unknown> | undefined;
    if (p.textOverlay) {
      yield this.progress(input.runId, 'text-plan', 'Planning text overlay...', 5);
      const r = await ctx.aiGateway.chat({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'Graphic designer for thumbnails.' }, { role: 'user', content: `Text overlay for ${p.orientation} thumbnail. Text: "${p.textOverlay}". Style: ${p.style}. JSON: {"text":"...","position":"top|center|bottom","suggestedFont":"...","suggestedColor":"#..."}` }], temperature: 0.7, maxTokens: 256, cacheable: true });
      ctx.trackUsage(this.llmUsage(r.model, r.inputTokens, r.outputTokens));
      try { textPlan = JSON.parse(r.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch {}
    }

    for (let i = 0; i < vars; i++) {
      yield this.progress(input.runId, 'generate', `Generating thumbnail ${i + 1}/${vars}...`, 10 + (i / vars) * 75); this.checkAborted(ctx.signal);
      const prompt = ig.buildThumbnailPrompt(p.topic, `${STYLES[p.style] ?? STYLES['bold']}. ${p.mood ? `Mood: ${p.mood}.` : ''} ${p.colorScheme ? `Colors: ${p.colorScheme}.` : ''}`, p.textOverlay);
      const result = await ig.generate({ prompt, width: dims.w, height: dims.h, style: p.style === 'meme' || p.style === 'bold' ? 'vivid' : 'natural' });
      ctx.trackUsage(this.apiCallUsage('image-generation'));
      const key = `thumbnails/${input.userId}/${input.runId}/${i}.png`;
      await ctx.storage.put(key, result.imageData, { httpMetadata: { contentType: 'image/png' }, customMetadata: { topic: p.topic, style: p.style } });
      ctx.trackUsage(this.storageUsage(result.imageData.byteLength));
      artifacts.push({ key, bucket: 'AGENT_STORAGE', contentType: 'image/png', sizeBytes: result.imageData.byteLength });
      thumbs.push({ r2Key: key, style: p.style, prompt, revisedPrompt: result.revisedPrompt, sizeBytes: result.imageData.byteLength });
    }

    yield this.progress(input.runId, 'complete', 'Thumbnails ready', 100);
    return { success: true, data: { topic: p.topic, thumbnails: thumbs, textOverlayPlan: textPlan }, summary: `Generated ${thumbs.length} ${p.style} thumbnail(s).`, artifacts, usage: [] };
  }
}
