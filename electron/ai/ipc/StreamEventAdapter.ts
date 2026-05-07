import type { StreamChunkEvent } from './protocol'
import type { AiToolCall, MessageContentBlock, ThreadMessage } from '../../../src/types/ai'
import { inferToolKind } from '../../../src/types/ai'
import { extractToolResult, parseToolArguments } from './MessageAdapter'

interface AgentStreamState {
  assistantContent: string
  thinkingContent: string
  toolCalls: AiToolCall[]
  contentBlocks: MessageContentBlock[]
  pendingText: string
  interrupted: boolean
  interruptPayload: unknown
}

export class StreamEventAdapter {
  private state: AgentStreamState = {
    assistantContent: '',
    thinkingContent: '',
    toolCalls: [],
    contentBlocks: [],
    pendingText: '',
    interrupted: false,
    interruptPayload: null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  consume(threadId: string, event: any): StreamChunkEvent[] {
    const chunks: StreamChunkEvent[] = []

    if (event.event === 'on_chat_model_stream') {
      const chunk = event.data?.chunk
      const content = chunk?.content
      let sawReasoningInContent = false
      if (typeof content === 'string' && content) {
        this.state.assistantContent += content
        this.state.pendingText += content
        chunks.push({ threadId, type: 'text', delta: content })
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'text' && part.text) {
            this.state.assistantContent += part.text
            this.state.pendingText += part.text
            chunks.push({ threadId, type: 'text', delta: part.text })
          } else if (part.type === 'thinking' && part.thinking) {
            this.state.thinkingContent += part.thinking
            chunks.push({ threadId, type: 'thinking', delta: part.thinking })
          } else if (part.type === 'reasoning' && part.reasoning) {
            sawReasoningInContent = true
            this.state.thinkingContent += part.reasoning
            chunks.push({ threadId, type: 'thinking', delta: part.reasoning })
          } else if (part.type === 'reasoning' && part.text) {
            sawReasoningInContent = true
            this.state.thinkingContent += part.text
            chunks.push({ threadId, type: 'thinking', delta: part.text })
          }
        }
      }

      const reasoningSummary = chunk?.additional_kwargs?.reasoning?.summary
      const directReasoningContent = typeof chunk?.additional_kwargs?.reasoning_content === 'string'
        ? chunk.additional_kwargs.reasoning_content
        : ''
      if (!sawReasoningInContent && directReasoningContent) {
        this.state.thinkingContent += directReasoningContent
        chunks.push({ threadId, type: 'thinking', delta: directReasoningContent })
      }
      if (!sawReasoningInContent && Array.isArray(reasoningSummary)) {
        const reasoningText = reasoningSummary
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((part: any) => String(part?.text ?? ''))
          .join('')
        if (reasoningText) {
          this.state.thinkingContent += reasoningText
          chunks.push({ threadId, type: 'thinking', delta: reasoningText })
        }
      }

      return chunks
    }

    if (event.event === 'on_tool_start') {
      this.flushPendingText()
      const toolCall: AiToolCall = {
        id: event.run_id ?? `tool-${Date.now()}`,
        name: event.name,
        kind: inferToolKind(event.name),
        title: event.name,
        status: 'in_progress',
        arguments: parseToolArguments(event.data?.input),
      }
      this.state.toolCalls.push(toolCall)
      this.state.contentBlocks.push({ type: 'tool_call', toolCallId: toolCall.id })
      chunks.push({
        threadId,
        type: 'tool_call_start',
        toolName: event.name,
        toolCallId: toolCall.id,
        toolCall,
      })
      return chunks
    }

    if (event.event === 'on_tool_end') {
      const tc = this.state.toolCalls.find(t => t.id === event.run_id)
      if (tc) {
        const result = extractToolResult(event.name, event.data?.output)
        const isError = isToolResultError(event.data?.output, result)
        tc.status = isError ? 'failed' : 'completed'
        tc.result = result
        tc.isError = isError
        chunks.push({
          threadId,
          type: 'tool_call_end',
          toolCallId: tc.id,
          toolCall: { ...tc },
        })
      }
      return chunks
    }

    if (event.event === 'on_tool_error') {
      const tc = this.state.toolCalls.find(t => t.id === event.run_id)
      if (tc) {
        tc.status = 'failed'
        tc.isError = true
        tc.result = event.data?.error instanceof Error
          ? event.data.error.message
          : String(event.data?.error ?? 'Tool failed.')
        chunks.push({
          threadId,
          type: 'tool_call_end',
          toolCallId: tc.id,
          toolCall: { ...tc },
        })
      }
      return chunks
    }

    if (event.event === 'on_chain_stream' && event.data?.chunk?.__interrupt__) {
      this.state.interrupted = true
      const interruptValues = event.data.chunk.__interrupt__
      this.state.interruptPayload = Array.isArray(interruptValues)
        ? interruptValues[0]?.value
        : interruptValues?.value ?? interruptValues
      return chunks
    }

    if (event.event === 'on_chain_end' && event.data?.output?.__interrupt__) {
      this.state.interrupted = true
      this.state.interruptPayload = event.data.output.__interrupt__[0]?.value
    }

    return chunks
  }

  get interrupted(): boolean {
    return this.state.interrupted
  }

  get interruptPayload(): unknown {
    return this.state.interruptPayload
  }

  buildPartialMessage(turnId?: string): ThreadMessage | undefined {
    this.flushPendingText()
    if (!this.state.assistantContent && !this.state.toolCalls.length) return undefined

    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      turnId,
      content: this.state.assistantContent,
      timestamp: Date.now(),
      toolCalls: this.state.toolCalls.length ? this.state.toolCalls : undefined,
      thinkingContent: this.state.thinkingContent || undefined,
      contentBlocks: this.state.contentBlocks.length ? this.state.contentBlocks : undefined,
    }
  }

  private flushPendingText(): void {
    if (!this.state.pendingText) return
    this.state.contentBlocks.push({ type: 'text', text: this.state.pendingText })
    this.state.pendingText = ''
  }
}

function isToolResultError(output: unknown, result: string): boolean {
  if (/^\s*Error:/i.test(result)) return true
  if (output && typeof output === 'object') {
    const maybe = output as { error?: unknown }
    if (typeof maybe.error === 'string' && maybe.error.trim()) return true
    const content = (output as { content?: unknown }).content
    if (typeof content === 'string' && /^\s*Error:/i.test(content)) return true
  }
  return false
}
