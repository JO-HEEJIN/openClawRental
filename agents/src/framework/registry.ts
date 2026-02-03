import type { Agent } from './agent';
import type { AgentCategory } from './types';

class AgentRegistry {
  private agents = new Map<string, () => Agent>();

  register(id: string, factory: () => Agent): void {
    if (this.agents.has(id)) throw new Error(`Agent "${id}" is already registered`);
    this.agents.set(id, factory);
  }

  get(id: string): Agent {
    const factory = this.agents.get(id);
    if (!factory) throw new Error(`Agent "${id}" not found in registry`);
    return factory();
  }

  has(id: string): boolean { return this.agents.has(id); }
  list(): string[] { return Array.from(this.agents.keys()); }

  listByCategory(category: AgentCategory): string[] {
    return this.list().filter(id => this.get(id).meta.category === category);
  }

  listMeta() { return this.list().map(id => this.get(id).meta); }
}

export const agentRegistry = new AgentRegistry();
