import type { AiToolCall, AiToolDisplayMeta, AiToolResult, MessageContentBlock, TaskPlanItem, ThreadMessage } from '@/ai/types'
import { i18n } from '@/i18n'

export interface ToolCallStatusOverrides {
  byId?: Record<string, AiToolCall['status']>
  bySignature?: Record<string, AiToolCall['status']>
}

function t(key: string, params?: Record<string, unknown>): string {
  return (params ? i18n.global.t(key, params) : i18n.global.t(key)) as string
}

function te(key: string): boolean {
  return i18n.global.te(key)
}

function toolNameLabel(name: string): string {
  const key = `agentPanel.chatArea.toolNames.${name}`
  return te(key) ? t(key) : name
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

function buildStoryAssetLabel(section: unknown, slug: unknown): string | undefined {
  const sectionText = toStringValue(section)
  const slugText = toStringValue(slug)
  if (!sectionText || !slugText) return undefined
  return `${sectionText}/${slugText}.md`
}

function parseJsonObject(text: string | undefined): Record<string, unknown> | null {
  if (typeof text !== 'string' || !text.trim()) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatBlockId(value: unknown): string | null {
  return value !== undefined && value !== null ? `{b:${value}}` : null
}

function formatBlockRange(range: unknown): string | null {
  if (!Array.isArray(range) || range.length < 2) return null
  const start = formatBlockId(range[0])
  const end = formatBlockId(range[1])
  return start && end ? `${start}-${end}` : null
}

function countBlockMarkers(text: string | null): number | null {
  if (!text) return null
  const matches = text.match(/\{b:\d+\}/g)
  return matches?.length ?? 0
}

function toolDisplayTitle(toolCall: AiToolCall): string {
  const actionLabel = toolCall.display?.actionLabel
  if (actionLabel) return actionLabel
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
      const ref = args.after_block_id !== undefined
        ? t('agentPanel.displayNormalizer.params.afterBlock', { block: bid(args.after_block_id) })
        : args.end_block_id !== undefined
          ? t('agentPanel.displayNormalizer.params.endBlock', { block: bid(args.end_block_id) })
          : ''
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

function summarizeOutline(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const outline = Array.isArray(parsedResult.outline) ? parsedResult.outline : []
  const totalWords = toNumber(parsedResult.total_words)
  const parts = [t('agentPanel.displayNormalizer.count.chapters', { count: outline.length })]
  if (totalWords !== null && totalWords > 0) parts.push(t('agentPanel.displayNormalizer.count.words', { count: totalWords }))
  return parts.join(' · ')
}

function summarizeSection(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const totalLines = toNumber(parsedResult.total_lines)
  const wordCount = toNumber(parsedResult.word_count)
  const offset = toNumber(parsedResult.offset)
  const hasMore = parsedResult.has_more === true
  const content = toStringValue(parsedResult.content)
  const pageCount = countBlockMarkers(content)

  // 一次性读完整章节（首页且无后续，且当前页段数等于总段数）
  const isFullRead =
    (offset === null || offset === 0)
    && !hasMore
    && pageCount !== null
    && totalLines !== null
    && pageCount === totalLines

  if (isFullRead && totalLines !== null) {
    const parts = [t('agentPanel.displayNormalizer.count.blocks', { count: totalLines })]
    if (wordCount !== null && wordCount > 0) parts.push(t('agentPanel.displayNormalizer.count.words', { count: wordCount }))
    return parts.join(' · ')
  }

  // 翻页：显示当前页范围 / 总段数（不显示字数，word_count 是整章的会误导）
  if (offset !== null && pageCount !== null && pageCount > 0 && totalLines !== null) {
    const start = offset + 1
    const end = Math.min(offset + pageCount, totalLines)
    return t('agentPanel.displayNormalizer.summary.sectionPageRange', { start, end, total: totalLines })
  }

  if (totalLines !== null) return t('agentPanel.displayNormalizer.summary.sectionTotal', { total: totalLines })
  return undefined
}

function summarizeBlocks(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const blocks = Array.isArray(parsedResult.blocks) ? parsedResult.blocks : []
  if (!blocks.length) return undefined
  return t('agentPanel.displayNormalizer.count.blocks', { count: blocks.length })
}

function summarizeDocumentBlockSearch(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const totalMatches = toNumber(parsedResult.total_matches)
  if (totalMatches === null) return undefined
  return t('agentPanel.displayNormalizer.count.matches', { count: totalMatches })
}

function summarizeBlockContext(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const blocks = Array.isArray(parsedResult.blocks) ? parsedResult.blocks : []
  if (!blocks.length) return undefined
  return t('agentPanel.displayNormalizer.count.contextBlocks', { count: blocks.length })
}

function summarizeSearchSections(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const totalSections = toNumber(parsedResult.total_sections)
  const totalMatches = toNumber(parsedResult.total_matches)
  const parts: string[] = []
  if (totalMatches !== null) parts.push(t('agentPanel.displayNormalizer.count.matches', { count: totalMatches }))
  if (totalSections !== null) parts.push(t('agentPanel.displayNormalizer.count.chapters', { count: totalSections }))
  return parts.join(' · ') || undefined
}

function summarizeWorkspaceSearch(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const matchedFiles = toNumber(parsedResult.matched_files)
  const totalMatches = toNumber(parsedResult.total_matches)
  const parts: string[] = []
  if (matchedFiles !== null) parts.push(t('agentPanel.displayNormalizer.count.files', { count: matchedFiles }))
  if (totalMatches !== null) parts.push(t('agentPanel.displayNormalizer.count.matches', { count: totalMatches }))
  return parts.join(' · ') || undefined
}

function summarizeTodoList(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const todos = Array.isArray(parsedResult.todos) ? parsedResult.todos : []
  if (!todos.length) return undefined
  let completed = 0
  let inProgress = 0
  for (const item of todos) {
    const status = typeof (item as Record<string, unknown>).status === 'string'
      ? String((item as Record<string, unknown>).status)
      : ''
    if (status === 'completed') completed += 1
    else if (status === 'in_progress') inProgress += 1
  }
  const parts = [t('agentPanel.displayNormalizer.summary.todoProgress', { completed, total: todos.length })]
  if (inProgress > 0) parts.push(t('agentPanel.displayNormalizer.summary.inProgress', { count: inProgress }))
  return parts.join(' · ')
}

function buildStatusSummary(toolCall: AiToolCall, completedSummary?: string): string | undefined {
  if (toolCall.status === 'rejected') return t('agentPanel.displayNormalizer.status.rejected')
  if (toolCall.isError || toolCall.status === 'failed') return t('agentPanel.displayNormalizer.status.failed')
  if (toolCall.status === 'pending' || toolCall.status === 'in_progress') return undefined
  return completedSummary
}

function buildToolDisplayMeta(toolCall: AiToolCall): AiToolDisplayMeta {
  const args = toolCall.arguments
  const pathArg =
    (typeof args.file_path === 'string' && args.file_path)
    || (typeof args.path === 'string' && args.path)
    || ''
  const fileLabel = (() => {
    const fromArg = pathArg ? basename(pathArg) : ''
    const fromFile = toolCall.file?.path ? basename(toolCall.file.path) : ''
    return fromArg || fromFile || undefined
  })()
  const rawResult = typeof toolCall.result === 'string' ? toolCall.result : undefined
  const parsedResult = parseJsonObject(rawResult)

  switch (toolCall.name) {
    case 'get_document_outline':
      return {
        actionLabel: toolNameLabel('get_document_outline'),
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildStatusSummary(toolCall, summarizeOutline(parsedResult)),
        detailType: parsedResult ? 'outline' : 'text',
        parsedResult,
        rawResult,
      }
    case 'get_section': {
      const heading = parsedResult ? toStringValue(parsedResult.heading) : null
      const range = parsedResult ? formatBlockRange(parsedResult.block_id_range) : null
      return {
        actionLabel: toolNameLabel('get_section'),
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: heading ?? (formatBlockId(args.heading_block_id) ?? undefined),
        summaryLabel: buildStatusSummary(toolCall, summarizeSection(parsedResult) ?? range ?? undefined),
        detailType: parsedResult ? 'section' : 'text',
        parsedResult,
        rawResult,
      }
    }
    case 'get_blocks':
      return {
        actionLabel: toolNameLabel('get_blocks'),
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: (() => {
          const ids = Array.isArray(args.block_ids) ? args.block_ids : []
          const shown = ids.slice(0, 2).map(id => formatBlockId(id)).filter((id): id is string => !!id).join(', ')
          if (!shown) return undefined
          const rest = ids.length > 2 ? t('agentPanel.displayNormalizer.summary.moreCount', { count: ids.length - 2 }) : ''
          return `${shown}${rest}`
        })(),
        summaryLabel: buildStatusSummary(toolCall, summarizeBlocks(parsedResult)),
        detailType: parsedResult ? 'blocks' : 'text',
        parsedResult,
        rawResult,
      }
    case 'get_block_context':
      return {
        actionLabel: toolNameLabel('get_block_context'),
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: formatBlockId(args.block_id) ?? undefined,
        summaryLabel: buildStatusSummary(toolCall, summarizeBlockContext(parsedResult)),
        detailType: parsedResult ? 'block_context' : 'text',
        parsedResult,
        rawResult,
      }
    case 'search_blocks_in_document':
      return {
        actionLabel: toolNameLabel('search_blocks_in_document'),
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: (() => {
          const q = toStringValue(args.query)
          return q ? `"${q}"` : undefined
        })(),
        summaryLabel: buildStatusSummary(toolCall, summarizeDocumentBlockSearch(parsedResult)),
        detailType: parsedResult ? 'blocks' : 'text',
        parsedResult,
        rawResult,
      }
    case 'search_sections_in_document':
      return {
        actionLabel: toolNameLabel('search_sections_in_document'),
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: (() => {
          const q = toStringValue(args.query)
          return q ? `"${q}"` : undefined
        })(),
        summaryLabel: buildStatusSummary(toolCall, summarizeSearchSections(parsedResult)),
        detailType: parsedResult ? 'search_sections' : 'text',
        parsedResult,
        rawResult,
      }
    case 'search_in_directory':
      return {
        actionLabel: toolNameLabel('search_in_directory'),
        targetLabel: (() => {
          const q = toStringValue(args.query)
          return q ? `"${q}"` : undefined
        })(),
        contextLabel: (() => {
          const dir = toStringValue(args.directory_path)
          return dir ? t('agentPanel.displayNormalizer.params.directory', { name: basename(dir) }) : undefined
        })(),
        summaryLabel: buildStatusSummary(toolCall, summarizeWorkspaceSearch(parsedResult)),
        detailType: parsedResult ? 'workspace_search' : 'text',
        parsedResult,
        rawResult,
      }
    case 'write_todos':
      return {
        actionLabel: toolNameLabel('write_todos'),
        summaryLabel: buildStatusSummary(toolCall, summarizeTodoList(parsedResult)),
        detailType: parsedResult ? 'todo_list' : 'text',
        parsedResult,
        rawResult,
      }
    case 'read_file':
      return {
        actionLabel: toolNameLabel('read_file'),
        targetLabel: fileLabel || pathArg || undefined,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildStatusSummary(
          toolCall,
          rawResult ? t('agentPanel.displayNormalizer.count.lines', { count: rawResult.split('\n').length }) : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'list_directory':
    case 'ls':
      return {
        actionLabel: toolNameLabel('ls'),
        targetLabel: pathArg || undefined,
        summaryLabel: buildStatusSummary(
          toolCall,
          rawResult ? t('agentPanel.displayNormalizer.count.items', { count: rawResult.split('\n').filter(Boolean).length }) : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'glob':
      return {
        actionLabel: toolNameLabel('glob'),
        targetLabel: toStringValue(args.pattern) ?? undefined,
        contextLabel: pathArg || undefined,
        summaryLabel: buildStatusSummary(
          toolCall,
          rawResult ? t('agentPanel.displayNormalizer.count.items', { count: rawResult.split('\n').filter(Boolean).length }) : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'grep':
      return {
        actionLabel: toolNameLabel('grep'),
        targetLabel: toStringValue(args.pattern) ?? toStringValue(args.query) ?? undefined,
        contextLabel: pathArg || undefined,
        summaryLabel: buildStatusSummary(
          toolCall,
          rawResult ? t('agentPanel.displayNormalizer.count.matches', { count: rawResult.split('\n').filter(Boolean).length }) : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'execute': {
      const command = typeof args.command === 'string' ? args.command.trim() : ''
      return {
        actionLabel: toolNameLabel('execute'),
        targetLabel: command || undefined,
        summaryLabel: buildStatusSummary(
          toolCall,
          toolCall.status === 'completed' ? t('agentPanel.displayNormalizer.status.completed') : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    }
    case 'write_file':
      return {
        actionLabel: toolNameLabel('write_file'),
        targetLabel: fileLabel || pathArg || undefined,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildStatusSummary(
          toolCall,
          toolCall.status === 'completed' ? t('agentPanel.displayNormalizer.status.written') : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'edit_file':
      return {
        actionLabel: toolNameLabel('edit_file'),
        targetLabel: fileLabel || pathArg || undefined,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildStatusSummary(
          toolCall,
          toolCall.status === 'completed' ? t('agentPanel.displayNormalizer.status.edited') : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'list_story_assets': {
      const sections = parsedResult && Array.isArray(parsedResult.sections) ? parsedResult.sections : []
      const sectionCount = sections.length
      const fileCount = sections.reduce((total, item) => {
        const entry = item as Record<string, unknown>
        return total + (Array.isArray(entry.files) ? entry.files.length : 0)
      }, 0)
      return {
        actionLabel: toolNameLabel('list_story_assets'),
        targetLabel: toStringValue(args.section) ?? t('agentPanel.displayNormalizer.storyWorkspace'),
        contextLabel: sectionCount ? t('agentPanel.displayNormalizer.count.sections', { count: sectionCount }) : undefined,
        summaryLabel: buildStatusSummary(
          toolCall,
          fileCount
            ? t('agentPanel.displayNormalizer.count.items', { count: fileCount })
            : t('agentPanel.displayNormalizer.status.empty')
        ),
        detailType: parsedResult ? 'json' : 'text',
        parsedResult,
        rawResult,
      }
    }
    case 'read_story_asset':
      return {
        actionLabel: toolNameLabel('read_story_asset'),
        targetLabel: buildStoryAssetLabel(args.section, args.slug) ?? toStringValue(args.slug) ?? undefined,
        contextLabel: toStringValue(args.section) ?? undefined,
        summaryLabel: buildStatusSummary(
          toolCall,
          rawResult ? t('agentPanel.displayNormalizer.count.lines', { count: rawResult.split('\n').length }) : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'task': {
      const description = toStringValue(args.description)
      const subagentType = toStringValue(args.subagent_type) ?? t('agentPanel.displayNormalizer.subagent.generalPurpose')
      const descriptionPreview = description && description.length > 80
        ? `${description.slice(0, 80)}…`
        : description ?? undefined
      const resultText = typeof rawResult === 'string' ? rawResult : ''
      const completedSummary = toolCall.status === 'completed' && resultText
        ? t('agentPanel.displayNormalizer.summary.returnedChars', { count: resultText.length })
        : undefined
      return {
        actionLabel: toolNameLabel('task'),
        targetLabel: subagentType,
        contextLabel: descriptionPreview,
        summaryLabel: buildStatusSummary(toolCall, completedSummary),
        detailType: (description || resultText) ? 'subagent_task' : 'text',
        parsedResult: {
          description: description ?? '',
          subagent_type: subagentType,
          result: resultText,
        },
        rawResult,
      }
    }
    case 'save_story_asset': {
      const savedPath = parsedResult ? toStringValue(parsedResult.path) : null
      return {
        actionLabel: toolNameLabel('save_story_asset'),
        targetLabel: savedPath ? basename(savedPath) : (buildStoryAssetLabel(args.section, args.slug) ?? toStringValue(args.slug) ?? undefined),
        targetPath: savedPath ?? undefined,
        contextLabel: [toStringValue(args.section), toStringValue(args.slug)].filter(Boolean).join(' · ') || undefined,
        summaryLabel: buildStatusSummary(
          toolCall,
          toolCall.status === 'completed' ? t('agentPanel.displayNormalizer.status.saved') : undefined
        ),
        detailType: parsedResult ? 'json' : 'text',
        parsedResult,
        rawResult,
      }
    }
    default:
      return {
        actionLabel: toolCall.title || toolCall.name,
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildStatusSummary(toolCall, undefined),
        detailType: parsedResult ? 'json' : 'text',
        parsedResult,
        rawResult,
      }
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
    display: buildToolDisplayMeta({
      ...toolCall,
      status: overriddenStatus ?? toolCall.status,
    }),
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

function parseTaskPlanFromToolCall(toolCall: AiToolCall): { toolCallId?: string; items: TaskPlanItem[] } | undefined {
  if (toolCall.name !== 'write_todos') return undefined
  const parsed = toolCall.display?.parsedResult
  const todos = Array.isArray(parsed?.todos) ? parsed.todos : []
  const items = todos
    .map(item => {
      const entry = item as Record<string, unknown>
      const content = typeof entry.content === 'string' ? entry.content.trim() : ''
      const rawStatus = typeof entry.status === 'string' ? entry.status : 'pending'
      const status: TaskPlanItem['status'] =
        rawStatus === 'completed' || rawStatus === 'in_progress' ? rawStatus : 'pending'
      if (!content) return null
      return { content, status }
    })
    .filter((item): item is TaskPlanItem => !!item)
  if (!items.length) return undefined
  return { toolCallId: toolCall.id, items }
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
  const taskPlans = normalizedToolCalls
    ?.map(parseTaskPlanFromToolCall)
    .filter((plan): plan is { toolCallId?: string; items: TaskPlanItem[] } => !!plan)
  const taskPlan = taskPlans?.length ? taskPlans[taskPlans.length - 1] : undefined

  return {
    ...message,
    content: String(message.content ?? ''),
    thinkingContent: normalizeText(message.thinkingContent),
    toolCalls: normalizedToolCalls?.length ? normalizedToolCalls : undefined,
    toolResults: normalizeToolResults(message.toolResults, normalizedToolCalls),
    taskPlan,
    contentBlocks: normalizeContentBlocks(message, normalizedToolCalls),
  }
}

export function normalizeThreadMessagesForDisplay(
  messages: ThreadMessage[],
  overrides?: ToolCallStatusOverrides,
): ThreadMessage[] {
  return messages.map(message => normalizeThreadMessageForDisplay(message, overrides))
}
