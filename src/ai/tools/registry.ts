/**
 * Tool registry — maps tool names to executor functions.
 *
 * Extension point for MCP: external MCP tool servers would register their tools
 * here at runtime, letting the rest of the system treat them identically to
 * built-in tools (same execute() call, same permission check).
 */

import type { AiToolCall, AiToolResult } from '@/types/ai'
import type { FileTools } from './FileTools'

export type ToolExecutorFn = (args: Record<string, unknown>) => Promise<string>

export class ToolRegistry {
  private executors = new Map<string, ToolExecutorFn>()

  register(name: string, fn: ToolExecutorFn): void {
    this.executors.set(name, fn)
  }

  unregister(name: string): void {
    this.executors.delete(name)
  }

  has(name: string): boolean {
    return this.executors.has(name)
  }

  async execute(toolCall: AiToolCall): Promise<AiToolResult> {
    const fn = this.executors.get(toolCall.name)
    if (!fn) {
      return {
        toolCallId: toolCall.id,
        content: `Error: Unknown tool "${toolCall.name}".`,
        isError: true,
      }
    }

    try {
      const content = await fn(toolCall.arguments)
      return { toolCallId: toolCall.id, content }
    } catch (err) {
      return {
        toolCallId: toolCall.id,
        content: `Error executing "${toolCall.name}": ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  }
}

/**
 * Create and populate a ToolRegistry with the built-in file tools.
 * The edit_document tool is NOT registered here — it's handled specially by
 * AgentRunner to produce an EditProposal that the user must approve.
 */
export function createToolRegistry(fileTools: FileTools): ToolRegistry {
  const registry = new ToolRegistry()

  registry.register('read_file', args =>
    fileTools.readFile(String(args.path ?? ''))
  )

  registry.register('list_directory', args =>
    fileTools.listDirectory(String(args.path ?? '.'))
  )

  registry.register('write_file', args =>
    fileTools.writeFile(String(args.path ?? ''), String(args.content ?? ''))
  )

  registry.register('create_document', args =>
    fileTools.createDocument(
      String(args.file_name ?? ''),
      String(args.content ?? ''),
      typeof args.description === 'string' ? args.description : undefined
    )
  )

  // MCP tools would be registered here:
  // registry.register('mcp:github:create_issue', ...)

  return registry
}
