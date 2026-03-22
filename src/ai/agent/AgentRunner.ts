import type {
  AiThread,
  AiToolCall,
  AiToolResult,
  BlockEditProposal,
  FileCreateProposal,
  EditProposal,
  ThreadMessage,
} from '@/types/ai'
import { inferToolKind, BLOCK_EDIT_TOOLS } from '@/types/ai'
import type { AgentSession, AgentChunk, AgentStreamOptions, LMTool, LMContentBlock } from '../providers/types'
import { EditParser } from '../edit-agent/EditParser'
import { resolveToolCalls, type AccumulatedToolCall, threadToLMMessages, trimToTokenBudget, appendMessage } from '../thread/Thread'
import type { ToolRegistry } from '../tools/registry'
import type { DocumentViewSnapshot } from '../thread/ContextBuilder'
import { nodeToMarkdown } from '../edit-agent/DocumentViewBuilder'
import { findNodeById } from '../edit-agent/BlockEditApplier'
import { UnifiedDocumentAccess } from '../edit-agent/UnifiedDocumentAccess'
import { nanoid } from 'nanoid'
import { pathUtils } from '@/utils/pathUtils'

const MAX_TOOL_ROUNDS = 20

export interface AgentRunCallbacks {
  onText:            (delta: string) => void
  onThinkingText?:   (delta: string) => void
  onToolCallStart:   (name: string, id: string) => void
  onToolCallResult:  (toolCall: AiToolCall, result: AiToolResult) => void
  onEditProposal:    (proposal: EditProposal) => void
  /** Fires after each non-final round (read tools executed, loop continues). */
  onRoundComplete?:  (roundMessage: ThreadMessage) => void
  onDone:            (assistantMessage: ThreadMessage) => void
  onError:           (error: string) => void
}

export class AgentRunner {
  constructor(
    private session: AgentSession,
    private toolRegistry: ToolRegistry,
    /** Returns the current document view snapshot — used to resolve blockMap when building proposals */
    private getSnapshot: () => DocumentViewSnapshot | null = () => null,
    /** Returns the currently active editing file path — used to skip blockMap lookup for non-active files */
    private getFilePath: () => string | null = () => null
  ) {}

  run(
    thread: AiThread,
    systemPrompt: string,
    tools: LMTool[],
    callbacks: AgentRunCallbacks,
    options?: AgentStreamOptions,
    userContentBlocks?: LMContentBlock[]
  ): void {
    this.doRun(thread, systemPrompt, tools, callbacks, 0, 0, options, userContentBlocks).catch(err => {
      callbacks.onError(err instanceof Error ? err.message : String(err))
    })
  }

  private async doRun(
    thread: AiThread,
    systemPrompt: string,
    tools: LMTool[],
    callbacks: AgentRunCallbacks,
    round: number,
    failedRounds: number,
    options?: AgentStreamOptions,
    userContentBlocks?: LMContentBlock[]
  ): Promise<void> {
    if (round >= MAX_TOOL_ROUNDS) {
      callbacks.onError(`Reached maximum tool rounds (${MAX_TOOL_ROUNDS}). Stopping.`)
      return
    }

    // Pass userContentBlocks only on round 0 (initial user message); subsequent rounds don't need them
    let messages = threadToLMMessages(thread, systemPrompt, round === 0 ? userContentBlocks : undefined)
    messages = trimToTokenBudget(messages, 60000)

    const parser = new EditParser()
    let textBuffer = ''
    let thinkingBuffer = ''
    let stopReason = 'stop'

    await new Promise<void>(resolve => {
      this.session.stream(
        messages,
        tools,
        (chunk: AgentChunk) => {
          parser.feed(chunk)

          if (chunk.type === 'text') {
            textBuffer += chunk.delta
            callbacks.onText(chunk.delta)
          } else if (chunk.type === 'thinking') {
            thinkingBuffer += chunk.delta
            callbacks.onThinkingText?.(chunk.delta)
          } else if (chunk.type === 'tool_call_start') {
            callbacks.onToolCallStart(chunk.name, chunk.id ?? '')
          }
        },
        (reason: string) => { stopReason = reason; resolve() },
        (error: string)  => { stopReason = 'error'; callbacks.onError(error); resolve() },
        options
      )
    })

    if (stopReason === 'error') return

    // Assemble completed tool calls from parser
    const rawCalls = parser.resolvePending()
    const snapshot = this.getSnapshot()
    const toolCalls: AiToolCall[] = resolveToolCalls(
      new Map(rawCalls.map((tc, i) => [i, tc as AccumulatedToolCall]))
    ).map(tc => ({
      ...tc,
      kind:   inferToolKind(tc.name),
      title:  buildToolTitle(tc),
      status: 'pending' as const,   // will be updated after execution below
      file:   extractFileRef(tc, snapshot),
    }))

    const assistantMsg: ThreadMessage = {
      id:              `msg-${nanoid(8)}`,
      role:            'assistant',
      content:         textBuffer,
      thinkingContent: thinkingBuffer || undefined,
      timestamp:       Date.now(),
      toolCalls:       toolCalls.length ? toolCalls : undefined,
    }

    if (toolCalls.length === 0) {
      callbacks.onDone(assistantMsg)
      return
    }

    // For LLM providers: OpenAI='tool_calls', Anthropic='tool_use', Gemini='stop'
    // Any other stopReason means the model finished without requesting tool execution
    if (stopReason !== 'tool_calls' && stopReason !== 'tool_use' && stopReason !== 'stop') {
      callbacks.onDone(assistantMsg)
      return
    }

    // Execute tool calls
    const toolResults: AiToolResult[] = []
    const editProposals: EditProposal[] = []

    for (const tc of toolCalls) {
      if (BLOCK_EDIT_TOOLS.has(tc.name)) {
        // Block edit tool → produce a proposal (not auto-executed)
        const proposal = this.buildBlockEditProposal(tc)
        if (proposal) {
          // Guard: block edit with no file_path requires an active editor snapshot.
          // If neither is present the proposal would fail on approval — return an
          // actionable error immediately so the LLM can retry with file_path.
          const blockProposal = proposal.kind === 'block' ? (proposal as BlockEditProposal) : null
          if (blockProposal && !blockProposal.filePath && !this.getSnapshot()) {
            const cachedPaths = UnifiedDocumentAccess.getCachedPaths()
            const hint = cachedPaths.length > 0
              ? ` Files accessed in this session: ${cachedPaths.map(p => `"${p}"`).join(', ')}.`
              : ''
            tc.status  = 'failed'
            tc.isError = true
            toolResults.push({
              toolCallId: tc.id,
              content:
                `Error: No document is currently open in the editor and no file_path was provided.` +
                `${hint} Include file_path in the call. ` +
                `Example: ${tc.name}(..., file_path="/absolute/path/to/file.iwt")`,
              isError: true,
            })
            continue
          }
          tc.status = 'pending'   // awaiting user approval
          editProposals.push(proposal)
          callbacks.onEditProposal(proposal)
          toolResults.push({
            toolCallId: tc.id,
            content: 'Edit proposal created and is waiting for user approval.',
          })
        } else {
          tc.status  = 'failed'
          tc.isError = true
          toolResults.push({
            toolCallId: tc.id,
            content: 'Error: Could not parse edit tool arguments.',
            isError: true,
          })
        }
      } else {
        // Regular tool (read-only or file write) → execute immediately
        const result = await this.toolRegistry.execute(tc)
        // Augment toolCall with result and final status for UI display
        tc.result   = result.content.slice(0, 2000)
        tc.isError  = result.isError
        tc.status   = result.isError ? 'failed' : 'completed'
        callbacks.onToolCallResult(tc, result)
        toolResults.push(result)
      }
    }

    // ── Consecutive failure detection ───────────────────────────────────────
    const allFailed = toolResults.length > 0 && toolResults.every(r => r.isError)
    if (allFailed) {
      if (failedRounds >= 3) {
        const snapshot = this.getSnapshot()
        const headingList = snapshot
          ? snapshot.view.outline.map(h => `{b:${h.displayId}} ${h.text}`).join(', ')
          : 'unavailable'
        callbacks.onError(
          `工具调用连续失败 ${failedRounds + 1} 轮，已停止。` +
          `当前文档标题块 ID：${headingList || '无标题'}。` +
          `请检查文档是否有内容，或尝试更换模型。`
        )
        return
      }
      // Inject self-diagnostic into the last tool result so the LLM can self-correct
      const snapshot = this.getSnapshot()
      const headingList = snapshot
        ? snapshot.view.outline.map(h => `{b:${h.displayId}} "${h.text}"`).join(', ')
        : 'unavailable'
      const totalBlocks = snapshot?.view.totalBlocks ?? 0
      const lastResult = toolResults[toolResults.length - 1]!
      lastResult.content +=
        `\n\n[SELF-DIAGNOSTIC] All tool calls in this round failed (round ${round + 1}).` +
        ` Current heading block IDs: ${headingList || '(no headings)'}.` +
        ` Total blocks: ${totalBlocks}.` +
        ` Check <document_outline> and <current_section> in the system prompt for valid block IDs.` +
        ` Do NOT repeat the same call with the same arguments.`
    }

    assistantMsg.toolResults   = toolResults
    assistantMsg.editProposals = editProposals.length ? editProposals : undefined

    // Stop the loop if this round produced only edit proposals (wait for user approval).
    // Only stop when proposals were actually created — if all block edit tool calls were
    // intercepted by the guard (e.g. missing file_path), editProposals is empty and the
    // LLM should get a chance to retry with corrected arguments.
    const hasOnlyEdits = toolCalls.every(tc => BLOCK_EDIT_TOOLS.has(tc.name))
    const hasAnyProposals = editProposals.length > 0
    if (hasOnlyEdits && hasAnyProposals) {
      callbacks.onDone(assistantMsg)
      return
    }

    // Notify UI that this round is complete (shows read tool calls as a message bubble)
    callbacks.onRoundComplete?.(assistantMsg)

    // Build updated thread and continue agentic loop
    // assistantMsg already carries toolResults; threadToLMMessages converts them to
    // role:'tool' messages automatically — no need for separate result messages.
    const updatedThread = appendMessage(thread, assistantMsg)

    this.doRun(updatedThread, systemPrompt, tools, callbacks, round + 1, allFailed ? failedRounds + 1 : 0, options).catch(err => {
      callbacks.onError(err instanceof Error ? err.message : String(err))
    })
  }

  // ── Proposal builder ────────────────────────────────────────────────────

  private buildBlockEditProposal(tc: AiToolCall): BlockEditProposal | FileCreateProposal | null {
    const args = tc.arguments
    const filePath = typeof args.file_path === 'string' && args.file_path ? args.file_path : undefined
    const snapshot = this.getSnapshot()
    const blockMap = snapshot?.view.blockMap ?? []
    const blockMapById = new Map(blockMap.map(b => [b.displayId, b]))

    // When filePath targets a non-active file, skip blockMap lookup.
    // nodeIds will be resolved at approval time via UnifiedDocumentAccess.createFreshFromFile().
    const currentPath = this.getFilePath()
    const isNonActiveFile = !!filePath && !(currentPath && pathUtils.normalize(currentPath) === pathUtils.normalize(filePath))

    // Always capture the effective file path at proposal-build time.
    // When the LLM omits file_path (editing the active document), we store the active file
    // path so that approveEditProposal() can detect if the file was closed before approval
    // (Scenario 4) and fall back to the disk path instead of the wrong active editor.
    // When there is no active file but exactly one disk file was accessed via file_path in
    // this session, auto-infer it — handles the common LLM mistake of omitting file_path on
    // edit tools after having correctly used it on read tools.
    let effectiveFilePath: string | undefined = filePath ?? currentPath ?? undefined
    if (!effectiveFilePath) {
      const cachedPaths = UnifiedDocumentAccess.getCachedPaths()
      if (cachedPaths.length === 1) effectiveFilePath = cachedPaths[0]
    }

    const id = `proposal-${nanoid(8)}`
    // Strip view-only {b:N} markers that LLMs sometimes include verbatim in new content
    const stripMarkers = (s: string) => s.replace(/\{b:\d+\}\n?/g, '')
    // oldContent (for diff display) is only meaningful when the proposal targets the active
    // editor — not when effectiveFilePath was inferred from the cache for a disk file.
    // Using filePath (original LLM arg) alone is wrong: when filePath=undefined but
    // effectiveFilePath=cachedPath, we'd incorrectly read oldContent from the active editor.
    const isActiveEditorTarget = !effectiveFilePath ||
      (currentPath != null && pathUtils.normalize(currentPath) === pathUtils.normalize(effectiveFilePath))

    switch (tc.name) {
      case 'edit_block': {
        const displayBlockId = Number(args.block_id)
        if (isNaN(displayBlockId)) return null
        const newContent = stripMarkers(String(args.new_content ?? ''))
        if (!newContent.trim()) return null
        const entry = isNonActiveFile ? undefined : blockMapById.get(displayBlockId)
        return {
          id, kind: 'block', type: 'edit', status: 'pending',
          toolCallId:     tc.id,
          description:    String(args.reason ?? `Edit block ${displayBlockId}`),
          displayBlockId,
          nodeId:         entry?.nodeId,
          nodeType:       entry?.nodeType,
          oldContent:     isActiveEditorTarget ? (snapshot ? getOldContent(snapshot, displayBlockId, blockMapById) : undefined) : undefined,
          newContent,
          filePath: effectiveFilePath,
        }
      }

      case 'insert_block': {
        const afterDisplayId = Number(args.after_block_id)
        if (isNaN(afterDisplayId)) return null
        const newContent = stripMarkers(String(args.new_blocks ?? ''))
        if (!newContent.trim()) return null
        const afterEntry = isNonActiveFile ? undefined : blockMapById.get(afterDisplayId)
        return {
          id, kind: 'block', type: 'insert', status: 'pending',
          toolCallId:   tc.id,
          description:  String(args.reason ?? `Insert after block ${afterDisplayId}`),
          displayBlockId: afterDisplayId,
          afterNodeId:  isNonActiveFile ? undefined : (afterEntry?.nodeId ?? (afterDisplayId === 0 ? '0' : undefined)),
          newContent,
          filePath: effectiveFilePath,
        }
      }

      case 'delete_block': {
        const displayBlockId = Number(args.block_id)
        if (isNaN(displayBlockId)) return null
        const entry = isNonActiveFile ? undefined : blockMapById.get(displayBlockId)
        return {
          id, kind: 'block', type: 'delete', status: 'pending',
          toolCallId:     tc.id,
          description:    String(args.reason ?? `Delete block ${displayBlockId}`),
          displayBlockId,
          nodeId:         entry?.nodeId,
          nodeType:       entry?.nodeType,
          oldContent:     isActiveEditorTarget ? (snapshot ? getOldContent(snapshot, displayBlockId, blockMapById) : undefined) : undefined,
          filePath: effectiveFilePath,
        }
      }

      case 'replace_range': {
        const startDisplayId = Number(args.start_block_id)
        const endDisplayId   = Number(args.end_block_id)
        if (isNaN(startDisplayId) || isNaN(endDisplayId)) return null
        const newContent = stripMarkers(String(args.new_content ?? ''))
        if (!newContent.trim()) return null
        const startEntry = isNonActiveFile ? undefined : blockMapById.get(startDisplayId)
        const endEntry   = isNonActiveFile ? undefined : blockMapById.get(endDisplayId)
        // Collect old content from all blocks in range for diff display (active editor only)
        const oldContent = isActiveEditorTarget && snapshot
          ? blockMap
              .filter(b => b.displayId >= startDisplayId && b.displayId <= endDisplayId)
              .map(b => getOldContent(snapshot, b.displayId, blockMapById))
              .join('\n\n')
          : undefined
        return {
          id, kind: 'block', type: 'replace_range', status: 'pending',
          toolCallId:          tc.id,
          description:         String(args.reason ?? `Replace blocks ${startDisplayId}–${endDisplayId}`),
          startDisplayBlockId: startDisplayId,
          endDisplayBlockId:   endDisplayId,
          startNodeId:         startEntry?.nodeId,
          endNodeId:           endEntry?.nodeId,
          oldContent,
          newContent,
          filePath: effectiveFilePath,
        }
      }

      case 'create_document': {
        const filename = String(args.filename ?? '').trim()
        const content  = String(args.content  ?? '').trim()
        if (!filename || !content) return null
        return {
          id, kind: 'create_file', status: 'pending',
          toolCallId:  tc.id,
          description: String(args.reason ?? `创建文档: ${filename}`),
          filename,
          content,
        } satisfies FileCreateProposal
      }

      default:
        return null
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  create_document:      '创建文档',
  get_document_outline: '读取文档目录',
  get_section:          '读取章节',
  get_blocks:           '读取块',
  get_block_context:    '读取块上下文',
  edit_block:           '编辑块',
  insert_block:         '插入块',
  delete_block:         '删除块',
  replace_range:        '替换块',
  write_file:           '写入文件',
  exec_shell:           '执行命令',
}

function buildToolTitle(tc: AiToolCall): string {
  const args = tc.arguments
  if (tc.name === 'create_document') return `创建文档: ${args.filename ?? '?'}`
  return TOOL_DISPLAY_NAMES[tc.name] ?? tc.name
}

const DOC_ACCESS_TOOLS = new Set([
  'get_document_outline', 'get_section', 'get_blocks', 'get_block_context',
  'edit_block', 'insert_block', 'delete_block', 'replace_range',
])

function extractFileRef(
  tc: AiToolCall,
  snapshot?: DocumentViewSnapshot | null
): AiToolCall['file'] | undefined {
  const fp = tc.arguments.file_path
  if (typeof fp === 'string' && fp) return { path: fp }
  if (DOC_ACCESS_TOOLS.has(tc.name) && snapshot?.filePath) return { path: snapshot.filePath }
  return undefined
}

type BlockMap = DocumentViewSnapshot['view']['blockMap']
type BlockMapByIdLookup = Map<number, BlockMap[number]>

function getOldContent(
  snapshot: DocumentViewSnapshot,
  displayBlockId: number,
  blockMapById?: BlockMapByIdLookup
): string {
  const entry = blockMapById
    ? blockMapById.get(displayBlockId)
    : snapshot.view.blockMap.find(b => b.displayId === displayBlockId)
  if (!entry?.nodeId) return ''
  // Use stable UniqueID lookup rather than position-based nodeAt(from).
  // Positions shift after prior edits; nodeId remains stable throughout the session.
  const found = findNodeById(snapshot.editor.state.doc, entry.nodeId)
  if (!found) return ''
  return nodeToMarkdown(found.node)
}
