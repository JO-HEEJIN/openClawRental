import { BaseAgent } from '../../framework/agent';
import type { AgentMeta, AgentInput, AgentOutput, ValidationResult, ExecutionContext, ProgressEvent } from '../../framework/types';
import { ok, fail, requireStrings, requireOneOf } from '../../utils/validation';

const DURATION_SECONDS: Record<string, number> = { '15s': 15, '30s': 30, '60s': 60 };
const TONE_INST: Record<string, string> = { casual: 'Friendly conversational tone.', professional: 'Polished authoritative tone.', humorous: 'Witty playful comedic tone.', dramatic: 'Dramatic tense emotional tone.', educational: 'Clear factual teaching tone.' };
const LANG: Record<string, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

export class ScriptGeneratorAgent extends BaseAgent {
  readonly meta: AgentMeta = { id: 'script-generator', name: 'Script Generator Agent', description: 'Creates Shorts/Reels scripts with timestamps, hooks, and visual directions', category: 'script-generator', version: '1.0.0', estimatedCredits: { min: 15, max: 25 } };

  validate(input: AgentInput): ValidationResult {
    const errors = requireStrings(input.params as Record<string, unknown>, ['topic']);
    for (const [f, v] of [['duration', ['15s', '30s', '60s']], ['tone', ['casual', 'professional', 'humorous', 'dramatic', 'educational']], ['language', ['ko', 'en', 'ja']]] as const) { const e = requireOneOf(input.params as Record<string, unknown>, f, v as unknown as string[]); if (e) errors.push(e); }
    return errors.length > 0 ? fail(errors) : ok();
  }

  async *execute(input: AgentInput, ctx: ExecutionContext): AsyncGenerator<ProgressEvent, AgentOutput, undefined> {
    const p = input.params as { topic: string; duration: string; tone: string; language: string; targetAudience?: string; keyPoints?: string[]; includeHooks?: boolean; hookCount?: number; callToAction?: string };
    const totalSec = DURATION_SECONDS[p.duration]; const lang = LANG[p.language] ?? 'Korean';

    let hooks: { type: string; text: string; explanation: string }[] = [];
    if (p.includeHooks !== false) {
      yield this.progress(input.runId, 'hooks', 'Generating hooks...', 10); this.checkAborted(ctx.signal);
      const r = await ctx.aiGateway.chat({ model: 'gpt-4o', messages: [{ role: 'system', content: `Expert Shorts script writer for viral ${lang} content.` }, { role: 'user', content: `Generate ${p.hookCount ?? 3} hooks for ${p.duration} video about "${p.topic}" (${p.tone}). Target: ${p.targetAudience ?? 'Korean users'}. JSON array: [{"type":"question|statistic|controversy|story|challenge","text":"...","explanation":"..."}]` }], temperature: 0.9, maxTokens: 1024 });
      ctx.trackUsage(this.llmUsage(r.model, r.inputTokens, r.outputTokens));
      try { hooks = JSON.parse(r.content.match(/\[[\s\S]*\]/)?.[0] ?? '[]'); } catch {}
    }

    yield this.progress(input.runId, 'script', 'Writing script...', 30); this.checkAborted(ctx.signal);
    const sr = await ctx.aiGateway.chat({ model: 'gpt-4o', messages: [{ role: 'system', content: `Shorts script writer for ${lang}. ${TONE_INST[p.tone] ?? ''} Exactly ${totalSec}s.` }, { role: 'user', content: `${p.duration} script. Topic: "${p.topic}". ${hooks[0] ? `Hook: "${hooks[0].text}".` : ''} ${p.keyPoints?.length ? `Points: ${p.keyPoints.join(', ')}.` : ''} JSON: [{"startTime":"0:00","endTime":"0:03","durationSeconds":3,"label":"Hook","content":"..."}]. Total=${totalSec}s. ${lang}.` }], temperature: 0.8, maxTokens: 2048 });
    ctx.trackUsage(this.llmUsage(sr.model, sr.inputTokens, sr.outputTokens));
    let sections: { startTime: string; endTime: string; durationSeconds: number; label: string; content: string; visualDirection?: string }[] = [];
    try { sections = JSON.parse(sr.content.match(/\[[\s\S]*\]/)?.[0] ?? '[]'); } catch {}
    if (!sections.length) sections = [{ startTime: '0:00', endTime: `0:${String(totalSec).padStart(2, '0')}`, durationSeconds: totalSec, label: 'Full', content: sr.content.slice(0, 500) }];

    yield this.progress(input.runId, 'visuals', 'Adding visual directions...', 70); this.checkAborted(ctx.signal);
    const vr = await ctx.aiGateway.chat({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'Video director for Shorts.' }, { role: 'user', content: `Visual directions for: ${sections.map((s, i) => `${i + 1}. [${s.startTime}-${s.endTime}] ${s.label}: ${s.content}`).join('\n')}. JSON string array.` }], temperature: 0.7, maxTokens: 1024, cacheable: true });
    ctx.trackUsage(this.llmUsage(vr.model, vr.inputTokens, vr.outputTokens));
    try { const v = JSON.parse(vr.content.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as string[]; for (let i = 0; i < Math.min(sections.length, v.length); i++) sections[i].visualDirection = v[i]; } catch {}

    yield this.progress(input.runId, 'complete', 'Script ready', 100);
    return { success: true, data: { topic: p.topic, duration: p.duration, script: sections, totalDurationSeconds: totalSec, hooks, metadata: { tone: p.tone, language: p.language } }, summary: `Generated ${p.duration} ${p.tone} script for "${p.topic}" with ${sections.length} sections.`, artifacts: [], usage: [] };
  }
}
