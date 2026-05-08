import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelProfile } from '@langchain/core/language_models/profile'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { ChatGeneration, ChatResult } from '@langchain/core/outputs'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { convertLangChainToolCallToOpenAI, parseToolCall } from '@langchain/core/output_parsers/openai_tools'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { getDefaultDeepSeekProfile } from '../../../src/ai/model-profiles'
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

interface ChatDeepSeekFields {
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

export class ChatDeepSeek extends BaseChatModel {
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

  invocationParams(options?: Record<string, unknown>): Record<string, unknown> {
    return {
      model: this.model,
      stream: this.streaming,
      ...(options?.tools ? { tools: options.tools } : {}),
    }
  }

  bindTools(tools: Array<{ name: string; description?: string; schema: Record<string, unknown> } | DeepSeekTool>, kwargs?: Record<string, unknown>): RunnableBinding {
    const formattedTools = tools.map(tool => {
      if (isDeepSeekTool(tool)) return tool
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: toJsonSchema(tool.schema),
        },
      } satisfies DeepSeekTool
    })

    return this.withConfig({
      tools: formattedTools,
      tool_choice: 'auto',
      ...kwargs,
    })
  }

  async _generate(
    messages: BaseMessage[],
    options: Record<string, unknown> = {},
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
    const aiMessage = new AIMessage({
      content: text,
      tool_calls: toolCalls,
      additional_kwargs: {
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
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
    options: Record<string, unknown> = {},
    runManager?: {
      handleLLMNewToken?: (token: string, ...args: unknown[]) => Promise<void> | void
    },
  ): AsyncGenerator<ChatGenerationChunk> {
    const body = this.buildRequestBody(messages, options, true)
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    })

    if (!response.ok) {
      let detail = response.statusText
      try {
        detail = await response.text()
      } catch { /* ignore */ }
      throw new Error(`DeepSeek API error ${response.status}: ${detail}`)
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
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const payload = trimmed.slice(6).trim()
        if (!payload) continue
        if (payload === '[DONE]') {
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
        } catch {
          continue
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
              id: accumulator.id,
              index,
              name: accumulator.name,
              args: rawToolCall.function?.arguments,
              type: 'tool_call_chunk' as const,
            }
          })

          const toolChunk = new ChatGenerationChunk({
            message: new AIMessageChunk({
              content: '',
              tool_call_chunks: toolCallChunks,
              additional_kwargs: { tool_calls: delta.tool_calls },
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
  }

  private async fetchJson(body: Record<string, unknown>, signal?: AbortSignal): Promise<DeepSeekChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      let detail = response.statusText
      try {
        detail = await response.text()
      } catch { /* ignore */ }
      throw new Error(`DeepSeek API error ${response.status}: ${detail}`)
    }

    return response.json() as Promise<DeepSeekChatCompletionResponse>
  }

  private buildRequestBody(
    messages: BaseMessage[],
    options: Record<string, unknown>,
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
    body.thinking = { type: 'enabled' }
    body.reasoning_effort = this.thinkingLevel === 'extra_high' ? 'max' : 'high'
    if (Array.isArray(options.tools) && options.tools.length) {
      body.tools = options.tools
      body.tool_choice = options.tool_choice ?? 'auto'
    }
    if (this.temperature != null) body.temperature = this.temperature
    if (this.topP != null) body.top_p = this.topP
    if (this.frequencyPenalty != null) body.frequency_penalty = this.frequencyPenalty
    if (this.presencePenalty != null) body.presence_penalty = this.presencePenalty
    if (this.maxTokens >= 0) body.max_tokens = this.maxTokens

    return body
  }

  private convertMessages(messages: BaseMessage[]): DeepSeekMessageParam[] {
    return messages.flatMap(message => {
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
        const rawToolCalls = Array.isArray(typedMessage.tool_calls) && typedMessage.tool_calls.length
          ? typedMessage.tool_calls.map(convertLangChainToolCallToOpenAI)
          : (Array.isArray(message.additional_kwargs?.tool_calls) ? message.additional_kwargs.tool_calls : [])

        return [{
          role: 'assistant',
          content: text,
          ...(Array.isArray(rawToolCalls) && rawToolCalls.length ? { tool_calls: rawToolCalls } : {}),
          ...(reasoning ? { reasoning_content: reasoning } : {}),
        }]
      }

      return [{
        role: 'user',
        content: extractTextContent(message.content),
      }]
    })
  }
}

type RunnableBinding = ReturnType<BaseChatModel['bind']>
