/**
 * AgentRunner — orchestrates a full agentic turn.
 *
 * Responsibilities:
 *  1. Build the LMMessage array from the thread + system prompt.
 *  2. Call the AgentSession to start streaming.
 *  3. Accumulate text deltas and tool call fragments via EditParser.
 *  4. On 'done':
 *     - Execute non-edit tool calls via ToolRegistry.
 *     - Convert edit_document tool calls to EditProposals (not auto-executed).
 *     - If stop_reason is 'tool_calls', loop (multi-turn agentic cycle).
 *  5. Emit callbacks for each phase (onText, onToolCall, onEditProposal, onDone, onError).
 *
 * The loop is capped at MAX_TOOL_ROUNDS to prevent runaway agentic cycles.
 */

import type { AiThread, AiToolCall, AiToolResult, EditProposal, ThreadMessage } from '@/types/ai'
import type { AgentSession, AgentChunk, AgentStreamOptions, LMTool } from '../providers/types'
import { EditParser, parseEditProposal } from '../edit-agent/EditParser'
import { resolveToolCalls, type AccumulatedToolCall } from '../thread/Thread'
import type { ToolRegistry } from '../tools/registry'

const MAX_TOOL_ROUNDS = 8

export interface AgentRunCallbacks {
  onText: (delta: string) => void
  onToolCallStart: (name: string) => void
  onToolCallResult: (toolCall: AiToolCall, result: AiToolResult) => void
  onEditProposal: (proposal: EditProposal) => void
  onDone: (assistantMessage: ThreadMessage) => void
  onError: (error: string) => void
}

export class AgentRunner {
  constructor(
    private session: AgentSession,
    private toolRegistry: ToolRegistry
  ) {}

  run(
    thread: AiThread,
    systemPrompt: string,
    tools: LMTool[],
    callbacks: AgentRunCallbacks,
    options?: AgentStreamOptions
  ): void {
    this.doRun(thread, systemPrompt, tools, callbacks, 0, options)
  }

  private async doRun(
    thread: AiThread,
    systemPrompt: string,
    tools: LMTool[],
    callbacks: AgentRunCallbacks,
    round: number,
    options?: AgentStreamOptions
  ): Promise<void> {
    if (round >= MAX_TOOL_ROUNDS) {
      callbacks.onError(`Reached maximum tool rounds (${MAX_TOOL_ROUNDS}). Stopping.`)
      return
    }

    // Build LM messages
    const { threadToLMMessages, trimToTokenBudget } = await import('../thread/Thread')
    let messages = threadToLMMessages(thread, systemPrompt)
    messages = trimToTokenBudget(messages, 60000)  // ~60k token budget

    const parser = new EditParser()
    let textBuffer = ''
    let stopReason = 'stop'

    await new Promise<void>(resolve => {
      this.session.stream(
        messages,
        tools,
        (chunk: AgentChunk) => {
          // chunk handler below
          parser.feed(chunk)
          if (chunk.type === 'text') {
            textBuffer += chunk.delta
            callbacks.onText(chunk.delta)
          } else if (chunk.type === 'tool_call_start') {
            callbacks.onToolCallStart(chunk.name)
          }
        },
        (reason: string) => {
          stopReason = reason
          resolve()
        },
        (error: string) => {
          callbacks.onError(error)
          resolve()
        },
        options
      )
    })

    if (stopReason === 'error') return

    // Assemble completed tool calls
    const rawCalls = parser.resolvePending()
    const toolCalls: AiToolCall[] = resolveToolCalls(
      new Map(rawCalls.map((tc, i) => [i, tc as AccumulatedToolCall]))
    )

    // Build the assistant message (content + tool calls)
    const assistantMsg: ThreadMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'assistant',
      content: textBuffer,
      timestamp: Date.now(),
      toolCalls: toolCalls.length ? toolCalls : undefined,
    }

    if (stopReason !== 'tool_calls' || toolCalls.length === 0) {
      callbacks.onDone(assistantMsg)
      return
    }

    // Execute tool calls
    const toolResults: AiToolResult[] = []
    const editProposals: EditProposal[] = []

    for (const tc of toolCalls) {
      if (tc.name === 'edit_document') {
        // edit_document is never auto-executed — produce a proposal instead
        const proposal = parseEditProposal(tc.id, JSON.stringify(tc.arguments))
        if (proposal) {
          editProposals.push(proposal)
          callbacks.onEditProposal(proposal)
          toolResults.push({
            toolCallId: tc.id,
            content: 'Edit proposal created. Waiting for user approval.',
          })
        } else {
          toolResults.push({
            toolCallId: tc.id,
            content: 'Error: Invalid edit_document arguments.',
            isError: true,
          })
        }
      } else {
        const result = await this.toolRegistry.execute(tc)
        callbacks.onToolCallResult(tc, result)
        toolResults.push(result)
      }
    }

    // Attach results to assistant message
    assistantMsg.toolResults = toolResults
    assistantMsg.editProposals = editProposals.length ? editProposals : undefined

    // If there were only edit proposals, stop the loop (don't re-send)
    const hasOnlyEdits = toolCalls.every(tc => tc.name === 'edit_document')
    if (hasOnlyEdits) {
      callbacks.onDone(assistantMsg)
      return
    }

    // Build updated thread with assistant message + tool results appended
    const { appendMessage, createMessage } = await import('../thread/Thread')
    let updatedThread = appendMessage(thread, assistantMsg)

    // Add tool results as a combined context message (tool role per call)
    for (const tr of toolResults) {
      const resultMsg = createMessage('assistant', '', { toolResults: [tr] })
      updatedThread = appendMessage(updatedThread, resultMsg)
    }

    // Continue the agentic loop
    this.doRun(updatedThread, systemPrompt, tools, callbacks, round + 1, options)
  }
}
