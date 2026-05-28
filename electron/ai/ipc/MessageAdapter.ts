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
import { BLOCK_EDIT_TOOLS, CREATIVE_REVIEW_TOOLS, inferToolKind } from '../../../src/types/ai'
import type { SerializedSnapshot } from './protocol'
import { isHitlInterruptPayload } from '../../../src/ai/hitl'

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
  const normalizedOutput = normalizeToolOutput(output)
  output = normalizedOutput

  if (toolName === 'write_todos') {
    type Todo = { content?: unknown; status?: unknown }

    const formatTodos = (items: Todo[]): string => JSON.stringify({
      todos: items.map(t => ({
        content: String(t.content ?? ''),
        status: String(t.status ?? ''),
      })),
    })

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
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.content !== undefined) {
            return formatTodos(parsed)
          }
        } catch { /* fall through */ }
      }
      return output
    }

    // Format 2: {update: {messages: [{content: "Updated todo list to [...]"}]}}
    const msg = (output as { update?: { messages?: Array<{ content?: unknown }> } })?.update?.messages?.[0]
    if (msg?.content != null) {
      const msgStr = String(msg.content)
      const match = msgStr.match(/\[[\s\S]*\]/)
      if (match) {
        try {
          const parsed: Todo[] = JSON.parse(match[0])
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.content !== undefined) {
            return formatTodos(parsed)
          }
        } catch { /* fall through */ }
      }
      return msgStr
    }
    return safeStringify(output)
  }
  if (output == null) return ''
  if (typeof output === 'string') return output
  if (typeof output === 'object') {
    if (shouldPreserveStructuredToolResult(toolName, output)) {
      return safeStringify(output)
    }
    if ('content' in output && typeof (output as { content: unknown }).content === 'string') {
      return (output as { content: string }).content
    }
    const msg = (output as { update?: { messages?: Array<{ content?: unknown }> } })?.update?.messages?.[0]
    if (msg?.content != null) return String(msg.content)
    return safeStringify(output)
  }
  return String(output)
}

function shouldPreserveStructuredToolResult(toolName: string, output: unknown): boolean {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return false

  const plainTextTools = new Set([
    'read_file',
    'execute',
  ])
  if (plainTextTools.has(toolName)) return false

  const entries = Object.entries(output as Record<string, unknown>)
  if (!entries.length) return false

  // Any structured object with multiple keys should be preserved as JSON so
  // replayed messages keep the same metadata the streaming UI had access to.
  if (entries.length > 1) return true

  // Even single-key objects should stay structured unless they are explicitly
  // text-first tools. This avoids losing shape for future tools that return
  // JSON payloads such as { content, ... } through LangChain ToolMessages.
  const [onlyKey] = entries[0]!
  return onlyKey !== 'content'
}

// ── LangChain message → ThreadMessage conversion ────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lcMsgType(msg: any): string {
  return msg._getType?.() ?? msg.getType?.() ?? msg.type ?? ''
}

function lcMsgText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    assertLangChainContentBlocksAreSane(content)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return content.filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('')
  }
  return String(content ?? '')
}

function assertLangChainContentBlocksAreSane(content: unknown[]): void {
  content.forEach((block, index) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return
    const record = block as Record<string, unknown>
    const type = record.type

    if (type === 'text' && ('reasoning' in record || 'thinking' in record)) {
      throw new Error(`Invalid LangChain content block at index ${index}: text block contains reasoning fields.`)
    }
    if ((type === 'reasoning' || type === 'thinking') && 'text' in record) {
      throw new Error(`Invalid LangChain content block at index ${index}: reasoning block contains text.`)
    }
    if (type === 'tool_call_chunk' && ('text' in record || 'reasoning' in record || 'thinking' in record)) {
      throw new Error(`Invalid LangChain content block at index ${index}: tool call block contains text/reasoning fields.`)
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lcMsgThinking(content: unknown, additionalKwargs?: any): string {
  if (Array.isArray(content)) assertLangChainContentBlocksAreSane(content)
  const fromContent = Array.isArray(content)
    ? content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b?.type === 'reasoning' || b?.type === 'thinking')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => String(b.reasoning ?? b.thinking ?? b.text ?? ''))
      .join('')
    : ''

  if (fromContent) return fromContent

  const summary = additionalKwargs?.reasoning?.summary
  if (Array.isArray(summary)) {
    return summary
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => String(item?.text ?? ''))
      .join('')
  }

  return String(
    additionalKwargs?.reasoning_content
    ?? additionalKwargs?.reasoning?.text
    ?? additionalKwargs?.reasoning?.reasoning
    ?? ''
  )
}

function parseMaybeJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function isLangChainToolMessageLike(raw: unknown): raw is {
  content?: unknown
  tool_call_id?: unknown
  lc_direct_tool_output?: unknown
  type?: unknown
  _getType?: () => string
  getType?: () => string
} & Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const record = raw as Record<string, unknown>
  const type =
    typeof record._getType === 'function' ? record._getType()
      : typeof record.getType === 'function' ? record.getType()
      : typeof record.type === 'string' ? record.type
      : null

  return (
    type === 'tool'
    || 'tool_call_id' in record
    || record.lc_direct_tool_output === true
    || (typeof record.content !== 'undefined' && record.constructor?.name === 'ToolMessage')
  )
}

function unwrapSerializedLangChainMessage(raw: unknown): unknown {
  let current = raw

  for (let depth = 0; depth < 4; depth += 1) {
    if (current == null) return current

    if (typeof current === 'string') {
      try {
        current = JSON.parse(current)
        continue
      } catch {
        return current
      }
    }

    if (Array.isArray(current)) return current
    if (typeof current !== 'object') return current

    const record = current as Record<string, unknown>
    if (typeof (record as { toJSON?: unknown }).toJSON === 'function') {
      try {
        const serialized = (record as { toJSON: () => unknown }).toJSON()
        if (serialized && serialized !== current) {
          current = serialized
          continue
        }
      } catch {
        // Ignore toJSON failures and continue unwrapping using other shapes.
      }
    }

    if (isLangChainToolMessageLike(record) && 'content' in record) {
      current = record.content
      continue
    }

    const lcKwargs = record['lc_kwargs']
    if (lcKwargs && typeof lcKwargs === 'object' && !Array.isArray(lcKwargs)) {
      const content = (lcKwargs as Record<string, unknown>).content
      if (content != null) {
        current = content
        continue
      }
    }

    const kwargs = record['kwargs']
    if (!kwargs || typeof kwargs !== 'object' || Array.isArray(kwargs)) {
      return current
    }

    const content = (kwargs as Record<string, unknown>).content
    if (content == null) {
      return current
    }

    current = content
  }

  return current
}

function normalizeToolOutput(raw: unknown): unknown {
  if (raw == null) return raw
  raw = unwrapSerializedLangChainMessage(raw)
  if (typeof raw === 'string') return parseMaybeJson(raw)
  if (Array.isArray(raw)) return parseMaybeJson(lcMsgText(raw))
  return raw
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Build a failed AiToolCall from a LangChain InvalidToolCall.
 * Used by both streaming (StreamEventAdapter) and replay (convertLcMessages) so both produce identical cards.
 */
export function invalidToolCallToAiToolCall(
  invalid: { id?: string; name?: string; args?: string; error?: string },
  fallbackId: string,
): AiToolCall {
  const name = invalid.name || 'unknown'
  const rawArgs = typeof invalid.args === 'string' ? invalid.args : ''
  const preview = rawArgs.length > 500 ? `${rawArgs.slice(0, 500)}…` : rawArgs
  return {
    id: invalid.id || fallbackId,
    name,
    kind: inferToolKind(name),
    title: name,
    status: 'failed',
    isError: true,
    isInvalid: true,
    arguments: {},
    result:
      '工具调用参数不是合法 JSON，未被执行。'
      + (invalid.error ? `\n${invalid.error}` : '')
      + (preview ? `\n原始参数: ${preview}` : ''),
  }
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
      // Strip system-injected XML blocks added at send time.
      const content = raw
        .replace(/<editor_state[\s\S]*?<\/editor_state>\s*/g, '')
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
      const thinkingContent = lcMsgThinking(
        msg.content,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (msg as any).additional_kwargs
      )
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

      // Append invalid tool calls (never executed, no ToolMessage follows)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lcInvalidCalls: any[] = msg.invalid_tool_calls ?? []
      lcInvalidCalls.forEach((inv: unknown, idx: number) => {
        const invalid = inv as { id?: string; name?: string; args?: string; error?: string }
        toolCalls.push(invalidToolCallToAiToolCall(invalid, `invalid-${i}-${idx}`))
      })

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
          const isHitlInterrupt = isHitlInterruptPayload(toolMsg.content) || isHitlInterruptPayload(resultText)
          const isError = !isHitlInterrupt && isToolResultError(toolMsg, resultText)
          const isRejected = isToolResultRejected(toolMsg, resultText)
          tc.status = isHitlInterrupt ? 'in_progress' : isRejected ? 'rejected' : isError ? 'failed' : 'completed'
          tc.result = resultText
          tc.isError = isError && !isRejected
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
          if (
            toolCall.status === 'pending' &&
            (BLOCK_EDIT_TOOLS.has(toolCall.name) || CREATIVE_REVIEW_TOOLS.has(toolCall.name))
          ) {
            toolCall.status = 'rejected'
          }
        }
      }

      result.push({
        id: `msg-a-${i}`,
        role: 'assistant',
        content,
        thinkingContent: thinkingContent || undefined,
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

function isToolResultError(output: unknown, result: string): boolean {
  if (isHitlInterruptPayload(output) || isHitlInterruptPayload(result)) return false
  if (/^\s*Error:/i.test(result)) return true
  if (output && typeof output === 'object') {
    const maybe = output as { error?: unknown; content?: unknown; status?: unknown }
    if (maybe.status === 'error') return true
    if (typeof maybe.error === 'string' && maybe.error.trim()) return true
    if (typeof maybe.content === 'string' && /^\s*Error:/i.test(maybe.content)) return true
  }
  return false
}

function isToolResultRejected(output: unknown, result: string): boolean {
  if (!output || typeof output !== 'object') return false
  const maybe = output as { status?: unknown }
  return maybe.status === 'error' && /^The user rejected|^User rejected/i.test(result.trim())
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
  sourceTurnId?: string,
): EditProposal {
  const id = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = typeof args.file_path === 'string' ? args.file_path : undefined

  const description = typeof args.reason === 'string' ? args.reason : undefined

  if (toolName === 'create_document') {
    const rawFilename = String(args.filename ?? '')
    const filename = rawFilename && !/\.[^./\\]+$/.test(rawFilename)
      ? `${rawFilename}.md`
      : rawFilename
    const directory = typeof args.directory === 'string' && args.directory ? args.directory : undefined
    return {
      id,
      kind: 'create_file',
      status: 'pending',
      sourceMessageId,
      sourceTurnId,
      filename,
      content: String(args.content ?? ''),
      toolCallId,
      description: description ?? `Create document: ${filename || args.filename}`,
      directory,
    } satisfies FileCreateProposal
  }

  // Block operations
  const blockProposal: Partial<BlockEditProposal> = {
    id,
    kind: 'block',
    status: 'pending',
    sourceMessageId,
    sourceTurnId,
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
      expectedCurrentContent: typeof args.expected_current_content === 'string'
        ? args.expected_current_content
        : undefined,
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
      anchorContent: entry?.content,
      newContent: String(args.new_content ?? ''),
      expectedAnchorContent: typeof args.expected_anchor_content === 'string'
        ? args.expected_anchor_content
        : undefined,
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
      expectedCurrentContent: typeof args.expected_current_content === 'string'
        ? args.expected_current_content
        : undefined,
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
      expectedOldContent: typeof args.expected_old_content === 'string'
        ? args.expected_old_content
        : undefined,
      description: description ?? `Replace {b:${startId}}–{b:${endId}}`,
    } as BlockEditProposal
  }

  // Fallback
  return { ...blockProposal, type: 'edit', description: toolName } as BlockEditProposal
}
