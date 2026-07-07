import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseChatModelCallOptions, BaseChatModelParams, BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { ModelProfile } from '@langchain/core/language_models/profile'
import type { BaseMessage, OpenAIToolCall } from '@langchain/core/messages'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import type { ChatGeneration, ChatResult } from '@langchain/core/outputs'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { convertLangChainToolCallToOpenAI, parseToolCall } from '@langchain/core/output_parsers/openai_tools'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai'
import { getDefaultDeepSeekProfile } from '../../../src/ai/model/model-profiles'
import type { AiThinkingLevel } from '../../../src/types/ai'
import { normalizeThinkingLevel } from '../../../src/types/ai'

interface DeepSeekTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

interface DeepSeekToolChoice {
  type: 'function'
  function: {
    name: string
  }
}

interface ChatDeepSeekCallOptions extends BaseChatModelCallOptions {
  tools?: DeepSeekTool[]
  promptIndex?: number
}

interface ChatDeepSeekFields extends BaseChatModelParams {
  apiKey?: string
  model: string
  baseUrl?: string
  streaming?: boolean
  maxTokens?: number
  temperature?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  profile?: ModelProfile
  thinkingLevel?: AiThinkingLevel
  budgetTokens?: number
  disableThinking?: boolean
}

interface DeepSeekUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: {
    cached_tokens?: number
  }
  completion_tokens_details?: {
    reasoning_tokens?: number
  }
}

interface DeepSeekToolCallDelta {
  index?: number
  id?: string
  function?: {
    name?: string
    arguments?: string
  }
}

interface DeepSeekChoiceDelta {
  role?: string
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: DeepSeekToolCallDelta[]
}

interface DeepSeekChatCompletionChunk {
  id?: string
  model?: string
  error?: DeepSeekErrorPayload
  usage?: DeepSeekUsage
  choices?: Array<{
    index?: number
    finish_reason?: string | null
    delta?: DeepSeekChoiceDelta
  }>
}

interface DeepSeekChatCompletionResponse {
  id?: string
  model?: string
  usage?: DeepSeekUsage
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      role?: string
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
  }>
}

interface ToolCallAccumulator {
  id?: string
  name?: string
  arguments: string
}

interface DeepSeekErrorPayload {
  message?: string
  type?: string
  param?: string | null
  code?: string | number | null
}

interface DeepSeekStreamState {
  receivedFirstChunk: boolean
  receivedDoneMarker: boolean
  chunkCount: number
  totalBytes: number
}

type DeepSeekAugmentedError = Error & {
  provider?: 'deepseek'
  phase?: 'fetch' | 'read' | 'parse' | 'stream'
  retryable?: boolean
  streamState?: DeepSeekStreamState
  rawMessage?: string
}

interface DeepSeekMessageParam {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  reasoning_content?: string
  tool_calls?: Array<{
    id?: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

interface DeepSeekContentPart {
  type?: string
  text?: unknown
  reasoning?: unknown
  thinking?: unknown
}

interface LangChainMessageWithToolCalls extends BaseMessage {
  tool_calls?: unknown[]
}

function isDeepSeekTool(value: unknown): value is DeepSeekTool {
  if (!value || typeof value !== 'object') return false
  const candidate = value as DeepSeekTool
  return candidate.type === 'function' && typeof candidate.function?.name === 'string'
}

function isDeepSeekToolChoice(value: unknown): value is DeepSeekToolChoice {
  if (!value || typeof value !== 'object') return false
  const candidate = value as DeepSeekToolChoice
  return candidate.type === 'function' && typeof candidate.function?.name === 'string'
}

type NormalizedDeepSeekToolChoice = 'none' | 'auto' | 'required' | DeepSeekToolChoice

function normalizeDeepSeekToolChoice(value: unknown): NormalizedDeepSeekToolChoice {
  if (value === 'none' || value === 'auto' || value === 'required') return value
  if (value === 'any') return 'required'
  if (isDeepSeekToolChoice(value)) return value
  return 'auto'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseMaybeJson(text: string): unknown {
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function parseErrorBody(text: string): { json?: unknown, message?: string } {
  const json = parseMaybeJson(text)
  return json !== undefined ? { json } : { message: text || undefined }
}

function isAbortLikeError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
    || err instanceof Error && err.name === 'AbortError'
}

function isTimeoutLikeError(err: unknown): boolean {
  const errorText = err instanceof Error
    ? `${err.name}: ${err.message} ${String(err.cause ?? '')}`
    : String(err)
  return /timed? ?out|etimeout|etimedout/i.test(errorText)
}

function isTerminatedReadTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'TypeError'
    && err.message === 'terminated'
    && /etimedout|timed? ?out/i.test(String(err.cause ?? ''))
}

function augmentDeepSeekError<T extends Error>(
  error: T,
  metadata: Omit<DeepSeekAugmentedError, keyof Error>,
): T & DeepSeekAugmentedError {
  const augmented = error as T & DeepSeekAugmentedError
  augmented.provider = 'deepseek'
  if (metadata.phase) augmented.phase = metadata.phase
  if (metadata.retryable !== undefined) augmented.retryable = metadata.retryable
  if (metadata.streamState) augmented.streamState = metadata.streamState
  if (metadata.rawMessage) augmented.rawMessage = metadata.rawMessage
  return augmented
}

function isRetryableStatus(status?: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 503 || (status != null && status >= 500)
}

function createDeepSeekHttpError(response: Response, bodyText: string, phase: DeepSeekAugmentedError['phase']): Error {
  const parsed = parseErrorBody(bodyText)
  const errorResponse = isRecord(parsed.json) ? parsed.json : undefined
  const error = APIError.generate(response.status, errorResponse, parsed.message ?? response.statusText, response.headers)
  const augmented = augmentDeepSeekError(error, {
    phase,
    retryable: isRetryableStatus(response.status),
    rawMessage: bodyText,
  })
  if (response.status === 402) {
    if (augmented.code == null) {
      Object.defineProperty(augmented, 'code', {
        value: 'insufficient_balance',
        configurable: true,
      })
    }
    augmented.retryable = false
  }
  return augmented
}

function createDeepSeekPayloadError(payload: DeepSeekErrorPayload, headers: Headers, phase: DeepSeekAugmentedError['phase']): Error {
  const message = payload.message ?? 'DeepSeek API stream error.'
  return augmentDeepSeekError(new APIError(undefined, payload, message, headers), {
    phase,
    retryable: false,
  })
}

function createDeepSeekConnectionError(
  err: unknown,
  phase: DeepSeekAugmentedError['phase'],
  signal?: AbortSignal,
  streamState?: DeepSeekStreamState,
): Error {
  if (signal?.aborted || isAbortLikeError(err)) {
    return augmentDeepSeekError(new APIUserAbortError(), { phase, retryable: false, streamState })
  }

  if (isTerminatedReadTimeout(err) || isTimeoutLikeError(err)) {
    const error = new APIConnectionTimeoutError({
      message: phase === 'read'
        ? 'DeepSeek stream timed out before completion.'
        : 'DeepSeek request timed out.',
    })
    if (err instanceof Error) error.cause = err
    return augmentDeepSeekError(error, { phase, retryable: true, streamState })
  }

  const error = new APIConnectionError({
    message: phase === 'read' ? 'DeepSeek stream connection error.' : 'DeepSeek connection error.',
    cause: err instanceof Error ? err : new Error(String(err)),
  })
  return augmentDeepSeekError(error, { phase, retryable: true, streamState })
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is DeepSeekContentPart => !!part && typeof part === 'object' && (part as DeepSeekContentPart).type === 'text')
    .map(part => String(part.text ?? ''))
    .join('')
}

function extractReasoningContent(content: unknown, additionalKwargs?: Record<string, unknown>): string {
  if (Array.isArray(content)) {
    const fromContent = content
      .filter((part): part is DeepSeekContentPart => {
        if (!part || typeof part !== 'object') return false
        const candidate = part as DeepSeekContentPart
        return candidate.type === 'reasoning' || candidate.type === 'thinking'
      })
      .map(part => String(part.reasoning ?? part.thinking ?? part.text ?? ''))
      .join('')
    if (fromContent) return fromContent
  }

  const directReasoning = additionalKwargs?.reasoning_content
  if (typeof directReasoning === 'string') return directReasoning

  return ''
}

function convertUsageToMetadata(usage?: DeepSeekUsage) {
  if (!usage) return undefined

  const inputTokenDetails = {
    ...(usage.prompt_tokens_details?.cached_tokens != null
      ? { cache_read: usage.prompt_tokens_details.cached_tokens }
      : {}),
  }
  const outputTokenDetails = {
    ...(usage.completion_tokens_details?.reasoning_tokens != null
      ? { reasoning: usage.completion_tokens_details.reasoning_tokens }
      : {}),
  }

  return {
    input_tokens: usage.prompt_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
    ...(Object.keys(inputTokenDetails).length ? { input_token_details: inputTokenDetails } : {}),
    ...(Object.keys(outputTokenDetails).length ? { output_token_details: outputTokenDetails } : {}),
  }
}

function toOpenAIToolCalls(value: unknown): OpenAIToolCall[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((toolCall): OpenAIToolCall[] => {
    if (!toolCall || typeof toolCall !== 'object') return []
    const candidate = toolCall as {
      id?: unknown
      type?: unknown
      function?: {
        name?: unknown
        arguments?: unknown
      }
    }
    if (typeof candidate.id !== 'string') return []
    if (typeof candidate.function?.name !== 'string') return []

    return [{
      id: candidate.id,
      type: 'function',
      function: {
        name: candidate.function.name,
        arguments: typeof candidate.function.arguments === 'string' ? candidate.function.arguments : '',
      },
    }]
  })
}

export class ChatDeepSeek extends BaseChatModel<ChatDeepSeekCallOptions> {
  apiKey: string
  model: string
  baseUrl: string
  streaming: boolean
  maxTokens: number
  temperature?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  profileOverride?: ModelProfile
  thinkingLevel: AiThinkingLevel
  budgetTokens?: number
  disableThinking: boolean

  constructor(fields: ChatDeepSeekFields) {
    super(fields)
    this.apiKey = fields.apiKey || ''
    this.model = fields.model
    this.baseUrl = (fields.baseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, '')
    this.streaming = fields.streaming ?? true
    this.maxTokens = fields.maxTokens ?? -1
    this.temperature = fields.temperature
    this.topP = fields.topP
    this.frequencyPenalty = fields.frequencyPenalty
    this.presencePenalty = fields.presencePenalty
    this.profileOverride = fields.profile
    this.thinkingLevel = normalizeThinkingLevel(fields.thinkingLevel)
    this.budgetTokens = fields.budgetTokens
    this.disableThinking = fields.disableThinking === true
  }

  get profile(): ModelProfile {
    return {
      ...(getDefaultDeepSeekProfile(this.model) ?? {}),
      ...(this.profileOverride ?? {}),
    }
  }

  _llmType(): string {
    return 'deepseek'
  }

  _combineLLMOutput(...llmOutputs: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
    return llmOutputs.filter(Boolean).reduce<Record<string, unknown>>((acc, output) => ({
      ...acc,
      ...output,
    }), {})
  }

  invocationParams(options?: this['ParsedCallOptions']): Record<string, unknown> {
    return {
      model: this.model,
      stream: this.streaming,
      ...(options?.tools ? { tools: options.tools } : {}),
    }
  }

  bindTools(tools: BindToolsInput[], kwargs?: Partial<ChatDeepSeekCallOptions>): RunnableBinding {
    const formattedTools = tools.map(tool => {
      if (isDeepSeekTool(tool)) return tool
      const candidate = tool as { name?: string; description?: string; schema?: unknown }
      return {
        type: 'function',
        function: {
          name: candidate.name ?? 'tool',
          description: candidate.description,
          parameters: toJsonSchema(candidate.schema as Parameters<typeof toJsonSchema>[0]),
        },
      } satisfies DeepSeekTool
    })

    return this.withConfig({
      tools: formattedTools,
      ...kwargs,
      tool_choice: normalizeDeepSeekToolChoice(kwargs?.tool_choice ?? 'auto'),
    })
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
  ): Promise<ChatResult> {
    const body = this.buildRequestBody(messages, options, false)
    const response = await this.fetchJson(body, options.signal)
    const choice = response.choices?.[0]
    const message = choice?.message
    if (!message) {
      throw new Error('DeepSeek returned no assistant message.')
    }

    const text = message.content ?? ''
    const reasoning = message.reasoning_content ?? ''

    const toolCalls = (message.tool_calls ?? []).flatMap(tc => {
      try {
        return [parseToolCall(tc as Record<string, unknown>, { returnId: true })]
      } catch {
        return []
      }
    })

    const usageMetadata = convertUsageToMetadata(response.usage)
    const rawToolCalls = toOpenAIToolCalls(message.tool_calls)
    const aiMessage = new AIMessage({
      content: text,
      tool_calls: toolCalls,
      additional_kwargs: {
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(rawToolCalls.length ? { tool_calls: rawToolCalls } : {}),
      },
      response_metadata: {
        model_provider: 'deepseek',
        model_name: response.model ?? this.model,
        ...(response.usage ? { usage: response.usage } : {}),
      },
      usage_metadata: usageMetadata,
      id: response.id,
    })

    const generation: ChatGeneration = {
      text,
      message: aiMessage,
      generationInfo: {
        ...(choice?.finish_reason ? { finish_reason: choice.finish_reason } : {}),
      },
    }

    return {
      generations: [generation],
      llmOutput: response.usage
        ? {
            tokenUsage: {
              promptTokens: response.usage.prompt_tokens ?? 0,
              completionTokens: response.usage.completion_tokens ?? 0,
              totalTokens: response.usage.total_tokens ?? 0,
            },
          }
        : {},
    }
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const body = this.buildRequestBody(messages, options, true)
    let receivedFirstChunk = false
    let receivedDoneMarker = false
    let chunkCount = 0
    let totalBytes = 0
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options.signal,
      })
    } catch (err) {
      throw createDeepSeekConnectionError(err, 'fetch', options.signal)
    }

    if (!response.ok) {
      let detail = response.statusText
      try {
        detail = await response.text()
      } catch { /* ignore */ }
      throw createDeepSeekHttpError(response, detail, 'fetch')
    }

    if (!response.body) {
      throw new Error('DeepSeek API returned an empty response body.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastResponseId: string | undefined
    let lastResponseModel: string | undefined
    let emittedResponseMetadata = false
    const toolCallAccumulators = new Map<number, ToolCallAccumulator>()

    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>
      try {
        readResult = await reader.read()
      } catch (err) {
        throw createDeepSeekConnectionError(err, 'read', options.signal, {
          receivedFirstChunk,
          receivedDoneMarker,
          chunkCount,
          totalBytes,
        })
      }
      const { value, done } = readResult
      if (done) {
        // Flush the TextDecoder's internal buffer (handles multi-byte sequences split across chunks).
        const flushed = decoder.decode()
        if (flushed) buffer += flushed
        // Process any final SSE line that arrived without a trailing newline (e.g. `data: [DONE]`).
        for (const line of buffer.split('\n')) {
          if (line.trim() === 'data: [DONE]') {
            receivedDoneMarker = true
            break
          }
        }
        break
      }

      chunkCount += 1
      totalBytes += value?.byteLength ?? 0
      if (!receivedFirstChunk) {
        receivedFirstChunk = true
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const payload = trimmed.slice(6).trim()
        if (!payload) continue
        if (payload === '[DONE]') {
          receivedDoneMarker = true
          if (!emittedResponseMetadata) {
            const metadataChunk = new ChatGenerationChunk({
              message: new AIMessageChunk({
                content: '',
                response_metadata: {
                  model_provider: 'deepseek',
                  model_name: lastResponseModel ?? this.model,
                },
                id: lastResponseId,
              }),
              text: '',
            })
            yield metadataChunk
            await runManager?.handleLLMNewToken?.('', undefined, undefined, undefined, undefined, { chunk: metadataChunk })
          }
          continue
        }

        let parsed: DeepSeekChatCompletionChunk
        try {
          parsed = JSON.parse(payload)
        } catch (err) {
          // Skip lines that are clearly not JSON objects/arrays (proxy heartbeats such as
          // `data: ping` or `data: : keep-alive` that slip past the [DONE] guard).
          if (!payload.startsWith('{') && !payload.startsWith('[')) continue
          throw augmentDeepSeekError(new APIConnectionError({
            message: 'DeepSeek stream returned invalid JSON.',
            cause: err instanceof Error ? err : new Error(String(err)),
          }), {
            phase: 'parse',
            retryable: true,
            rawMessage: payload,
            streamState: {
              receivedFirstChunk,
              receivedDoneMarker,
              chunkCount,
              totalBytes,
            },
          })
        }

        if (isRecord(parsed.error)) {
          throw createDeepSeekPayloadError(parsed.error, response.headers, 'stream')
        }

        lastResponseId = parsed.id ?? lastResponseId
        lastResponseModel = parsed.model ?? lastResponseModel

        const usageMetadata = convertUsageToMetadata(parsed.usage)
        if (usageMetadata) {
          emittedResponseMetadata = true
          const usageChunk = new ChatGenerationChunk({
            message: new AIMessageChunk({
              content: '',
              response_metadata: {
                model_provider: 'deepseek',
                model_name: parsed.model ?? this.model,
                ...(parsed.usage ? { usage: parsed.usage } : {}),
              },
              usage_metadata: usageMetadata,
              id: parsed.id,
            }),
            text: '',
          })
          yield usageChunk
          await runManager?.handleLLMNewToken?.('', undefined, undefined, undefined, undefined, { chunk: usageChunk })
        }

        const choice = parsed.choices?.[0]
        const delta = choice?.delta
        if (!delta) continue

        if (delta.reasoning_content) {
          const reasoningChunk = new ChatGenerationChunk({
            message: new AIMessageChunk({
              content: '',
              additional_kwargs: { reasoning_content: delta.reasoning_content },
              id: parsed.id,
            }),
            text: '',
            generationInfo: {
              completion: choice?.index ?? 0,
            },
          })
          yield reasoningChunk
          await runManager?.handleLLMNewToken?.('', { prompt: options.promptIndex ?? 0, completion: choice?.index ?? 0 }, undefined, undefined, undefined, { chunk: reasoningChunk })
        }

        if (delta.content) {
          const textChunk = new ChatGenerationChunk({
            message: new AIMessageChunk({
              content: delta.content,
              id: parsed.id,
            }),
            text: delta.content,
            generationInfo: {
              completion: choice?.index ?? 0,
              ...(choice?.finish_reason != null ? { finish_reason: choice.finish_reason } : {}),
            },
          })
          yield textChunk
          await runManager?.handleLLMNewToken?.(delta.content, { prompt: options.promptIndex ?? 0, completion: choice?.index ?? 0 }, undefined, undefined, undefined, { chunk: textChunk })
        }

        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
          const toolCallChunks = delta.tool_calls.map(rawToolCall => {
            const index = rawToolCall.index ?? 0
            const accumulator = toolCallAccumulators.get(index) ?? { arguments: '' }
            if (rawToolCall.id) accumulator.id = rawToolCall.id
            if (rawToolCall.function?.name) accumulator.name = rawToolCall.function.name
            if (rawToolCall.function?.arguments) {
              accumulator.arguments += rawToolCall.function.arguments
            }
            toolCallAccumulators.set(index, accumulator)

            return {
              id: accumulator.id ?? `tool_call_${index}`,
              index,
              name: accumulator.name ?? '',
              args: rawToolCall.function?.arguments ?? '',
              type: 'tool_call_chunk' as const,
            }
          })

          const toolChunk = new ChatGenerationChunk({
            message: new AIMessageChunk({
              content: '',
              tool_call_chunks: toolCallChunks,
              additional_kwargs: { tool_calls: delta.tool_calls as unknown as OpenAIToolCall[] },
              id: parsed.id,
            }),
            text: '',
            generationInfo: {
              completion: choice?.index ?? 0,
              ...(choice?.finish_reason != null ? { finish_reason: choice.finish_reason } : {}),
            },
          })
          yield toolChunk
          await runManager?.handleLLMNewToken?.('', { prompt: options.promptIndex ?? 0, completion: choice?.index ?? 0 }, undefined, undefined, undefined, { chunk: toolChunk })
        }
      }
    }

    // Premature EOF: server closed the stream without sending [DONE].
    // Any yielded content is incomplete — surface as a retryable connection error rather
    // than letting a truncated response be persisted as a successful completion.
    if (receivedFirstChunk && !receivedDoneMarker) {
      throw augmentDeepSeekError(new APIConnectionError({
        message: 'DeepSeek stream closed before [DONE] marker was received.',
      }), {
        phase: 'read',
        retryable: true,
        streamState: { receivedFirstChunk, receivedDoneMarker, chunkCount, totalBytes },
      })
    }
  }

  private async fetchJson(body: Record<string, unknown>, signal?: AbortSignal): Promise<DeepSeekChatCompletionResponse> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      throw createDeepSeekConnectionError(err, 'fetch', signal)
    }

    if (!response.ok) {
      let detail = response.statusText
      try {
        detail = await response.text()
      } catch { /* ignore */ }
      throw createDeepSeekHttpError(response, detail, 'fetch')
    }

    return response.json() as Promise<DeepSeekChatCompletionResponse>
  }

  private buildRequestBody(
    messages: BaseMessage[],
    options: ChatDeepSeekCallOptions,
    stream: boolean,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: this.convertMessages(messages),
      stream,
    }

    if (stream) {
      body.stream_options = { include_usage: true }
    }
    if (!this.disableThinking) {
      body.thinking = {
        type: 'enabled',
        ...(this.budgetTokens != null ? { budget_tokens: this.budgetTokens } : {}),
      }
      body.reasoning_effort = this.thinkingLevel === 'extra_high' ? 'max' : 'high'
    }
    if (Array.isArray(options.tools) && options.tools.length) {
      body.tools = options.tools
    }
    // Sampling params are unsupported in thinking mode (deepseek-reasoner / V4 thinking): the API
    // docs mark temperature/top_p/frequency_penalty/presence_penalty as having no effect there.
    // Only send them in non-thinking mode.
    if (this.disableThinking) {
      if (this.temperature != null) body.temperature = this.temperature
      if (this.topP != null) body.top_p = this.topP
      if (this.frequencyPenalty != null) body.frequency_penalty = this.frequencyPenalty
      if (this.presencePenalty != null) body.presence_penalty = this.presencePenalty
    }
    if (this.maxTokens >= 0) body.max_tokens = this.maxTokens

    return body
  }

  private convertMessages(messages: BaseMessage[]): DeepSeekMessageParam[] {
    // Collect tool_call_ids that have ToolMessage responses so orphaned tool_calls
    // (from interrupted sessions) can be stripped — DeepSeek 400s if any tool_call
    // is not followed by a matching tool message.
    const respondedToolCallIds = new Set<string>()
    for (const msg of messages) {
      if (msg instanceof ToolMessage || msg._getType() === 'tool') {
        const toolMsg = msg as ToolMessage
        if (toolMsg.tool_call_id) respondedToolCallIds.add(toolMsg.tool_call_id)
      }
    }

    return messages.flatMap((message): DeepSeekMessageParam[] => {
      if (message instanceof SystemMessage || message._getType() === 'system') {
        return [{
          role: 'system',
          content: extractTextContent(message.content),
        }]
      }

      if (message instanceof HumanMessage || message._getType() === 'human') {
        return [{
          role: 'user',
          content: extractTextContent(message.content),
        }]
      }

      if (message instanceof ToolMessage || message._getType() === 'tool') {
        const toolMessage = message as ToolMessage
        return [{
          role: 'tool',
          content: extractTextContent(toolMessage.content),
          tool_call_id: toolMessage.tool_call_id,
        }]
      }

      if (message._getType() === 'ai') {
        const text = extractTextContent(message.content)
        const reasoning = extractReasoningContent(message.content, message.additional_kwargs)
        const typedMessage = message as LangChainMessageWithToolCalls
        const hasInvalidToolCalls = Array.isArray((message as { invalid_tool_calls?: unknown[] }).invalid_tool_calls)
          && (message as { invalid_tool_calls?: unknown[] }).invalid_tool_calls!.length > 0
        const allRawToolCalls: OpenAIToolCall[] = Array.isArray(typedMessage.tool_calls) && typedMessage.tool_calls.length
          ? typedMessage.tool_calls.map(toolCall => {
              const converted = convertLangChainToolCallToOpenAI(toolCall as Parameters<typeof convertLangChainToolCallToOpenAI>[0])
              return {
                id: converted.id,
                type: 'function',
                function: converted.function,
              } satisfies OpenAIToolCall
            })
          : (!hasInvalidToolCalls ? toOpenAIToolCalls(message.additional_kwargs?.tool_calls) : [])
        // Strip tool_calls that have no matching ToolMessage — sending them causes DeepSeek 400.
        const rawToolCalls = allRawToolCalls.filter(
          tc => !tc.id || respondedToolCallIds.has(tc.id)
        )

        // DeepSeek V3.2/V4 thinking mode requires that an assistant message carrying tool_calls
        // ALSO carries reasoning_content when it is re-sent in a later request, otherwise the API
        // 400s ("reasoning_content must be passed back"). Always include the field for tool-call
        // messages (empty string if the CoT was lost in a round-trip); include it for plain
        // messages only when non-empty.
        const mustSendReasoning = rawToolCalls.length > 0
        return [{
          role: 'assistant',
          content: text,
          ...(rawToolCalls.length ? { tool_calls: rawToolCalls } : {}),
          ...(reasoning || mustSendReasoning ? { reasoning_content: reasoning } : {}),
        }]
      }

      return [{
        role: 'user',
        content: extractTextContent(message.content),
      }]
    })
  }
}

type RunnableBinding = ReturnType<BaseChatModel<ChatDeepSeekCallOptions>['withConfig']>
