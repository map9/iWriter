import type { AiProviderDriver, AgentChunk, HttpRequest, LMMessage, LMTool } from './types'

/**
 * OpenAI-compatible provider driver.
 *
 * Works with: OpenAI, Azure OpenAI, DeepSeek, Ollama, LM Studio, and any
 * endpoint that speaks the OpenAI chat completions API.
 *
 * Azure detection: if baseUrl contains ".azure.com", the auth header switches
 * from "Authorization: Bearer" to "api-key" (Azure's required format).
 */
export class OpenAICompatProvider implements AiProviderDriver {
  readonly id = 'openai-compat'

  buildRequest(
    messages: LMMessage[],
    tools: LMTool[],
    modelId: string,
    apiKey: string,
    baseUrl?: string
  ): HttpRequest {
    const base = baseUrl?.replace(/\/$/, '') ?? 'https://api.openai.com/v1'
    const url = `${base}/chat/completions`

    const isAzure = base.includes('.azure.com')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(isAzure
        ? { 'api-key': apiKey }
        : { Authorization: `Bearer ${apiKey}` }),
    }

    console.log('OpenAICompatProvider.buildRequest', { url, headers, messages, modelId, tools })

    const body: Record<string, unknown> = {
      model: modelId,
      messages: messages.map(this.serializeMessage),
      stream: true,
      stream_options: { include_usage: true },
    }

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
      body.tool_choice = 'auto'
    }

    return { url, method: 'POST', headers, body: JSON.stringify(body) }
  }

  parseRawLine(line: string): AgentChunk | null {
    if (!line.startsWith('data: ')) return null
    const data = line.slice(6).trim()
    if (data === '[DONE]') return null

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(data)
    } catch {
      return null
    }

    // Usage information (sent in the final chunk by some providers)
    const usage = parsed.usage as Record<string, number> | undefined
    if (usage?.prompt_tokens !== undefined) {
      return {
        type: 'usage',
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens ?? 0,
      }
    }

    const choices = parsed.choices as Array<Record<string, unknown>> | undefined
    if (!choices?.length) return null

    const choice = choices[0] as Record<string, unknown>
    const finishReason = choice.finish_reason as string | null
    const delta = choice.delta as Record<string, unknown> | undefined

    // Terminal chunk — emit done
    if (finishReason && finishReason !== 'null') {
      return { type: 'done', stopReason: finishReason }
    }

    if (!delta) return null

    // Text delta
    if (typeof delta.content === 'string' && delta.content) {
      return { type: 'text', delta: delta.content }
    }

    // Tool call deltas
    const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined
    if (toolCalls?.length) {
      const tc = toolCalls[0] as Record<string, unknown>
      const index = (tc.index as number) ?? 0
      const fn = tc.function as Record<string, string> | undefined

      // First chunk for this tool call index carries id and name.
      // Some providers (e.g. BigModel/GLM) also include the full arguments here
      // rather than streaming them separately — capture them to avoid data loss.
      if (typeof tc.id === 'string') {
        return {
          type: 'tool_call_start',
          id: tc.id,
          name: fn?.name ?? '',
          index,
          initialArguments: fn?.arguments || undefined,
        }
      }

      // Subsequent chunks carry argument fragments
      if (fn?.arguments !== undefined) {
        return {
          type: 'tool_call_delta',
          index,
          argumentsDelta: fn.arguments,
        }
      }
    }

    return null
  }

  private serializeMessage(msg: LMMessage): Record<string, unknown> {
    const out: Record<string, unknown> = { role: msg.role, content: msg.content }

    if (msg.toolCallId) {
      out.tool_call_id = msg.toolCallId
    }

    if (msg.toolCalls?.length) {
      out.tool_calls = msg.toolCalls.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }))
      // When the assistant message has tool calls, content may be empty
      if (!out.content) out.content = null
    }

    return out
  }
}
