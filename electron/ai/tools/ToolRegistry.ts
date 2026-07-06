import type { StructuredTool } from '@langchain/core/tools'

/**
 * ToolRegistry (04.1 §2 / plan A1) — a name→instance index over the domain's built tool
 * instances. It is the resolution point for the `tools:` whitelist in subagent `agent.md`
 * frontmatter: the assembler maps declared tool names to instances here, failing fast on
 * any unknown name so a typo in a definition file surfaces at assembly time rather than at
 * runtime. The main agent also draws its tool面 from the same registry.
 *
 * Note: deepagents filesystem tools (read_file / write_file / ls / grep / glob) are provided
 * by the filesystem backend/middleware, not by this registry — subagent `tools:` lists must
 * NOT include them (they are always available).
 */
export class ToolRegistry {
  private readonly byName = new Map<string, StructuredTool>()

  constructor(tools: readonly StructuredTool[] = []) {
    this.registerAll(tools)
  }

  registerAll(tools: readonly StructuredTool[]): void {
    for (const t of tools) this.register(t)
  }

  register(tool: StructuredTool): void {
    // last-wins: a domain-specific tool may intentionally override a common one by name.
    this.byName.set(tool.name, tool)
  }

  has(name: string): boolean {
    return this.byName.has(name)
  }

  get(name: string): StructuredTool | undefined {
    return this.byName.get(name)
  }

  /** All registered tool names (for diagnostics / error messages). */
  names(): string[] {
    return [...this.byName.keys()].sort()
  }

  /** Resolve every tool instance registered. */
  all(): StructuredTool[] {
    return [...this.byName.values()]
  }

  /**
   * Resolve a whitelist of tool names to instances. Throws on any unknown name
   * (fail-fast for `agent.md` frontmatter typos).
   */
  select(names: readonly string[], context?: string): StructuredTool[] {
    const resolved: StructuredTool[] = []
    const missing: string[] = []
    for (const name of names) {
      const tool = this.byName.get(name)
      if (tool) resolved.push(tool)
      else missing.push(name)
    }
    if (missing.length) {
      throw new Error(
        `[ToolRegistry] Unknown tool name(s)${context ? ` in ${context}` : ''}: ${missing.join(', ')}. ` +
        `Registered tools: ${this.names().join(', ')}`,
      )
    }
    return resolved
  }
}
