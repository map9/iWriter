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
  pendingReasoningLogText: string
  interrupted: boolean
  interruptPayload: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function findInterruptMarker(value: unknown, seen = new Set<unknown>()): unknown {
  if (!isRecord(value) && !Array.isArray(value)) return null
  if (seen.has(value)) return null
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInterruptMarker(item, seen)
      if (found) return found
    }
    return null
  }

  if ('__interrupt__' in value) {
    return value.__interrupt__
  }

  for (const nestedValue of Object.values(value)) {
    const found = findInterruptMarker(nestedValue, seen)
    if (found) return found
  }

  return null
}

export class StreamEventAdapter {
  private state: AgentStreamState = {
    assistantContent: '',
    thinkingContent: '',
    toolCalls: [],
    contentBlocks: [],
    pendingText: '',
    pendingReasoningLogText: '',
    interrupted: false,
    interruptPayload: null,
  }

  consume(threadId: string, event: any): StreamChunkEvent[] {
    const chunks: StreamChunkEvent[] = []

    if (event.event === 'on_chat_model_stream') {
      const chunk = event.data?.chunk
      const content = chunk?.content
      let sawReasoningInContent = false
      let reasoningDeltaFromContent = ''
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
            reasoningDeltaFromContent += part.reasoning
            this.state.thinkingContent += part.reasoning
            chunks.push({ threadId, type: 'thinking', delta: part.reasoning })
          } else if (part.type === 'reasoning' && part.text) {
            sawReasoningInContent = true
            reasoningDeltaFromContent += part.text
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

      if (sawReasoningInContent || directReasoningContent || Array.isArray(reasoningSummary)) {
        this.logReasoningDebug(
          threadId,
          {
            sawReasoningInContent,
            directReasoningContent,
            reasoningDeltaFromContent,
            reasoningSummary,
          },
        )
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
        tc.status = 'completed'
        tc.result = extractToolResult(event.name, event.data?.output)
        chunks.push({
          threadId,
          type: 'tool_call_end',
          toolCallId: tc.id,
          toolCall: { ...tc },
        })
      }
      return chunks
    }

    const interruptMarker = findInterruptMarker(event)
    if (interruptMarker) {
      console.debug('[StreamEventAdapter] interrupt marker detected', {
        threadId,
        event: event.event,
        runId: event.run_id ?? null,
        markerPreview: safeJsonPreview(interruptMarker),
      })
    }

    if (event.event === 'on_chain_stream' && event.data?.chunk?.__interrupt__) {
      this.state.interrupted = true
      const interruptValues = event.data.chunk.__interrupt__
      this.state.interruptPayload = Array.isArray(interruptValues)
        ? interruptValues[0]?.value
        : interruptValues?.value ?? interruptValues
      console.debug('[StreamEventAdapter] recognized interrupt from on_chain_stream', {
        threadId,
        payloadPreview: safeJsonPreview(this.state.interruptPayload),
      })
      return chunks
    }

    if (event.event === 'on_chain_end' && event.data?.output?.__interrupt__) {
      this.state.interrupted = true
      this.state.interruptPayload = event.data.output.__interrupt__[0]?.value
      console.debug('[StreamEventAdapter] recognized interrupt from on_chain_end', {
        threadId,
        payloadPreview: safeJsonPreview(this.state.interruptPayload),
      })
    }

    return chunks
  }

  get interrupted(): boolean {
    return this.state.interrupted
  }

  get interruptPayload(): unknown {
    return this.state.interruptPayload
  }

  buildPartialMessage(): ThreadMessage | undefined {
    this.flushPendingText()
    if (!this.state.assistantContent && !this.state.toolCalls.length) return undefined

    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
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

  // DeepSeek streams reasoning in tiny 1-2 char fragments very frequently.
  // Aggregate those fragments so debug output reflects meaningful progress.
  private logReasoningDebug(
    threadId: string,
    params: {
      sawReasoningInContent: boolean
      directReasoningContent: string
      reasoningDeltaFromContent: string
      reasoningSummary: unknown
    },
  ): void {
    const {
      sawReasoningInContent,
      directReasoningContent,
      reasoningDeltaFromContent,
      reasoningSummary,
    } = params

    if (directReasoningContent) {
      this.state.pendingReasoningLogText += directReasoningContent
    }

    const summaryPreview = Array.isArray(reasoningSummary)
      ? reasoningSummary
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((part: any) => String(part?.text ?? ''))
        .join('')
        .slice(0, 200)
      : ''

    const shouldFlushDirectReasoning =
      this.state.pendingReasoningLogText.length >= 24
      || /[\n。！？.!?：:，,；;]$/.test(this.state.pendingReasoningLogText)
      || (!directReasoningContent && this.state.pendingReasoningLogText.length > 0)

    if (shouldFlushDirectReasoning) {
      console.debug('[StreamEventAdapter] reasoning chunk', {
        threadId,
        source: 'additional_kwargs.reasoning_content',
        accumulatedLength: this.state.pendingReasoningLogText.length,
        preview: this.state.pendingReasoningLogText.slice(0, 200),
      })
      this.state.pendingReasoningLogText = ''
    }

    if (sawReasoningInContent || summaryPreview) {
      console.debug('[StreamEventAdapter] reasoning chunk', {
        threadId,
        ...(sawReasoningInContent
          ? {
              source: 'content.reasoning',
              contentReasoningLength: reasoningDeltaFromContent.length,
              preview: reasoningDeltaFromContent.slice(0, 200),
            }
          : {}),
        ...(summaryPreview
          ? {
              source: sawReasoningInContent ? 'mixed' : 'additional_kwargs.reasoning.summary',
              summaryParts: Array.isArray(reasoningSummary) ? reasoningSummary.length : 0,
              summaryPreview,
            }
          : {}),
      })
    }
  }
}

function safeJsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return String(value)
  }
}
