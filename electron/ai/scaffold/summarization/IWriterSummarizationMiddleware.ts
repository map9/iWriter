import { ContextOverflowError } from '@langchain/core/errors'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import {
  createSummarizationMiddleware,
  resolveBackend,
} from 'deepagents'
import { Command, getConfig, getWriter, isCommand } from '@langchain/langgraph'
import { createMiddleware } from 'langchain'
import { z } from 'zod'

type NativeSummarizationOptions = Parameters<typeof createSummarizationMiddleware>[0]
type SummaryModel = NonNullable<NativeSummarizationOptions['model']>
type TokenCounter = (messages: BaseMessage[], tools?: unknown) => number | Promise<number>

export interface IWriterSummarizationMiddlewareOptions {
  model: SummaryModel
  fallbackModel?: SummaryModel
  backend: NativeSummarizationOptions['backend']
  tokenCounter: TokenCounter
  trigger: { type: 'tokens'; value: number }
  keep: { type: 'tokens'; value: number }
  summaryPrompt: string
  trimTokensToSummarize?: number
  historyPathPrefix?: string
}

interface SummarizationState {
  messages?: BaseMessage[]
  _summarizationSessionId?: string
  _summarizationEvent?: {
    cutoffIndex: number
    summaryMessage: HumanMessage
    filePath: string | null
  }
  [key: string]: unknown
}

interface IWriterModelRequest {
  messages?: BaseMessage[]
  state: SummarizationState
  model: SummaryModel
  systemMessage?: BaseMessage
  tools?: unknown
  runtime?: {
    configurable?: Record<string, unknown>
    writer?: (chunk: unknown) => void
  }
  [key: string]: unknown
}

interface SummarizationStreamEvent {
  writer?: (chunk: unknown) => void
  base: {
    eventId: string
    threadId?: string
    turnId?: string
    anchorMessageId?: string
    anchorToolCallId?: string
    startedAt: number
  }
}

const SummarizationStateSchema = z.object({
  _summarizationSessionId: z.string().optional(),
  _summarizationEvent: z.object({
    cutoffIndex: z.number(),
    summaryMessage: z.instanceof(HumanMessage),
    filePath: z.string().nullable(),
  }).optional(),
})

function isSummaryMessage(message: BaseMessage): boolean {
  return HumanMessage.isInstance(message)
    && message.additional_kwargs?.lc_source === 'summarization'
}

function getEffectiveMessages(messages: BaseMessage[], state: SummarizationState): BaseMessage[] {
  const event = state._summarizationEvent
  if (!event) return messages
  return [event.summaryMessage, ...messages.slice(event.cutoffIndex)]
}

function findSafeCutoffPoint(messages: BaseMessage[], cutoffIndex: number): number {
  if (cutoffIndex >= messages.length || !ToolMessage.isInstance(messages[cutoffIndex])) {
    return cutoffIndex
  }

  let forwardIndex = cutoffIndex
  const toolCallIds = new Set<string>()
  while (forwardIndex < messages.length && ToolMessage.isInstance(messages[forwardIndex])) {
    const toolMessage = messages[forwardIndex] as ToolMessage
    if (toolMessage.tool_call_id) toolCallIds.add(toolMessage.tool_call_id)
    forwardIndex += 1
  }

  for (let index = cutoffIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!AIMessage.isInstance(message) || !message.tool_calls) continue
    const aiToolCallIds = new Set(
      message.tool_calls.map(call => call.id).filter((id): id is string => typeof id === 'string'),
    )
    if ([...toolCallIds].some(id => aiToolCallIds.has(id))) return index
  }

  return forwardIndex
}

async function determineCutoffIndex(
  messages: BaseMessage[],
  keepTokens: number,
  tokenCounter: TokenCounter,
): Promise<number> {
  let tokensKept = 0
  let rawCutoff = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const messageTokens = await tokenCounter([messages[index]!])
    if (tokensKept + messageTokens > keepTokens) {
      rawCutoff = index + 1
      break
    }
    tokensKept += messageTokens
  }
  return findSafeCutoffPoint(messages, rawCutoff)
}

function isContextOverflow(error: unknown): boolean {
  let current = error
  while (current) {
    if (ContextOverflowError.isInstance(current)) return true
    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : undefined
  }
  return false
}

function isCancellationError(error: unknown, config?: unknown): boolean {
  if (
    typeof config === 'object'
    && config !== null
    && 'signal' in config
    && (config as { signal?: AbortSignal }).signal?.aborted
  ) {
    return true
  }

  let current = error
  while (current && typeof current === 'object') {
    const candidate = current as { name?: unknown; code?: unknown; cause?: unknown }
    if (candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR') return true
    current = candidate.cause
  }
  return false
}

function hasUsableSummaryText(response: unknown): response is AIMessage {
  if (!AIMessage.isInstance(response) || response.tool_calls?.length) return false
  if (typeof response.content === 'string') return response.content.trim().length > 0
  if (!Array.isArray(response.content)) return false
  return response.content.some(block => (
    typeof block === 'object'
    && block !== null
    && 'type' in block
    && block.type === 'text'
    && 'text' in block
    && typeof block.text === 'string'
    && block.text.trim().length > 0
  ))
}

function buildFallbackSummaryModel(primary: SummaryModel, fallback?: SummaryModel): SummaryModel {
  // DeepAgents only relies on the public language-model `profile` and `invoke`
  // contract for its summarization side request. Keep fallback local to that
  // side request so the main agent's model retry policy remains independent.
  return {
    profile: (primary as BaseChatModel).profile,
    async invoke(input: unknown, config?: unknown) {
      let primaryFailure: unknown
      try {
        const response = await (primary as BaseChatModel).invoke(input as never, config as never)
        if (hasUsableSummaryText(response)) return response
        primaryFailure = new Error('Primary summary model returned no usable visible text.')
      } catch (error) {
        if (isCancellationError(error, config)) throw error
        primaryFailure = error
      }

      if (!fallback) {
        throw primaryFailure ?? new Error('Primary summary model failed without an error value.')
      }
      const fallbackResponse = await (fallback as BaseChatModel).invoke(input as never, config as never)
      if (!hasUsableSummaryText(fallbackResponse)) {
        throw new Error('Fallback summary model returned no usable visible text.')
      }
      return fallbackResponse
    },
  } as unknown as SummaryModel
}

function createStreamEvent(request: IWriterModelRequest, anchor?: BaseMessage): SummarizationStreamEvent {
  let config: ReturnType<typeof getConfig> | undefined
  try {
    config = getConfig()
  } catch {
    config = undefined
  }
  const metadata = config?.metadata ?? {}
  const configurable = request.runtime?.configurable ?? config?.configurable ?? {}
  const anchorMessage = anchor ?? request.messages?.[request.messages.length - 1]
  const startedAt = Date.now()
  let writer = request.runtime?.writer as ((chunk: unknown) => void) | undefined
  if (!writer) {
    try {
      writer = getWriter(config)
    } catch {
      writer = undefined
    }
  }

  return {
    writer,
    base: {
      eventId: `summarization-${startedAt}-${Math.random().toString(36).slice(2, 10)}`,
      threadId: typeof configurable.thread_id === 'string'
        ? configurable.thread_id
        : typeof metadata.thread_id === 'string' ? metadata.thread_id : undefined,
      turnId: typeof metadata.turn_id === 'string' ? metadata.turn_id : undefined,
      anchorMessageId: typeof anchorMessage?.id === 'string' ? anchorMessage.id : undefined,
      anchorToolCallId: ToolMessage.isInstance(anchorMessage) && anchorMessage.tool_call_id
        ? anchorMessage.tool_call_id
        : undefined,
      startedAt,
    },
  }
}

function emitStreamEvent(
  event: SummarizationStreamEvent,
  phase: 'started' | 'completed' | 'failed',
  details: Record<string, unknown> = {},
): void {
  try {
    event.writer?.({
      name: 'deepagents_summarization',
      payload: {
        ...event.base,
        ...details,
        phase,
        timestamp: Date.now(),
      },
    })
  } catch {
    // UI progress is best-effort and must never fail a model call.
  }
}

function extractSummaryText(summaryMessage: HumanMessage): string {
  const content = summaryMessage.text.trim()
  const taggedSummary = content.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/i)
  if (taggedSummary?.[1]) return taggedSummary[1].trim()
  return content.replace(/^Here is a summary of the conversation to date:\s*/i, '').trim()
}

async function appendSummaryToArchive(
  backend: IWriterSummarizationMiddlewareOptions['backend'],
  state: SummarizationState,
  filePath: string | null,
  eventId: string,
  summary: string,
  compressedMessageCount: number,
): Promise<void> {
  if (!filePath) return
  const resolvedBackend = await resolveBackend(backend, { state })
  const section = `### iWriter compression summary (${eventId})\n\n`
    + `- Compressed messages: ${compressedMessageCount}\n\n${summary}\n\n`
  try {
    if (resolvedBackend.downloadFiles && resolvedBackend.uploadFiles) {
      const [download] = await resolvedBackend.downloadFiles([filePath])
      if (download?.content && !download.error) {
        const sectionBytes = new TextEncoder().encode(section)
        const combined = new Uint8Array(download.content.byteLength + sectionBytes.byteLength)
        combined.set(download.content, 0)
        combined.set(sectionBytes, download.content.byteLength)
        const [upload] = await resolvedBackend.uploadFiles([[filePath, combined]])
        if (!upload?.error) return
      }
    }

    const readResult = await resolvedBackend.read(filePath, 0, Number.MAX_SAFE_INTEGER)
    if (readResult.error || readResult.content === undefined) return
    const existing = typeof readResult.content === 'string'
      ? readResult.content
      : new TextDecoder().decode(readResult.content)
    await resolvedBackend.edit(filePath, existing, existing + section)
  } catch (error) {
    console.warn('[IWriterSummarizationMiddleware] Could not append summary archive:', error)
  }
}

/**
 * Project-owned decorator around DeepAgents' public summarization middleware.
 * DeepAgents retains ownership of summary generation, safe model validation,
 * backend history offload, and its state contract. iWriter adds exact token
 * gating, fallback, archive metadata, progress events, and post-response compact.
 */
export function createIWriterSummarizationMiddleware(options: IWriterSummarizationMiddlewareOptions) {
  const summaryModel = buildFallbackSummaryModel(options.model, options.fallbackModel)

  async function totalTokens(request: IWriterModelRequest, messages: BaseMessage[]): Promise<number> {
    const withSystem = SystemMessage.isInstance(request.systemMessage)
      ? [request.systemMessage, ...messages]
      : messages
    return options.tokenCounter(withSystem, request.tools ?? [])
  }

  async function summarize(
    request: IWriterModelRequest,
    handler: (request: IWriterModelRequest) => Promise<AIMessage>,
    effectiveMessages: BaseMessage[],
    cutoffIndex: number,
    anchor?: BaseMessage,
  ): Promise<AIMessage | Command> {
    const preservedCount = effectiveMessages.length - cutoffIndex
    const nativeMiddleware = createSummarizationMiddleware({
      model: summaryModel,
      backend: options.backend,
      trigger: { type: 'messages', value: 1 },
      keep: { type: 'messages', value: preservedCount },
      summaryPrompt: options.summaryPrompt,
      trimTokensToSummarize: options.trimTokensToSummarize,
      historyPathPrefix: options.historyPathPrefix,
    })
    const nativeWrapModelCall = nativeMiddleware.wrapModelCall
    if (!nativeWrapModelCall) return handler(request)

    const streamEvent = createStreamEvent(request, anchor)
    emitStreamEvent(streamEvent, 'started')
    try {
      const nativeState = {
        ...request.state,
        messages: effectiveMessages,
        _summarizationEvent: undefined,
      }
      const activeModel = request.model
      const result = await nativeWrapModelCall(
        {
          ...request,
          model: summaryModel,
          messages: effectiveMessages,
          state: nativeState,
        } as never,
        (nativeRequest: unknown) => handler({
          ...(nativeRequest as IWriterModelRequest),
          model: activeModel,
        }) as never,
      )
      if (!isCommand(result)) {
        emitStreamEvent(streamEvent, 'failed', {
          error: 'DeepAgents completed the model call but did not persist a summary.',
        })
        return result
      }

      const update = result.update as SummarizationState
      const nativeEvent = update._summarizationEvent
      if (!nativeEvent) return result
      const previousCutoff = (request.state as SummarizationState)._summarizationEvent?.cutoffIndex
      const stateCutoffIndex = previousCutoff == null
        ? nativeEvent.cutoffIndex
        : previousCutoff + nativeEvent.cutoffIndex - 1
      const summary = extractSummaryText(nativeEvent.summaryMessage)
      const compressedMessages = effectiveMessages
        .slice(0, nativeEvent.cutoffIndex)
        .filter(message => !isSummaryMessage(message))
      await appendSummaryToArchive(
        options.backend,
        request.state as SummarizationState,
        nativeEvent.filePath,
        streamEvent.base.eventId,
        summary,
        compressedMessages.length,
      )
      emitStreamEvent(streamEvent, 'completed', {
        summary,
        filePath: nativeEvent.filePath,
        compressedMessageCount: compressedMessages.length,
      })
      return new Command({
        update: {
          ...update,
          _summarizationEvent: {
            ...nativeEvent,
            cutoffIndex: stateCutoffIndex,
          },
        },
      })
    } catch (error) {
      emitStreamEvent(streamEvent, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  return createMiddleware({
    name: 'SummarizationMiddleware',
    stateSchema: SummarizationStateSchema,
    // Explicit any keeps this decorator compatible with LangChain's evolving
    // middleware request generics while its public runtime values stay checked.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async wrapModelCall(request: any, handler: any) {
      const typedRequest = request as IWriterModelRequest
      const typedHandler = handler as (nextRequest: IWriterModelRequest) => Promise<AIMessage>
      const state = typedRequest.state
      const effectiveMessages = getEffectiveMessages(typedRequest.messages ?? [], state)
      if (!effectiveMessages.length) return typedHandler(typedRequest)

      const tokens = await totalTokens(typedRequest, effectiveMessages)
      if (tokens >= options.trigger.value) {
        const cutoffIndex = await determineCutoffIndex(
          effectiveMessages,
          options.keep.value,
          options.tokenCounter,
        )
        if (cutoffIndex > 0) {
          return summarize(typedRequest, typedHandler, effectiveMessages, cutoffIndex)
        }
      }

      let response: AIMessage
      try {
        response = await typedHandler({ ...typedRequest, messages: effectiveMessages })
      } catch (error) {
        if (!isContextOverflow(error)) throw error
        const cutoffIndex = await determineCutoffIndex(
          effectiveMessages,
          options.keep.value,
          options.tokenCounter,
        )
        if (cutoffIndex <= 0) throw error
        return summarize(typedRequest, typedHandler, effectiveMessages, cutoffIndex)
      }

      if (response.tool_calls?.length) return response
      const projectedMessages = [...effectiveMessages, response]
      const projectedTokens = await totalTokens(typedRequest, projectedMessages)
      if (projectedTokens < options.trigger.value) return response
      const cutoffIndex = await determineCutoffIndex(
        projectedMessages,
        options.keep.value,
        options.tokenCounter,
      )
      if (cutoffIndex <= 0) return response

      // The real response has already been produced. DeepAgents still validates
      // the compacted request, but must not invoke the main model a second time.
      try {
        return await summarize(
          typedRequest,
          async () => response,
          projectedMessages,
          cutoffIndex,
          response,
        )
      } catch (error) {
        // The main answer has already completed (and may already be visible in
        // the renderer). A best-effort post-response compression failure must
        // not turn that successful turn into a run error.
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[IWriterSummarizationMiddleware] Post-response compression failed: ${message}`)
        return response
      }
    },
  })
}
