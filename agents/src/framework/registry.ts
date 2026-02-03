/**
 * Agent Registry.
 *
 * Central registry of all available agent implementations.
 * Used by the runtime to instantiate agents by category/id.
 */

import type { Agent } from './agent';
import type { AgentCategory } from './types';

class AgentRegistry {
  private agents = new Map<string, () => Agent>();

  /** Register an agent factory */
  register(id: string, factory: () => Agent): void {
    if (this.agents.has(id)) {
      throw new Error(`Agent "${id}" is already registered`);
    }
    this.agents.set(id, factory);
  }

  /** Get an agent instance by id */
  get(id: string): Agent {
    const factory = this.agents.get(id);
    if (!factory) {
      throw new Error(`Agent "${id}" not found in registry`);
    }
    return factory();
  }

  /** Check if an agent is registered */
  has(id: string): boolean {
    return this.agents.has(id);
  }

  /** List all registered agent ids */
  list(): string[] {
    return Array.from(this.agents.keys());
  }

  /** List agents filtered by category */
  listByCategory(category: AgentCategory): string[] {
    return this.list().filter((id) => {
      const agent = this.get(id);
      return agent.meta.category === category;
    });
  }

  /** Get metadata for all registered agents */
  listMeta() {
    return this.list().map((id) => {
      const agent = this.get(id);
      return agent.meta;
    });
  }
}

/** Singleton registry instance */
export const agentRegistry = new AgentRegistry();
