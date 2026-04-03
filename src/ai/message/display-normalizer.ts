import type { AiToolCall, AiToolDisplayMeta, AiToolResult, MessageContentBlock, TaskPlanItem, ThreadMessage } from '@/ai/types'

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

function summarizeOutline(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const outline = Array.isArray(parsedResult.outline) ? parsedResult.outline : []
  const totalBlocks = toNumber(parsedResult.total_blocks)
  const totalWords = toNumber(parsedResult.total_words)
  const parts = [`${outline.length} 个章节`]
  if (totalBlocks !== null) parts.push(`${totalBlocks} blocks`)
  if (totalWords !== null) parts.push(`${totalWords} 字`)
  return parts.join(' · ')
}

function summarizeSection(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const range = formatBlockRange(parsedResult.block_id_range)
  const totalLines = toNumber(parsedResult.total_lines)
  const wordCount = toNumber(parsedResult.word_count)
  const content = toStringValue(parsedResult.content)
  const blockCount = countBlockMarkers(content)
  const parts: string[] = []
  if (blockCount !== null && blockCount > 0) parts.push(`${blockCount} blocks`)
  else if (totalLines !== null) parts.push(`${totalLines} 段`)
  if (range) parts.push(range)
  if (wordCount !== null) parts.push(`${wordCount} 字`)
  if (parsedResult.has_more === true) parts.push('还有更多内容')
  return parts.join(' · ') || undefined
}

function summarizeBlocks(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const blocks = Array.isArray(parsedResult.blocks) ? parsedResult.blocks : []
  if (!blocks.length) return undefined
  return `${blocks.length} 个 blocks`
}

function summarizeBlockContext(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const center = formatBlockId(parsedResult.centerBlockId)
  const blocks = Array.isArray(parsedResult.blocks) ? parsedResult.blocks : []
  if (center && blocks.length) return `目标 ${center} · 共 ${blocks.length} 个上下文 blocks`
  return center ? `目标 ${center}` : undefined
}

function summarizeSearchSections(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const totalSections = toNumber(parsedResult.total_sections)
  const totalMatches = toNumber(parsedResult.total_matches)
  const parts: string[] = []
  if (totalSections !== null) parts.push(`${totalSections} 个章节`)
  if (totalMatches !== null) parts.push(`${totalMatches} 个命中`)
  return parts.join(' · ') || undefined
}

function summarizeWorkspaceSearch(parsedResult: Record<string, unknown> | null): string | undefined {
  if (!parsedResult) return undefined
  const matchedFiles = toNumber(parsedResult.matched_files)
  const totalMatches = toNumber(parsedResult.total_matches)
  const scannedFiles = toNumber(parsedResult.scanned_files)
  const parts: string[] = []
  if (matchedFiles !== null) parts.push(`${matchedFiles} 个文件`)
  if (totalMatches !== null) parts.push(`${totalMatches} 个命中`)
  if (scannedFiles !== null) parts.push(`扫描 ${scannedFiles} 个文件`)
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
  const pending = todos.length - completed - inProgress
  const parts = [`${todos.length} 项任务`]
  if (completed > 0) parts.push(`${completed} 已完成`)
  if (inProgress > 0) parts.push(`${inProgress} 进行中`)
  if (pending > 0) parts.push(`${pending} 待办`)
  return parts.join(' · ')
}

function buildRunningSummary(toolCall: AiToolCall, fallback?: string): string | undefined {
  if (toolCall.status !== 'pending' && toolCall.status !== 'in_progress') return fallback

  switch (toolCall.name) {
    case 'get_document_outline':
      return '正在读取文档大纲'
    case 'get_section':
      return '正在读取章节内容'
    case 'get_blocks':
      return '正在读取指定段落'
    case 'get_block_context':
      return '正在读取上下文'
    case 'search_document_sections':
    case 'search_in_document':
    case 'search_sections_in_document':
      return '正在搜索相关章节'
    case 'search_workspace_documents':
    case 'search_in_directory':
      return '正在搜索目录下文档内容'
    case 'search_document_blocks':
    case 'search_blocks_in_document':
      return '正在搜索相关段落'
    case 'write_todos':
      return '正在更新任务列表'
    case 'read_file':
      return '正在读取文件'
    case 'list_directory':
    case 'ls':
      return '正在查看目录'
    case 'glob':
      return '正在匹配文件'
    case 'grep':
      return '正在搜索内容'
    case 'execute':
      return '正在执行命令'
    case 'write_file':
      return '正在写入文件'
    case 'edit_file':
      return '正在编辑文件'
    default:
      return fallback ?? '正在处理'
  }
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
        actionLabel: '读取文档大纲',
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildRunningSummary(toolCall, summarizeOutline(parsedResult)),
        detailType: parsedResult ? 'outline' : 'text',
        parsedResult,
        rawResult,
      }
    case 'get_section': {
      const heading = parsedResult ? toStringValue(parsedResult.heading) : null
      const range = parsedResult ? formatBlockRange(parsedResult.block_id_range) : null
      return {
        actionLabel: '读取章节',
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: heading ? `章节 · ${heading}` : (formatBlockId(args.heading_block_id) ?? undefined),
        summaryLabel: buildRunningSummary(toolCall, summarizeSection(parsedResult) ?? range ?? undefined),
        detailType: parsedResult ? 'section' : 'text',
        parsedResult,
        rawResult,
      }
    }
    case 'get_blocks':
      return {
        actionLabel: '读取指定段落',
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: Array.isArray(args.block_ids)
          ? args.block_ids.slice(0, 4).map(id => formatBlockId(id)).filter((id): id is string => !!id).join(', ')
          : undefined,
        summaryLabel: buildRunningSummary(toolCall, summarizeBlocks(parsedResult)),
        detailType: parsedResult ? 'blocks' : 'text',
        parsedResult,
        rawResult,
      }
    case 'get_block_context':
      return {
        actionLabel: '读取上下文',
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: formatBlockId(args.block_id) ?? undefined,
        summaryLabel: buildRunningSummary(toolCall, summarizeBlockContext(parsedResult)),
        detailType: parsedResult ? 'block_context' : 'text',
        parsedResult,
        rawResult,
      }
    case 'search_document_blocks':
    case 'search_blocks_in_document':
      return {
        actionLabel: '在文档中搜索段落',
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: toStringValue(args.query) ?? undefined,
        summaryLabel: buildRunningSummary(toolCall, summarizeBlocks(parsedResult)),
        detailType: parsedResult ? 'blocks' : 'text',
        parsedResult,
        rawResult,
      }
    case 'search_document_sections':
    case 'search_in_document':
    case 'search_sections_in_document':
      return {
        actionLabel: '在文档中搜索章节',
        targetLabel: fileLabel,
        targetPath: pathArg || toolCall.file?.path,
        contextLabel: toStringValue(args.query) ?? undefined,
        summaryLabel: buildRunningSummary(toolCall, summarizeSearchSections(parsedResult)),
        detailType: parsedResult ? 'search_sections' : 'text',
        parsedResult,
        rawResult,
      }
    case 'search_workspace_documents':
    case 'search_in_directory':
      return {
        actionLabel: '在目录中搜索文档内容',
        targetLabel: toStringValue(args.query) ?? undefined,
        contextLabel: (() => {
          const dir = toStringValue(args.directory_path)
          const include = toStringValue(args.include_glob)
          const exclude = toStringValue(args.exclude_glob)
          return [
            dir ? `目录 ${basename(dir)}` : '',
            include ? `包含 ${include}` : '',
            exclude ? `排除 ${exclude}` : '',
          ].filter(Boolean).join(' · ') || undefined
        })(),
        summaryLabel: buildRunningSummary(toolCall, summarizeWorkspaceSearch(parsedResult)),
        detailType: parsedResult ? 'workspace_search' : 'text',
        parsedResult,
        rawResult,
      }
    case 'write_todos':
      return {
        actionLabel: '任务列表',
        summaryLabel: buildRunningSummary(toolCall, summarizeTodoList(parsedResult)),
        detailType: parsedResult ? 'todo_list' : 'text',
        parsedResult,
        rawResult,
      }
    case 'read_file':
      return {
        actionLabel: '读取文件',
        targetLabel: fileLabel || pathArg || undefined,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildRunningSummary(toolCall, rawResult ? `${rawResult.split('\n').length} 行结果` : undefined),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'list_directory':
    case 'ls':
      return {
        actionLabel: '查看目录',
        targetLabel: pathArg || undefined,
        summaryLabel: buildRunningSummary(toolCall, rawResult ? `${rawResult.split('\n').filter(Boolean).length} 个条目` : undefined),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'glob':
      return {
        actionLabel: '匹配文件',
        targetLabel: toStringValue(args.pattern) ?? undefined,
        contextLabel: pathArg || undefined,
        summaryLabel: buildRunningSummary(toolCall, rawResult ? `${rawResult.split('\n').filter(Boolean).length} 个结果` : undefined),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'grep':
      return {
        actionLabel: '搜索内容',
        targetLabel: toStringValue(args.pattern) ?? toStringValue(args.query) ?? undefined,
        contextLabel: pathArg || undefined,
        summaryLabel: buildRunningSummary(toolCall, rawResult ? `${rawResult.split('\n').filter(Boolean).length} 个结果` : undefined),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'execute': {
      const command = typeof args.command === 'string' ? args.command.trim() : ''
      return {
        actionLabel: '执行命令',
        targetLabel: command || undefined,
        summaryLabel: buildRunningSummary(toolCall, toolCall.status === 'completed' ? '命令执行完成' : undefined),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    }
    case 'write_file':
      return {
        actionLabel: '写入文件',
        targetLabel: fileLabel || pathArg || undefined,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildRunningSummary(toolCall, toolCall.status === 'completed' ? '文件写入完成' : undefined),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'edit_file':
      return {
        actionLabel: '编辑文件',
        targetLabel: fileLabel || pathArg || undefined,
        targetPath: pathArg || toolCall.file?.path,
        summaryLabel: buildRunningSummary(toolCall, toolCall.status === 'completed' ? '文件编辑完成' : undefined),
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
        actionLabel: '列出故事资产',
        targetLabel: toStringValue(args.section) ?? 'story workspace',
        contextLabel: sectionCount ? `${sectionCount} 个分区` : undefined,
        summaryLabel: buildRunningSummary(toolCall, fileCount ? `${fileCount} 个文件` : '暂无文件'),
        detailType: parsedResult ? 'json' : 'text',
        parsedResult,
        rawResult,
      }
    }
    case 'read_story_asset':
      return {
        actionLabel: '读取故事资产',
        targetLabel: buildStoryAssetLabel(args.section, args.slug) ?? toStringValue(args.slug) ?? undefined,
        contextLabel: toStringValue(args.section) ?? undefined,
        summaryLabel: buildRunningSummary(
          toolCall,
          rawResult ? `${rawResult.split('\n').length} 行 · ${rawResult.length} 字符` : undefined
        ),
        detailType: 'text',
        parsedResult,
        rawResult,
      }
    case 'save_story_asset': {
      const savedPath = parsedResult ? toStringValue(parsedResult.path) : null
      return {
        actionLabel: '保存故事资产',
        targetLabel: savedPath ? basename(savedPath) : (buildStoryAssetLabel(args.section, args.slug) ?? toStringValue(args.slug) ?? undefined),
        targetPath: savedPath ?? undefined,
        contextLabel: [toStringValue(args.section), toStringValue(args.slug)].filter(Boolean).join(' · ') || undefined,
        summaryLabel: buildRunningSummary(toolCall, toolCall.status === 'completed' ? '已保存' : undefined),
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
        summaryLabel: buildRunningSummary(toolCall, undefined),
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
