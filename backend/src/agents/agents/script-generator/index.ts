/**
 * Script Generation Agent.
 *
 * Generates Shorts/Reels scripts with timestamps for 15s/30s/60s durations.
 * Includes hook generation for attention-grabbing openings.
 *
 * Credit cost: 15-25 credits/run
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

type Duration = '15s' | '30s' | '60s';
type Tone = 'casual' | 'professional' | 'humorous' | 'dramatic' | 'educational';
type Language = 'ko' | 'en' | 'ja';

interface ScriptParams {
  topic: string;
  duration: Duration;
  tone: Tone;
  language: Language;
  targetAudience?: string;
  keyPoints?: string[];
  includeHooks?: boolean;
  hookCount?: number;
  callToAction?: string;
}

interface ScriptOutput {
  topic: string;
  duration: Duration;
  script: ScriptSection[];
  totalDurationSeconds: number;
  hooks: HookOption[];
  callToAction: string;
  metadata: {
    wordCount: number;
    estimatedReadingSpeed: string;
    tone: Tone;
    language: Language;
  };
}

interface ScriptSection {
  startTime: string;
  endTime: string;
  durationSeconds: number;
  label: string;
  content: string;
  visualDirection?: string;
  audioNote?: string;
}

interface HookOption {
  type: 'question' | 'statistic' | 'controversy' | 'story' | 'challenge';
  text: string;
  explanation: string;
}

const DURATION_SECONDS: Record<Duration, number> = {
  '15s': 15,
  '30s': 30,
  '60s': 60,
};

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  casual: 'Use a friendly, conversational tone like talking to a friend.',
  professional: 'Use a polished, authoritative tone with clear delivery.',
  humorous: 'Include witty remarks, playful language, and comedic timing.',
  dramatic: 'Build tension with dramatic pauses, emphasis, and emotional hooks.',
  educational: 'Explain clearly with facts, use simple analogies, and teach something new.',
};

const LANGUAGE_CONFIG: Record<Language, { name: string; readingSpeed: string }> = {
  ko: { name: 'Korean', readingSpeed: '~3.5 syllables/sec' },
  en: { name: 'English', readingSpeed: '~2.5 words/sec' },
  ja: { name: 'Japanese', readingSpeed: '~4 mora/sec' },
};

export class ScriptGeneratorAgent extends BaseAgent {
  readonly meta: AgentMeta = {
    id: 'script-generator',
    name: 'Script Generator Agent',
    description: 'Creates Shorts/Reels scripts with timestamps, hooks, and visual directions',
    category: 'script-generator',
    version: '1.0.0',
    estimatedCredits: { min: 15, max: 25 },
  };

  validate(input: AgentInput): ValidationResult {
    const errors = requireStrings(input.params as Record<string, unknown>, ['topic']);

    const durationErr = requireOneOf(
      input.params as Record<string, unknown>,
      'duration',
      ['15s', '30s', '60s'],
    );
    if (durationErr) errors.push(durationErr);

    const toneErr = requireOneOf(
      input.params as Record<string, unknown>,
      'tone',
      ['casual', 'professional', 'humorous', 'dramatic', 'educational'],
    );
    if (toneErr) errors.push(toneErr);

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
    const params = input.params as unknown as ScriptParams;
    const totalSeconds = DURATION_SECONDS[params.duration];
    const langConfig = LANGUAGE_CONFIG[params.language];
    const includeHooks = params.includeHooks ?? true;
    const hookCount = params.hookCount ?? 3;

    // ---- Step 1: Generate hooks ----
    let hooks: HookOption[] = [];

    if (includeHooks) {
      yield this.progress(input.runId, 'hooks', 'Generating attention hooks...', 10);
      this.checkAborted(ctx.signal);

      const hookPrompt = this.buildHookPrompt(params);
      const hookResponse = await ctx.aiGateway.chat({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert Shorts/Reels script writer specializing in viral ${langConfig.name} content. You create hooks that stop viewers from scrolling.`,
          },
          { role: 'user', content: hookPrompt },
        ],
        temperature: 0.9,
        maxTokens: 1024,
        cacheable: false,
      });

      ctx.trackUsage(this.llmUsage(hookResponse.model, hookResponse.inputTokens, hookResponse.outputTokens));
      hooks = this.parseHooks(hookResponse.content, hookCount);
    }

    yield this.progress(input.runId, 'hooks-done', `Generated ${hooks.length} hooks`, 25);

    // ---- Step 2: Generate main script ----
    yield this.progress(input.runId, 'script', 'Writing script with timestamps...', 30);
    this.checkAborted(ctx.signal);

    const scriptPrompt = this.buildScriptPrompt(params, hooks[0]?.text);
    const scriptResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: [
            `You are an expert Shorts/Reels script writer for ${langConfig.name} content.`,
            TONE_INSTRUCTIONS[params.tone],
            `The script MUST fit within exactly ${totalSeconds} seconds.`,
            `Average ${langConfig.name} reading speed: ${langConfig.readingSpeed}.`,
            'Output the script in a structured JSON format.',
          ].join(' '),
        },
        { role: 'user', content: scriptPrompt },
      ],
      temperature: 0.8,
      maxTokens: 2048,
    });

    ctx.trackUsage(this.llmUsage(scriptResponse.model, scriptResponse.inputTokens, scriptResponse.outputTokens));

    yield this.progress(input.runId, 'script-parse', 'Parsing script structure...', 60);

    const sections = this.parseScript(scriptResponse.content, totalSeconds);

    // ---- Step 3: Add visual directions ----
    yield this.progress(input.runId, 'visuals', 'Adding visual directions...', 70);
    this.checkAborted(ctx.signal);

    const visualPrompt = [
      `For the following ${params.duration} Shorts/Reels script, add brief visual directions for each section.`,
      `Topic: ${params.topic}`,
      '',
      'Script sections:',
      ...sections.map((s, i) => `${i + 1}. [${s.startTime}-${s.endTime}] ${s.label}: ${s.content}`),
      '',
      'For each section, provide a brief visual direction (camera angle, text overlay, transition, b-roll suggestion).',
      `Respond in ${langConfig.name}. Output as JSON array of strings, one per section.`,
    ].join('\n');

    const visualResponse = await ctx.aiGateway.chat({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a video production director for social media Shorts.' },
        { role: 'user', content: visualPrompt },
      ],
      temperature: 0.7,
      maxTokens: 1024,
      cacheable: true,
    });

    ctx.trackUsage(this.llmUsage(visualResponse.model, visualResponse.inputTokens, visualResponse.outputTokens));

    // Apply visual directions to sections
    try {
      const visuals = JSON.parse(visualResponse.content) as string[];
      for (let i = 0; i < Math.min(sections.length, visuals.length); i++) {
        sections[i].visualDirection = visuals[i];
      }
    } catch {
      // If parsing fails, leave visual directions empty
    }

    yield this.progress(input.runId, 'finalize', 'Finalizing script...', 90);

    const scriptOutput: ScriptOutput = {
      topic: params.topic,
      duration: params.duration,
      script: sections,
      totalDurationSeconds: totalSeconds,
      hooks,
      callToAction: params.callToAction ?? '',
      metadata: {
        wordCount: sections.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0),
        estimatedReadingSpeed: langConfig.readingSpeed,
        tone: params.tone,
        language: params.language,
      },
    };

    yield this.progress(input.runId, 'complete', 'Script ready', 100);

    return {
      success: true,
      data: scriptOutput as unknown as Record<string, unknown>,
      summary: `Generated ${params.duration} ${params.tone} script for "${params.topic}" with ${sections.length} sections and ${hooks.length} hooks.`,
      artifacts: [],
      usage: [],
    };
  }

  private buildHookPrompt(params: ScriptParams): string {
    const hookCount = params.hookCount ?? 3;
    return [
      `Generate ${hookCount} attention-grabbing hooks for a ${params.duration} Shorts/Reels video.`,
      `Topic: ${params.topic}`,
      `Tone: ${params.tone}`,
      `Target audience: ${params.targetAudience ?? 'general Korean social media users'}`,
      '',
      'Each hook should:',
      '- Be under 3 seconds when spoken',
      '- Immediately grab attention in the first frame',
      '- Make viewers want to keep watching',
      '',
      'Hook types to consider: question, shocking statistic, controversy/hot take, mini story, challenge',
      '',
      `Output in ${LANGUAGE_CONFIG[params.language].name} as JSON array:`,
      '[{"type": "question|statistic|controversy|story|challenge", "text": "...", "explanation": "why this works"}]',
    ].join('\n');
  }

  private buildScriptPrompt(params: ScriptParams, bestHook?: string): string {
    const totalSeconds = DURATION_SECONDS[params.duration];
    return [
      `Write a complete ${params.duration} Shorts/Reels script.`,
      `Topic: ${params.topic}`,
      `Tone: ${params.tone}`,
      `Duration: exactly ${totalSeconds} seconds`,
      params.targetAudience ? `Target audience: ${params.targetAudience}` : '',
      params.keyPoints?.length ? `Key points to cover: ${params.keyPoints.join(', ')}` : '',
      bestHook ? `Opening hook to use: "${bestHook}"` : '',
      params.callToAction ? `Call to action: ${params.callToAction}` : '',
      '',
      'Structure the script as a JSON array of sections:',
      '[{"startTime": "0:00", "endTime": "0:03", "durationSeconds": 3, "label": "Hook", "content": "..."}]',
      '',
      'Required sections:',
      '1. Hook (first 2-3 seconds) - grab attention immediately',
      '2. Setup (context/problem)',
      '3. Main content (1-3 sections depending on duration)',
      '4. Conclusion/CTA (last 2-3 seconds)',
      '',
      `Total must equal exactly ${totalSeconds} seconds.`,
      `Write in ${LANGUAGE_CONFIG[params.language].name}.`,
    ].join('\n');
  }

  private parseHooks(content: string, maxCount: number): HookOption[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as HookOption[];
        return parsed.slice(0, maxCount);
      }
    } catch {
      // Fallback: return empty
    }
    return [];
  }

  private parseScript(content: string, totalSeconds: number): ScriptSection[] {
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ScriptSection[];
        return parsed;
      }
    } catch {
      // Fallback: create a simple structure
    }

    // Fallback structure
    return [
      {
        startTime: '0:00',
        endTime: '0:03',
        durationSeconds: 3,
        label: 'Hook',
        content: content.slice(0, 100),
      },
      {
        startTime: '0:03',
        endTime: `0:${String(totalSeconds - 3).padStart(2, '0')}`,
        durationSeconds: totalSeconds - 6,
        label: 'Main',
        content: content.slice(100, 500),
      },
      {
        startTime: `0:${String(totalSeconds - 3).padStart(2, '0')}`,
        endTime: `0:${String(totalSeconds).padStart(2, '0')}`,
        durationSeconds: 3,
        label: 'CTA',
        content: content.slice(500, 600) || 'Follow for more!',
      },
    ];
  }
}
