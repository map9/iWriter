import type { AiToolCall, AiToolResult, MessageContentBlock, ThreadMessage } from '@/ai/types'

export interface ToolCallStatusOverrides {
  byId?: Record<string, AiToolCall['status']>
  bySignature?: Record<string, AiToolCall['status']>
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function toolCallSignature(toolCall: AiToolCall): string {
  return `${toolCall.name}:${stableStringify(toolCall.arguments)}`
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function toolDisplayTitle(toolCall: AiToolCall): string {
  if (toolCall.name === 'execute') {
    const cmd = toolCall.arguments.command
    if (typeof cmd === 'string' && cmd) {
      return cmd.trimStart().split(/\s+/)[0] ?? toolCall.name
    }
  }
  return toolCall.title || toolCall.name
}

function toolParamsText(toolCall: AiToolCall): string {
  const args = toolCall.arguments
  const name = toolCall.name

  const fname = (fp: unknown): string => {
    const path = (typeof fp === 'string' && fp) ? fp : (toolCall.file?.path ?? '')
    return path ? basename(path) : ''
  }
  const bid = (val: unknown): string => val !== undefined && val !== null ? `{b:${val}}` : ''

  switch (name) {
    case 'execute': {
      const cmd = typeof args.command === 'string' ? args.command.trim() : ''
      const spaceIdx = cmd.search(/\s/)
      return spaceIdx >= 0 ? cmd.slice(spaceIdx + 1) : ''
    }
    case 'get_document_outline':
      return fname(args.file_path)
    case 'get_section':
      return [fname(args.file_path), bid(args.heading_block_id)].filter(Boolean).join(' ')
    case 'get_blocks': {
      const ids = Array.isArray(args.block_ids) ? args.block_ids : []
      return [fname(args.file_path), ids.map((id: unknown) => bid(id)).join(', ')].filter(Boolean).join(' ')
    }
    case 'get_block_context':
      return [fname(args.file_path), bid(args.block_id)].filter(Boolean).join(' ')
    case 'edit_block':
      return [fname(args.file_path), bid(args.block_id)].filter(Boolean).join(' ')
    case 'insert_block': {
      const f = fname(args.file_path)
      const ref = args.after_block_id !== undefined ? `after ${bid(args.after_block_id)}`
        : args.end_block_id !== undefined ? `end ${bid(args.end_block_id)}` : ''
      return [f, ref].filter(Boolean).join(' ')
    }
    case 'delete_block':
      return [fname(args.file_path), bid(args.block_id)].filter(Boolean).join(' ')
    case 'replace_range': {
      const range = (args.start_block_id !== undefined && args.end_block_id !== undefined)
        ? `${bid(args.start_block_id)}–${bid(args.end_block_id)}`
        : ''
      return [fname(args.file_path), range].filter(Boolean).join(' ')
    }
    case 'create_document':
      return fname(args.file_path) || (typeof args.filename === 'string' ? args.filename : '')
    default:
      return toolCall.paramsText ?? ''
  }
}

export function normalizeToolCallForDisplay(
  toolCall: AiToolCall,
  overrides?: ToolCallStatusOverrides,
): AiToolCall {
  const overriddenStatus =
    overrides?.byId?.[toolCall.id]
    ?? overrides?.bySignature?.[toolCallSignature(toolCall)]

  return {
    ...toolCall,
    title: toolDisplayTitle(toolCall),
    paramsText: toolParamsText(toolCall),
    status: overriddenStatus ?? toolCall.status,
  }
}

function normalizeText(text: string | undefined): string | undefined {
  if (typeof text !== 'string') return undefined
  return text.length > 0 ? text : undefined
}

function normalizeToolResults(
  toolResults: AiToolResult[] | undefined,
  toolCalls: AiToolCall[] | undefined,
): AiToolResult[] | undefined {
  if (!toolResults?.length) return undefined
  const validIds = new Set((toolCalls ?? []).map(toolCall => toolCall.id))
  const normalized = toolResults
    .filter(result => !validIds.size || validIds.has(result.toolCallId))
    .map(result => ({
      ...result,
      content: String(result.content ?? ''),
    }))
  return normalized.length ? normalized : undefined
}

function synthesizeContentBlocks(message: ThreadMessage, toolCalls: AiToolCall[] | undefined): MessageContentBlock[] | undefined {
  const blocks: MessageContentBlock[] = []

  if (message.role === 'assistant') {
    const text = normalizeText(message.content)
    if (text) blocks.push({ type: 'text', text })
    for (const toolCall of toolCalls ?? []) {
      blocks.push({ type: 'tool_call', toolCallId: toolCall.id })
    }
    return blocks.length ? blocks : undefined
  }

  const text = normalizeText(message.content)
  return text ? [{ type: 'text', text }] : undefined
}

function normalizeContentBlocks(
  message: ThreadMessage,
  toolCalls: AiToolCall[] | undefined,
): MessageContentBlock[] | undefined {
  if (!message.contentBlocks?.length) {
    return synthesizeContentBlocks(message, toolCalls)
  }

  const validIds = new Set((toolCalls ?? []).map(toolCall => toolCall.id))
  const normalized: MessageContentBlock[] = []

  for (const block of message.contentBlocks) {
    if (block.type === 'text') {
      const text = normalizeText(block.text)
      if (text) {
        normalized.push({ type: 'text', text })
      }
      continue
    }
    if (block.type === 'thinking') {
      const text = normalizeText(block.text)
      if (text) {
        normalized.push({ type: 'thinking', text })
      }
      continue
    }
    if (block.type === 'tool_call') {
      if (!block.toolCallId) continue
      if (validIds.size && !validIds.has(block.toolCallId)) continue
      normalized.push({ type: 'tool_call', toolCallId: block.toolCallId })
      continue
    }
    if (block.type === 'agent_event') {
      const text = normalizeText(block.text)
      normalized.push({
        type: 'agent_event',
        text,
        agentId: block.agentId,
        agentName: block.agentName,
        status: block.status,
      })
    }
  }

  return normalized.length ? normalized : synthesizeContentBlocks(message, toolCalls)
}

export function normalizeThreadMessageForDisplay(
  message: ThreadMessage,
  overrides?: ToolCallStatusOverrides,
): ThreadMessage {
  const normalizedToolCalls = message.toolCalls?.map(toolCall =>
    normalizeToolCallForDisplay(toolCall, overrides)
  )

  return {
    ...message,
    content: String(message.content ?? ''),
    thinkingContent: normalizeText(message.thinkingContent),
    toolCalls: normalizedToolCalls?.length ? normalizedToolCalls : undefined,
    toolResults: normalizeToolResults(message.toolResults, normalizedToolCalls),
    contentBlocks: normalizeContentBlocks(message, normalizedToolCalls),
  }
}

export function normalizeThreadMessagesForDisplay(
  messages: ThreadMessage[],
  overrides?: ToolCallStatusOverrides,
): ThreadMessage[] {
  return messages.map(message => normalizeThreadMessageForDisplay(message, overrides))
}
