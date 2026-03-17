/**
 * AgentRunner — orchestrates a full agentic turn (V3).
 *
 * Changes from V1:
 *  - edit_document replaced by block edit tools (BLOCK_EDIT_TOOLS set)
 *  - Block edit tool calls → BlockEditProposal (user must approve before execution)
 *  - AiToolCall now carries kind, title, status, file fields
 *  - thinkingContent accumulation support
 */

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
import type { AgentSession, AgentChunk, AgentStreamOptions, LMTool } from '../providers/types'
import { EditParser } from '../edit-agent/EditParser'
import { resolveToolCalls, type AccumulatedToolCall } from '../thread/Thread'
import type { ToolRegistry } from '../tools/registry'
import type { DocumentViewSnapshot } from '../thread/ContextBuilder'
import { nodeToMarkdown } from '../edit-agent/DocumentViewBuilder'
import { findNodeById } from '../edit-agent/BlockEditApplier'

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
    private getSnapshot: () => DocumentViewSnapshot | null = () => null
  ) {}

  run(
    thread: AiThread,
    systemPrompt: string,
    tools: LMTool[],
    callbacks: AgentRunCallbacks,
    options?: AgentStreamOptions
  ): void {
    this.doRun(thread, systemPrompt, tools, callbacks, 0, 0, options).catch(err => {
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
    options?: AgentStreamOptions
  ): Promise<void> {
    if (round >= MAX_TOOL_ROUNDS) {
      callbacks.onError(`Reached maximum tool rounds (${MAX_TOOL_ROUNDS}). Stopping.`)
      return
    }

    const { threadToLMMessages, trimToTokenBudget } = await import('../thread/Thread')
    let messages = threadToLMMessages(thread, systemPrompt)
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
    const toolCalls: AiToolCall[] = resolveToolCalls(
      new Map(rawCalls.map((tc, i) => [i, tc as AccumulatedToolCall]))
    ).map(tc => ({
      ...tc,
      kind:   inferToolKind(tc.name),
      title:  buildToolTitle(tc),
      status: 'pending' as const,   // will be updated after execution below
      file:   extractFileRef(tc),
    }))

    const assistantMsg: ThreadMessage = {
      id:              `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

    // ACP agents emit 'acp_done' — tool calls are display-only, not executable
    if (stopReason === 'acp_done') {
      for (const tc of toolCalls) tc.status = 'completed'
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

    // Stop the loop if this round produced only edit proposals (wait for user approval)
    const hasOnlyEdits = toolCalls.every(tc => BLOCK_EDIT_TOOLS.has(tc.name))
    if (hasOnlyEdits) {
      callbacks.onDone(assistantMsg)
      return
    }

    // Notify UI that this round is complete (shows read tool calls as a message bubble)
    callbacks.onRoundComplete?.(assistantMsg)

    // Build updated thread and continue agentic loop
    // assistantMsg already carries toolResults; threadToLMMessages converts them to
    // role:'tool' messages automatically — no need for separate result messages.
    const { appendMessage } = await import('../thread/Thread')
    const updatedThread = appendMessage(thread, assistantMsg)

    this.doRun(updatedThread, systemPrompt, tools, callbacks, round + 1, allFailed ? failedRounds + 1 : 0, options).catch(err => {
      callbacks.onError(err instanceof Error ? err.message : String(err))
    })
  }

  // ── Proposal builder ────────────────────────────────────────────────────

  private buildBlockEditProposal(tc: AiToolCall): BlockEditProposal | FileCreateProposal | null {
    const args = tc.arguments
    const snapshot = this.getSnapshot()
    const blockMap = snapshot?.view.blockMap ?? []

    const id = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    switch (tc.name) {
      case 'edit_block': {
        const displayBlockId = Number(args.block_id)
        if (isNaN(displayBlockId)) return null
        const newContent = String(args.new_content ?? '')
        if (!newContent.trim()) return null
        const entry = blockMap.find(b => b.displayId === displayBlockId)
        return {
          id, kind: 'block', type: 'edit', status: 'pending',
          toolCallId:     tc.id,
          description:    String(args.reason ?? `Edit block ${displayBlockId}`),
          displayBlockId,
          nodeId:         entry?.nodeId,
          nodeType:       entry?.nodeType,
          oldContent:     snapshot ? getOldContent(snapshot, displayBlockId) : undefined,
          newContent,
        }
      }

      case 'insert_block': {
        const afterDisplayId = Number(args.after_block_id)
        if (isNaN(afterDisplayId)) return null
        const newContent = String(args.new_blocks ?? '')
        if (!newContent.trim()) return null
        const afterEntry = blockMap.find(b => b.displayId === afterDisplayId)
        return {
          id, kind: 'block', type: 'insert', status: 'pending',
          toolCallId:   tc.id,
          description:  String(args.reason ?? `Insert after block ${afterDisplayId}`),
          displayBlockId: afterDisplayId,
          afterNodeId:  afterEntry?.nodeId ?? (afterDisplayId === 0 ? '0' : undefined),
          newContent,
        }
      }

      case 'delete_block': {
        const displayBlockId = Number(args.block_id)
        if (isNaN(displayBlockId)) return null
        const entry = blockMap.find(b => b.displayId === displayBlockId)
        return {
          id, kind: 'block', type: 'delete', status: 'pending',
          toolCallId:     tc.id,
          description:    String(args.reason ?? `Delete block ${displayBlockId}`),
          displayBlockId,
          nodeId:         entry?.nodeId,
          nodeType:       entry?.nodeType,
          oldContent:     snapshot ? getOldContent(snapshot, displayBlockId) : undefined,
        }
      }

      case 'replace_range': {
        const startDisplayId = Number(args.start_block_id)
        const endDisplayId   = Number(args.end_block_id)
        if (isNaN(startDisplayId) || isNaN(endDisplayId)) return null
        const newContent = String(args.new_content ?? '')
        if (!newContent.trim()) return null
        const startEntry = blockMap.find(b => b.displayId === startDisplayId)
        const endEntry   = blockMap.find(b => b.displayId === endDisplayId)
        // Collect old content from all blocks in range for diff display
        const oldContent = snapshot
          ? blockMap
              .filter(b => b.displayId >= startDisplayId && b.displayId <= endDisplayId)
              .map(b => getOldContent(snapshot, b.displayId))
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

function buildToolTitle(tc: AiToolCall): string {
  const args = tc.arguments
  switch (tc.name) {
    case 'create_document':      return `创建文档: ${args.filename ?? '?'}`
    case 'get_document_outline': return '读取文档目录'
    case 'get_section':          return `读取章节 (块 ${args.heading_block_id})`
    case 'get_blocks':           return `读取块 ${JSON.stringify(args.block_ids)}`
    case 'get_block_context':    return `读取块 ${args.block_id} 上下文`
    case 'edit_block':           return `编辑块 ${args.block_id ?? '?'}`
    case 'insert_block':         return `插入块 (块 ${args.after_block_id ?? '?'} 之后)`
    case 'delete_block':         return `删除块 ${args.block_id ?? '?'}`
    case 'replace_range':        return `替换块 ${args.start_block_id ?? '?'}–${args.end_block_id ?? '?'}`
    default:                     return tc.name
  }
}

function extractFileRef(
  _tc: AiToolCall
): AiToolCall['file'] | undefined {
  return undefined
}

function getOldContent(snapshot: DocumentViewSnapshot, displayBlockId: number): string {
  const entry = snapshot.view.blockMap.find(b => b.displayId === displayBlockId)
  if (!entry?.nodeId) return ''
  // Use stable UniqueID lookup rather than position-based nodeAt(from).
  // Positions shift after prior edits; nodeId remains stable throughout the session.
  const found = findNodeById(snapshot.editor.state.doc, entry.nodeId)
  if (!found) return ''
  return nodeToMarkdown(found.node)
}
