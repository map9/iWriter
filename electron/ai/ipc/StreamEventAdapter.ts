import type { NormalizedUsage, StreamChunkEvent } from './protocol'
import type { AiToolCall, MessageContentBlock, ThreadMessage } from '../../../src/types/ai'
import { inferToolKind } from '../../../src/types/ai'
import { isHitlInterruptPayload } from '../../../src/ai/hitl'
import { extractToolResult, invalidToolCallToAiToolCall } from './MessageAdapter'
import type { RendererEventBridge } from './RendererEventBridge'

interface PendingSubagentInvocation {
  toolCallId: string
  claimed: boolean
}

export class StreamEventAdapter {
  private assistantContent = ''
  private thinkingContent = ''
  private toolCalls: AiToolCall[] = []
  private contentBlocks: MessageContentBlock[] = []
  private pendingText = ''
  private subagentEventCount = 0
  private pendingSubagentInvocations: PendingSubagentInvocation[] = []

  constructor(
    private readonly threadId: string,
    private readonly turnId: string | undefined,
    private readonly bridge: RendererEventBridge,
    private readonly subagentId?: string,
  ) {}

  async consumeMessages(
    messages: AsyncIterable<unknown>,
    subagentName?: string,
  ): Promise<void> {
    for await (const message of messages) {
      await this._consumeOneMessage(message, subagentName)
    }
  }

  async consumeToolCalls(
    toolCalls: AsyncIterable<unknown>,
    subagentName?: string,
  ): Promise<void> {
    const pending: Promise<void>[] = []
    for await (const rawCall of toolCalls) {
      const call = rawCall as {
        name: string
        callId: string
        input: unknown
        status: Promise<'running' | 'finished' | 'error'>
        output: Promise<unknown>
        error: Promise<string | undefined>
      }
      const toolArguments = (typeof call.input === 'object' && call.input !== null)
        ? (call.input as Record<string, unknown>)
        : {}
      const toolCall: AiToolCall = {
        id: call.callId,
        name: call.name,
        kind: inferToolKind(call.name),
        title: call.name,
        status: 'in_progress',
        arguments: toolArguments,
      }
      this.toolCalls.push(toolCall)
      if (call.name === 'task') {
        this.pendingSubagentInvocations.push({ toolCallId: call.callId, claimed: false })
      }
      this._flushPendingText()
      this.contentBlocks.push({ type: 'tool_call', toolCallId: toolCall.id })
      this._send({ threadId: this.threadId, turnId: this.turnId, type: 'tool_call_start', toolName: call.name, toolCallId: call.callId, toolCall, subagentName })

      const settle = Promise.allSettled([call.status, call.output, call.error]).then(([statusResult, outputResult, errorResult]) => {
        const rawStatus = statusResult.status === 'fulfilled' ? statusResult.value : 'error'
        const rawOutput = outputResult.status === 'fulfilled' ? outputResult.value : undefined
        const rawError = errorResult.status === 'fulfilled' ? errorResult.value : undefined
        const isHitlInterrupt = rawStatus === 'error' && isHitlInterruptPayload(rawOutput)
        const isError = rawStatus === 'error' && !isHitlInterrupt
        const result = isError
          ? (typeof rawError === 'string' && rawError ? rawError : extractToolResult(call.name, rawOutput))
          : extractToolResult(call.name, rawOutput)
        const tc = this.toolCalls.find(t => t.id === call.callId)
        if (tc) {
          tc.status = isHitlInterrupt ? 'in_progress' : isError ? 'failed' : 'completed'
          tc.result = result
          tc.isError = isError
          this._send({ threadId: this.threadId, turnId: this.turnId, type: 'tool_call_end', toolCallId: call.callId, toolCall: { ...tc }, subagentName })
        }
      })
      pending.push(settle)
    }
    await Promise.all(pending)
  }

  async consumeSubagents(subagents: AsyncIterable<unknown>): Promise<void> {
    const pending: Promise<void>[] = []
    for await (const rawSub of subagents) {
      const sub = rawSub as {
        name: string
        taskInput: Promise<string>
        output: Promise<unknown>
        messages: AsyncIterable<unknown>
        toolCalls: AsyncIterable<unknown>
        subagents: AsyncIterable<unknown>
      }
      const handle = async () => {
        const taskInput = await sub.taskInput.catch(() => '')
        const taskInvocation = await this._claimSubagentInvocation()
        if (!taskInvocation) {
          console.warn('[StreamEventAdapter] Subagent stream without parent task tool call', {
            threadId: this.threadId,
            turnId: this.turnId,
            subagentName: sub.name,
          })
          const subAdapter = new StreamEventAdapter(this.threadId, this.turnId, this.bridge)
          await Promise.all([
            subAdapter.consumeMessages(sub.messages, sub.name),
            subAdapter.consumeToolCalls(sub.toolCalls, sub.name),
            subAdapter.consumeSubagents(sub.subagents),
          ])
          await sub.output.catch(() => undefined)
          return
        }
        // subagentId is intentionally the parent task toolCallId. This is the
        // shared invocation id used by the renderer to merge the task card with
        // the live subagent progress card.
        const invocationId = taskInvocation.toolCallId
        this.subagentEventCount += 1
        this.bridge.sendStreamChunk({
          threadId: this.threadId,
          turnId: this.turnId,
          type: 'subagent_start',
          subagentName: sub.name,
          taskInput,
          subagentId: invocationId
        })
        // Use a fresh adapter so subagent output doesn't pollute root partial state.
        // Pass invocationId so all events from the sub-adapter carry it for routing.
        const subAdapter = new StreamEventAdapter(this.threadId, this.turnId, this.bridge, invocationId)
        await Promise.all([
          subAdapter.consumeMessages(sub.messages, sub.name),
          subAdapter.consumeToolCalls(sub.toolCalls, sub.name),
          subAdapter.consumeSubagents(sub.subagents),
        ])
        const outputResult = await sub.output.then(
          output => ({ status: 'fulfilled' as const, output }),
          error => ({ status: 'rejected' as const, error }),
        )
        if (outputResult.status === 'fulfilled') {
          this.subagentEventCount += 1
          this.bridge.sendStreamChunk({
            threadId: this.threadId,
            turnId: this.turnId,
            type: 'subagent_end',
            subagentName: sub.name,
            output: outputResult.output,
            subagentId: invocationId
          })
        } else {
          const error = outputResult.error instanceof Error
            ? outputResult.error.message
            : String(outputResult.error ?? 'Subagent failed')
          this.subagentEventCount += 1
          this.bridge.sendStreamChunk({
            threadId: this.threadId,
            turnId: this.turnId,
            type: 'subagent_error',
            subagentName: sub.name,
            error,
            subagentId: invocationId
          })
        }
      }
      pending.push(handle())
    }
    await Promise.all(pending)
  }

  buildPartialMessage(turnId?: string): ThreadMessage | undefined {
    this._flushPendingText()
    if (!this.assistantContent && !this.toolCalls.length) return undefined
    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      turnId,
      content: this.assistantContent,
      timestamp: Date.now(),
      toolCalls: this.toolCalls.length ? this.toolCalls : undefined,
      thinkingContent: this.thinkingContent || undefined,
      contentBlocks: this.contentBlocks.length ? this.contentBlocks : undefined,
    }
  }

  hasVisibleAssistantOutput(): boolean {
    this._flushPendingText()
    return !!this.assistantContent.trim() || this.toolCalls.length > 0 || this.subagentEventCount > 0
  }

  hasAnyAssistantSignal(): boolean {
    this._flushPendingText()
    return this.hasVisibleAssistantOutput() || !!this.thinkingContent.trim() || this.contentBlocks.length > 0
  }

  private async _consumeOneMessage(
    message: unknown,
    subagentName?: string,
  ): Promise<void> {
    const msg = message as {
      text: AsyncIterable<string>
      reasoning: AsyncIterable<string>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      additional_kwargs?: Record<string, any>
      content?: unknown
    }

    const thinkingBefore = this.thinkingContent
    const streamedRole = await StreamEventAdapter.readStreamRole(msg)
    if (streamedRole && streamedRole !== 'ai' && streamedRole !== 'assistant') {
      return
    }

    await Promise.all([
      // v3 high-level text projection
      (async () => {
        for await (const delta of msg.text) {
          this.assistantContent += delta
          this.pendingText += delta
          this._send({ threadId: this.threadId, turnId: this.turnId, type: 'text', delta, subagentName })
        }
      })(),
      // v3 high-level reasoning projection (Anthropic, OpenAI Responses, DeepSeek, etc.)
      (async () => {
        for await (const delta of msg.reasoning) {
          this.thinkingContent += delta
          this._send({ threadId: this.threadId, turnId: this.turnId, type: 'thinking', delta, subagentName })
        }
      })(),
    ])

    // Fallback: if v3 reasoning stream emitted nothing, decode from lower-level fields.
    // Covers @langchain/deepseek (additional_kwargs.reasoning_content), OpenAI o1/o3
    // (additional_kwargs.reasoning.summary[].text), and Anthropic content blocks.
    if (this.thinkingContent === thinkingBefore) {
      const fallback = StreamEventAdapter.decodeFallbackReasoning(msg)
      if (fallback) {
        this.thinkingContent += fallback
        this._send({ threadId: this.threadId, turnId: this.turnId, type: 'thinking', delta: fallback, subagentName })
      }
    }

    // Surface any invalid tool calls as failed tool-call cards, and read real token usage.
    // The full AIMessage is available via msg.output after text/reasoning streams complete.
    // Errors here are non-fatal; the run.output error path handles stream-level failures.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiMessage = await (msg as any).output
      this._emitInvalidToolCalls(aiMessage, subagentName)
    } catch {
      // ignore — invalid tool-call cards are best-effort
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiMessage = await (msg as any).output
      this._emitUsage(aiMessage, subagentName)
    } catch {
      // ignore — real failures surface through run.output
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _emitUsage(aiMessage: any, subagentName?: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = aiMessage?.usage_metadata
    if (!meta || typeof meta.input_tokens !== 'number') return

    const usage: NormalizedUsage = {
      inputTokens: meta.input_tokens ?? 0,
      outputTokens: meta.output_tokens ?? 0,
      totalTokens: meta.total_tokens ?? 0,
      // LangChain normalises provider-specific cache fields into input_token_details
      cacheReadTokens: meta.input_token_details?.cache_read ?? 0,
      cacheCreationTokens: meta.input_token_details?.cache_creation ?? 0,
    }

    this._send({
      threadId: this.threadId,
      turnId: this.turnId,
      type: 'usage',
      messageId: typeof aiMessage?.id === 'string'
        ? aiMessage.id
        : this._fallbackUsageMessageId(aiMessage, usage, subagentName),
      usage,
      subagentName,
    })
  }

  private _fallbackUsageMessageId(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aiMessage: any,
    usage: NormalizedUsage,
    subagentName?: string,
  ): string {
    return `fallback-${StreamEventAdapter.stableHash(JSON.stringify({
      turnId: this.turnId,
      subagentName,
      subagentId: this.subagentId,
      content: aiMessage?.content ?? null,
      toolCalls: aiMessage?.tool_calls ?? null,
      usage,
    }))}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _emitInvalidToolCalls(aiMessage: any, subagentName?: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let invalids: any[] = Array.isArray(aiMessage?.invalid_tool_calls) ? aiMessage.invalid_tool_calls : []
    // Fallback: scan content blocks for type 'invalid_tool_call' (defensive, covers edge provider cases)
    if (invalids.length === 0 && Array.isArray(aiMessage?.content)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invalids = (aiMessage.content as any[]).filter((b: any) => b?.type === 'invalid_tool_call')
    }
    if (invalids.length === 0) return

    this._flushPendingText()
    invalids.forEach((inv: unknown, idx: number) => {
      const invalid = inv as { id?: string; name?: string; args?: string; error?: string }
      // Use toolCalls.length (position within this turn) as fallback so the ID is
      // deterministic and doesn't shift across multiple _emitInvalidToolCalls calls.
      const fallbackId = `invalid-stream-${this.toolCalls.length}-${idx}`
      const toolCall = invalidToolCallToAiToolCall(invalid, fallbackId)
      this.toolCalls.push(toolCall)
      this.contentBlocks.push({ type: 'tool_call', toolCallId: toolCall.id })
      this._send({ threadId: this.threadId, turnId: this.turnId, type: 'tool_call_start', toolName: toolCall.name, toolCallId: toolCall.id, toolCall, subagentName })
      this._send({ threadId: this.threadId, turnId: this.turnId, type: 'tool_call_end', toolCallId: toolCall.id, toolCall, subagentName })
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async readStreamRole(msg: Record<string, any>): Promise<string | undefined> {
    const asyncIterable = msg as Partial<AsyncIterable<Record<string, unknown>>>
    const iterator = asyncIterable[Symbol.asyncIterator]
    if (typeof iterator !== 'function') return undefined

    try {
      for await (const event of msg as AsyncIterable<Record<string, unknown>>) {
        if (event?.event === 'message-start') {
          const role = event.role
          return typeof role === 'string' ? role : 'ai'
        }
        if (event?.event === 'message-finish') return undefined
      }
    } catch {
      return undefined
    }

    return undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static decodeFallbackReasoning(msg: Record<string, any>): string | null {
    // @langchain/deepseek — additional_kwargs.reasoning_content
    const akw = msg.additional_kwargs
    if (typeof akw?.reasoning_content === 'string' && akw.reasoning_content) {
      return akw.reasoning_content
    }
    // OpenAI o1/o3 Responses API — additional_kwargs.reasoning.summary[].text
    const summaries = akw?.reasoning?.summary
    if (Array.isArray(summaries)) {
      const text = summaries
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((s: any) => typeof s?.text === 'string')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => s.text as string)
        .join('')
      if (text) return text
    }
    // Anthropic thinking content blocks — content[{type:'thinking'}].thinking
    if (Array.isArray(msg.content)) {
      const text = msg.content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => b?.type === 'thinking' && typeof b?.thinking === 'string')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => b.thinking as string)
        .join('')
      if (text) return text
    }
    return null
  }

  private _flushPendingText(): void {
    if (!this.pendingText) return
    this.contentBlocks.push({ type: 'text', text: this.pendingText })
    this.pendingText = ''
  }

  private async _claimSubagentInvocation(): Promise<PendingSubagentInvocation | undefined> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const invocation = this.pendingSubagentInvocations.find(item => !item.claimed)
      if (invocation) {
        invocation.claimed = true
        return invocation
      }
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    return undefined
  }

  private _send(chunk: StreamChunkEvent): void {
    this.bridge.sendStreamChunk(
      this.subagentId
        ? { ...chunk, subagentId: this.subagentId } as StreamChunkEvent
        : chunk,
    )
  }

  private static stableHash(input: string): string {
    let hash = 0
    for (let i = 0; i < input.length; i += 1) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
    }
    return Math.abs(hash).toString(36)
  }

}
