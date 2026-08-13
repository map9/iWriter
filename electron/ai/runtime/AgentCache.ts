interface AgentCacheEntry<TAgent, TResource> {
  threadId: string
  agent: TAgent
  resource: TResource
}

export interface AgentCacheBuildResult<TAgent, TResource> {
  agent: TAgent
  resource: TResource
}

export class AgentCache<TAgent, TResource> {
  private readonly entries = new Map<string, AgentCacheEntry<TAgent, TResource>>()

  constructor(private readonly cleanup: (resource: TResource) => void) {}

  get size(): number {
    return this.entries.size
  }

  getOrCreate(
    threadId: string,
    key: string,
    build: () => AgentCacheBuildResult<TAgent, TResource>,
  ): TAgent {
    const cached = this.entries.get(key)
    if (cached) return cached.agent

    const created = build()
    this.entries.set(key, { threadId, ...created })
    return created.agent
  }

  deleteThread(threadId: string): void {
    for (const [key, cached] of this.entries) {
      if (cached.threadId !== threadId) continue
      this.cleanup(cached.resource)
      this.entries.delete(key)
    }
  }

  clear(): void {
    for (const cached of this.entries.values()) {
      this.cleanup(cached.resource)
    }
    this.entries.clear()
  }
}
