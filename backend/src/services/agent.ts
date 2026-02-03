import type { Env } from "../types";
import { AgentConfigModel } from "../models/agent-config";
import { AgentRunModel } from "../models/agent-run";
import { UsageLogModel } from "../models/usage-log";
import { reserveCredits, settleCredits } from "./credit";
import { AppError } from "../middleware/error-handler";

// Agent templates define the available agent types users can configure
export interface AgentTemplate {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  category: string;
  estimatedCreditsPerRun: number;
  configSchema: Record<string, unknown>;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "shorts-script-writer",
    name: "Shorts Script Writer",
    nameKo: "숏폼 스크립트 작성기",
    description: "AI agent that writes engaging short-form video scripts optimized for Korean audience",
    descriptionKo: "한국 시청자에 최적화된 숏폼 영상 스크립트를 작성하는 AI 에이전트",
    category: "content",
    estimatedCreditsPerRun: 15,
    configSchema: {
      type: "object",
      properties: {
        tone: { type: "string", enum: ["casual", "professional", "humorous", "emotional"] },
        targetLength: { type: "number", description: "Target video length in seconds" },
        language: { type: "string", default: "ko" },
      },
    },
  },
  {
    id: "thumbnail-generator",
    name: "Thumbnail Generator",
    nameKo: "썸네일 생성기",
    description: "Generate eye-catching thumbnails for YouTube Shorts and Instagram Reels",
    descriptionKo: "유튜브 숏츠 및 인스타그램 릴스용 썸네일 생성 에이전트",
    category: "visual",
    estimatedCreditsPerRun: 25,
    configSchema: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["vibrant", "minimal", "text-heavy", "photo-based"] },
        dimensions: { type: "string", default: "1080x1920" },
      },
    },
  },
  {
    id: "hashtag-optimizer",
    name: "Hashtag Optimizer",
    nameKo: "해시태그 최적화기",
    description: "Analyze trends and suggest optimal hashtags for maximum reach",
    descriptionKo: "트렌드 분석 후 최적의 해시태그를 추천하는 에이전트",
    category: "seo",
    estimatedCreditsPerRun: 10,
    configSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["youtube", "instagram", "tiktok", "all"] },
        niche: { type: "string" },
      },
    },
  },
  {
    id: "content-repurposer",
    name: "Content Repurposer",
    nameKo: "콘텐츠 리퍼포서",
    description: "Transform long-form content into multiple short-form pieces",
    descriptionKo: "긴 콘텐츠를 여러 숏폼 콘텐츠로 변환하는 에이전트",
    category: "content",
    estimatedCreditsPerRun: 30,
    configSchema: {
      type: "object",
      properties: {
        sourceType: { type: "string", enum: ["blog", "video_transcript", "podcast", "article"] },
        outputCount: { type: "number", default: 3 },
      },
    },
  },
  {
    id: "caption-translator",
    name: "Caption Translator",
    nameKo: "자막 번역기",
    description: "Translate and localize captions for multi-language distribution",
    descriptionKo: "다국어 배포를 위한 자막 번역 및 현지화 에이전트",
    category: "localization",
    estimatedCreditsPerRun: 20,
    configSchema: {
      type: "object",
      properties: {
        sourceLanguage: { type: "string", default: "ko" },
        targetLanguages: { type: "array", items: { type: "string" }, default: ["en", "ja"] },
      },
    },
  },
];

/**
 * Start an agent run: reserve credits, create the run record, and
 * enqueue the actual execution (execution logic is a stub for now).
 */
export async function startAgentRun(
  env: Env,
  userId: string,
  agentConfigId: string,
  inputJson: string
): Promise<{ runId: string; creditsReserved: number }> {
  // Look up agent config
  const config = await AgentConfigModel.findById(env.DB, agentConfigId);
  if (!config) {
    throw new AppError(404, "CONFIG_NOT_FOUND", "Agent configuration not found");
  }
  if (config.user_id !== userId) {
    throw new AppError(403, "FORBIDDEN", "Agent configuration does not belong to this user");
  }
  if (config.status !== "active") {
    throw new AppError(400, "CONFIG_INACTIVE", "Agent configuration is not active");
  }

  const creditsToReserve = config.estimated_credits_per_run;

  // Create the run record first (status=pending)
  const run = await AgentRunModel.create(env.DB, {
    agentConfigId,
    userId,
    creditsReserved: creditsToReserve,
    inputJson,
  });

  // Reserve credits (throws if insufficient)
  try {
    await reserveCredits(env.DB, userId, creditsToReserve, run.id);
  } catch (err) {
    // If reservation fails, mark run as failed
    await AgentRunModel.updateStatus(env.DB, run.id, {
      status: "failed",
      errorMessage: err instanceof AppError ? err.message : "Credit reservation failed",
    });
    throw err;
  }

  // Mark run as running
  await AgentRunModel.updateStatus(env.DB, run.id, {
    status: "running",
    startedAt: new Date().toISOString(),
  });

  // TODO: Enqueue actual agent execution via Cloudflare Queue or DO
  // For now, the run is marked as running and will be completed
  // when the agent execution service calls back.

  return { runId: run.id, creditsReserved: creditsToReserve };
}

/**
 * Cancel an agent run. Returns reserved credits minus any already consumed.
 */
export async function cancelAgentRun(
  env: Env,
  userId: string,
  runId: string
): Promise<void> {
  const run = await AgentRunModel.findById(env.DB, runId);
  if (!run) {
    throw new AppError(404, "RUN_NOT_FOUND", "Agent run not found");
  }
  if (run.user_id !== userId) {
    throw new AppError(403, "FORBIDDEN", "Agent run does not belong to this user");
  }
  if (run.status !== "pending" && run.status !== "running") {
    throw new AppError(400, "INVALID_STATUS", `Cannot cancel run with status ${run.status}`);
  }

  // Get actual credits consumed so far
  const usageLogs = await UsageLogModel.listByRunId(env.DB, runId);
  const actualCreditsUsed = usageLogs.reduce((sum, log) => sum + log.credit_cost, 0);

  // Settle: charge for what was used, return the rest
  await settleCredits(env.DB, userId, run.credits_reserved, actualCreditsUsed, runId);

  // Mark run as cancelled
  await AgentRunModel.updateStatus(env.DB, runId, {
    status: "cancelled",
    creditsActual: actualCreditsUsed,
    completedAt: new Date().toISOString(),
    durationMs: run.started_at
      ? Date.now() - new Date(run.started_at).getTime()
      : 0,
  });
}
