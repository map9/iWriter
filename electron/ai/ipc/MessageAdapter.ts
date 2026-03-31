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
import { BLOCK_EDIT_TOOLS, inferToolKind } from '../../../src/types/ai'
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
  output = normalizeToolOutput(output)

  if (toolName === 'write_todos') {
    type Todo = { content?: unknown; status?: unknown }

    const formatTodos = (items: Todo[]): string =>
      `<ul class="mcv-todo-list">${items.map(t => {
        const status = String(t.status ?? '')
        const icon = status === 'completed' ? '✓' : status === 'in_progress' ? '▶' : ''
        const boxClass = status === 'completed'
          ? 'mcv-todo-box mcv-todo-box--done'
          : status === 'in_progress'
            ? 'mcv-todo-box mcv-todo-box--progress'
            : 'mcv-todo-box mcv-todo-box--pending'
        return `<li class="mcv-todo-item"><span class="${boxClass}">${icon}</span><span class="mcv-todo-label">${escapeHtml(String(t.content ?? ''))}</span></li>`
      }).join('')}</ul>`

    // Format 1: {update: {todos: [...]}}
    const todos: Todo[] | undefined =
      output != null && typeof output === 'object' && 'update' in output
        ? ((output as { update?: { todos?: Todo[] } }).update?.todos)
        : undefined
    if (Array.isArray(todos) && todos.length > 0) {
      return formatTodos(todos)
    }

    // Format 0: top-level string, e.g. "Updated todo list to [...]"
    if (typeof output === 'string') {
      const match = output.match(/\[[\s\S]*\]/)
      if (match) {
        try {
          const parsed: Todo[] = JSON.parse(match[0])
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].content !== undefined) {
            return formatTodos(parsed)
          }
        } catch { /* fall through */ }
      }
      return output.slice(0, 500)
    }

    // Format 2: {update: {messages: [{content: "Updated todo list to [...]"}]}}
    const msg = (output as { update?: { messages?: Array<{ content?: unknown }> } })?.update?.messages?.[0]
    if (msg?.content != null) {
      const msgStr = String(msg.content)
      const match = msgStr.match(/\[[\s\S]*\]/)
      if (match) {
        try {
          const parsed: Todo[] = JSON.parse(match[0])
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].content !== undefined) {
            return formatTodos(parsed)
          }
        } catch { /* fall through */ }
      }
      return msgStr.slice(0, 500)
    }
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

function parseMaybeJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function normalizeToolOutput(raw: unknown): unknown {
  if (raw == null) return raw
  if (typeof raw === 'string') return parseMaybeJson(raw)
  if (Array.isArray(raw)) return parseMaybeJson(lcMsgText(raw))
  return raw
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
      // Strip system-injected XML blocks added at send time (editor_state, context_files, filesystem_roots)
      const content = raw
        .replace(/<editor_state[\s\S]*?<\/editor_state>\s*/g, '')
        .replace(/<context_files>[\s\S]*?<\/context_files>\s*/g, '')
        .replace(/<filesystem_roots>[\s\S]*?<\/filesystem_roots>\s*/g, '')
        .trim()
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
        // In LangGraph HITL, an AI message can contain proposed tool calls that
        // have not executed yet because the run interrupted for review.
        status: 'pending' as const,
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
        const tc = toolCalls.find(t => t.id === tcId)
        const resultText = extractToolResult(tc?.name ?? '', toolMsg.content)
        if (tc) {
          tc.status = 'completed'
          tc.result = tc.name === 'write_todos'
            ? resultText
            : resultText.slice(0, 500)
        }
        toolResults.push({ toolCallId: tcId, content: resultText })
        j++
      }

      const hasLaterConversation = rawMessages.slice(j).some(nextMsg => {
        const nextType = lcMsgType(nextMsg)
        return nextType !== 'tool' && nextType !== 'system' && nextType !== 'remove'
      })
      if (hasLaterConversation) {
        for (const toolCall of toolCalls) {
          if (toolCall.status === 'pending' && BLOCK_EDIT_TOOLS.has(toolCall.name)) {
            toolCall.status = 'rejected'
          }
        }
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
  toolCallId?: string,
  sourceMessageId?: string,
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
      sourceMessageId,
      filename,
      content: String(args.content ?? ''),
      toolCallId,
      description: description ?? `Create document: ${filename || args.filename}`,
    } satisfies FileCreateProposal
  }

  // Block operations
  const blockProposal: Partial<BlockEditProposal> = {
    id,
    kind: 'block',
    status: 'pending',
    sourceMessageId,
    filePath,
    toolCallId,
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
    const rangeStart = Math.min(startId, endId)
    const rangeEnd = Math.max(startId, endId)
    const oldContent = snapshot?.blockMap
      .filter(b => b.displayId >= rangeStart && b.displayId <= rangeEnd)
      .map(b => b.content)
      .join('\n\n')
    return {
      ...blockProposal,
      type: 'replace_range',
      startDisplayBlockId: startId,
      endDisplayBlockId: endId,
      startNodeId: startEntry?.nodeId,
      endNodeId: endEntry?.nodeId,
      oldContent,
      newContent: String(args.new_content ?? ''),
      description: description ?? `Replace {b:${startId}}–{b:${endId}}`,
    } as BlockEditProposal
  }

  // Fallback
  return { ...blockProposal, type: 'edit', description: toolName } as BlockEditProposal
}
