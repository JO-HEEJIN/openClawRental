import { agentRegistry } from '../framework/registry';
import { TrendResearchAgent } from './trend-research';
import { ScriptGeneratorAgent } from './script-generator';
import { ThumbnailGeneratorAgent } from './thumbnail-generator';
import { SEOOptimizerAgent } from './seo-optimizer';
import { CrossPlatformPosterAgent } from './cross-platform-poster';
import { AnalyticsAgent } from './analytics';

export function registerAllAgents(): void {
  agentRegistry.register('trend-research', () => new TrendResearchAgent());
  agentRegistry.register('script-generator', () => new ScriptGeneratorAgent());
  agentRegistry.register('thumbnail-generator', () => new ThumbnailGeneratorAgent());
  agentRegistry.register('seo-optimizer', () => new SEOOptimizerAgent());
  agentRegistry.register('cross-platform-poster', () => new CrossPlatformPosterAgent());
  agentRegistry.register('analytics', () => new AnalyticsAgent());
}

export { TrendResearchAgent } from './trend-research';
export { ScriptGeneratorAgent } from './script-generator';
export { ThumbnailGeneratorAgent } from './thumbnail-generator';
export { SEOOptimizerAgent } from './seo-optimizer';
export { CrossPlatformPosterAgent } from './cross-platform-poster';
export { AnalyticsAgent } from './analytics';
