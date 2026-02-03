/**
 * Billing-aware AI Gateway.
 *
 * Wraps the CloudflareAIGateway to route all LLM calls through the billing engine.
 * Each call deducts credits from the user's balance and logs usage.
 *
 * This is the "MVP mode" where agents run as regular async functions inside
 * the main Worker, not in sandboxed Workers for Platforms.
 */

import type { AIGatewayClient, LLMRequest, LLMResponse, AgentEnv } from "../framework/types";
import { CloudflareAIGateway } from "./ai-gateway";
import {
  calculateCreditCost,
  isSupportedModel,
} from "../../services/billing";

export class BillingAIGateway implements AIGatewayClient {
  private gateway: CloudflareAIGateway;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCreditCost = 0;

  constructor(env: AgentEnv) {
    this.gateway = new CloudflareAIGateway(env);
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.gateway.chat(request);

    // Track cumulative usage for billing summary
    this.totalInputTokens += response.inputTokens;
    this.totalOutputTokens += response.outputTokens;

    if (isSupportedModel(response.model)) {
      this.totalCreditCost += calculateCreditCost(
        response.model,
        response.inputTokens,
        response.outputTokens
      );
    }

    return response;
  }

  /** Get accumulated usage for the entire agent run */
  getAccumulatedUsage() {
    return {
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCreditCost: this.totalCreditCost,
    };
  }
}
