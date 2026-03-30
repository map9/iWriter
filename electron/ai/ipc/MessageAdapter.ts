/**
 * MessageAdapter — single adapter layer between LangChain/LangGraph raw formats
 * and the renderer-facing ThreadMessage types.
 *
 * Centralises all conversion logic that was previously scattered through AgentEngine.ts.
 */

import type {
  AiToolCall,
  AiToolResult,
  ThreadMessage,
  BlockEditProposal,
  FileCreateProposal,
  EditProposal,
  MessageContentBlock,
} from '../../../src/types/ai'
import { inferToolKind } from '../../../src/types/ai'
import type { SerializedSnapshot } from './protocol'

// ── Tool argument parsing ────────────────────────────────────────────────────

export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw == null) return {}
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
  if (typeof raw === 'object' && 'input' in (raw as object)) {
    return parseToolArguments((raw as { input: unknown }).input)
  }
  return raw as Record<string, unknown>
}

// ── Tool result extraction ───────────────────────────────────────────────────

export function extractToolResult(toolName: string, output: unknown): string {
  if (toolName === 'write_todos') {
    type Todo = { content?: unknown; status?: unknown }
    const todos: Todo[] | undefined =
      output != null && typeof output === 'object' && 'update' in output
        ? ((output as { update?: { todos?: Todo[] } }).update?.todos)
        : undefined
    if (Array.isArray(todos) && todos.length > 0) {
      return todos
        .map(t => {
          const status = String(t.status ?? '')
          const mark = status === 'completed' ? 'x' : status === 'in_progress' ? '→' : ' '
          return `- [${mark}] ${String(t.content ?? '')}`
        })
        .join('\n')
    }
    const msg = (output as { update?: { messages?: Array<{ content?: unknown }> } })?.update?.messages?.[0]
    if (msg?.content != null) return String(msg.content).slice(0, 500)
    return JSON.stringify(output).slice(0, 500)
  }
  if (output == null) return ''
  if (typeof output === 'string') return output.slice(0, 500)
  if (typeof output === 'object') {
    if ('content' in output && typeof (output as { content: unknown }).content === 'string') {
      return ((output as { content: string }).content).slice(0, 500)
    }
    const msg = (output as { update?: { messages?: Array<{ content?: unknown }> } })?.update?.messages?.[0]
    if (msg?.content != null) return String(msg.content).slice(0, 500)
    return JSON.stringify(output).slice(0, 500)
  }
  return String(output).slice(0, 500)
}

// ── LangChain message → ThreadMessage conversion ────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lcMsgType(msg: any): string {
  return msg._getType?.() ?? msg.getType?.() ?? msg.type ?? ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lcMsgText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return content.filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('')
  }
  return String(content ?? '')
}

/**
 * Convert raw LangChain messages from the checkpointer into renderer-friendly ThreadMessage[].
 * This is the single place responsible for the LangChain → ThreadMessage transformation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertLcMessages(rawMessages: any[]): ThreadMessage[] {
  const result: ThreadMessage[] = []
  let i = 0

  while (i < rawMessages.length) {
    const msg = rawMessages[i]
    const type = lcMsgType(msg)

    if (type === 'system' || type === 'remove') { i++; continue }

    if (type === 'human') {
      const raw = lcMsgText(msg.content)
      // Strip <editor_state>...</editor_state> XML prefix injected at send time
      const content = raw.replace(/<editor_state[\s\S]*?<\/editor_state>\s*/g, '').trim()
      result.push({
        id: `msg-h-${i}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      })
      i++
      continue
    }

    if (type === 'ai') {
      const content = lcMsgText(msg.content)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lcToolCalls: any[] = msg.tool_calls ?? []
      const toolCalls: AiToolCall[] = lcToolCalls.map((tc, idx) => ({
        id: tc.id ?? `tool-${i}-${idx}`,
        name: tc.name,
        kind: inferToolKind(tc.name),
        title: tc.name,
        status: 'completed' as const,
        arguments: tc.args ?? {},
      }))

      // Consume following tool messages and attach results
      const toolResults: AiToolResult[] = []
      const contentBlocks: MessageContentBlock[] = []
      if (content) {
        contentBlocks.push({ type: 'text', text: content })
      }
      for (const toolCall of toolCalls) {
        contentBlocks.push({ type: 'tool_call', toolCallId: toolCall.id })
      }
      let j = i + 1
      while (j < rawMessages.length && lcMsgType(rawMessages[j]) === 'tool') {
        const toolMsg = rawMessages[j]
        const tcId: string = toolMsg.tool_call_id ?? ''
        const resultText = lcMsgText(toolMsg.content)
        const tc = toolCalls.find(t => t.id === tcId)
        if (tc) tc.result = resultText.slice(0, 500)
        toolResults.push({ toolCallId: tcId, content: resultText })
        j++
      }

      result.push({
        id: `msg-a-${i}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
        toolCalls: toolCalls.length ? toolCalls : undefined,
        toolResults: toolResults.length ? toolResults : undefined,
        contentBlocks: contentBlocks.length ? contentBlocks : undefined,
      })
      i = j
      continue
    }

    i++
  }

  return result
}

// ── EditProposal construction ────────────────────────────────────────────────

/**
 * Build an EditProposal from a LangGraph actionRequest.
 * Uses the document snapshot to resolve block metadata (nodeId, content for diff display).
 */
export function buildProposalFromAction(
  toolName: string,
  args: Record<string, unknown>,
  snapshot: SerializedSnapshot | null,
): EditProposal {
  const id = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = typeof args.file_path === 'string' ? args.file_path : undefined

  const description = typeof args.reason === 'string' ? args.reason : undefined

  if (toolName === 'create_document') {
    const rawFilename = String(args.filename ?? '')
    const filename = rawFilename && !/\.[^./\\]+$/.test(rawFilename)
      ? `${rawFilename}.md`
      : rawFilename
    return {
      id,
      kind: 'create_file',
      status: 'pending',
      filename,
      content: String(args.content ?? ''),
      description: description ?? `Create document: ${filename || args.filename}`,
    } satisfies FileCreateProposal
  }

  // Block operations
  const blockProposal: Partial<BlockEditProposal> = {
    id,
    kind: 'block',
    status: 'pending',
    filePath,
  }

  if (toolName === 'edit_block') {
    const blockId = Number(args.block_id)
    const entry = snapshot?.blockMap.find(b => b.displayId === blockId)
    return {
      ...blockProposal,
      type: 'edit',
      displayBlockId: blockId,
      nodeId: entry?.nodeId,
      nodeType: entry?.nodeType,
      oldContent: entry?.content,
      newContent: String(args.new_content ?? ''),
      description: description ?? `Edit block {b:${blockId}}`,
    } as BlockEditProposal
  }

  if (toolName === 'insert_block') {
    const afterId = Number(args.after_block_id)
    const entry = afterId > 0 ? snapshot?.blockMap.find(b => b.displayId === afterId) : undefined
    return {
      ...blockProposal,
      type: 'insert',
      displayBlockId: afterId,
      afterNodeId: entry?.nodeId ?? (afterId === 0 ? '0' : undefined),
      newContent: String(args.new_blocks ?? ''),
      description: description ?? `Insert block after {b:${afterId}}`,
    } as BlockEditProposal
  }

  if (toolName === 'delete_block') {
    const blockId = Number(args.block_id)
    const entry = snapshot?.blockMap.find(b => b.displayId === blockId)
    return {
      ...blockProposal,
      type: 'delete',
      displayBlockId: blockId,
      nodeId: entry?.nodeId,
      nodeType: entry?.nodeType,
      oldContent: entry?.content,
      description: description ?? `Delete block {b:${blockId}}`,
    } as BlockEditProposal
  }

  if (toolName === 'replace_range') {
    const startId = Number(args.start_block_id)
    const endId = Number(args.end_block_id)
    const startEntry = snapshot?.blockMap.find(b => b.displayId === startId)
    const endEntry = snapshot?.blockMap.find(b => b.displayId === endId)
    return {
      ...blockProposal,
      type: 'replace_range',
      startDisplayBlockId: startId,
      endDisplayBlockId: endId,
      startNodeId: startEntry?.nodeId,
      endNodeId: endEntry?.nodeId,
      newContent: String(args.new_content ?? ''),
      description: description ?? `Replace {b:${startId}}–{b:${endId}}`,
    } as BlockEditProposal
  }

  // Fallback
  return { ...blockProposal, type: 'edit', description: toolName } as BlockEditProposal
}
