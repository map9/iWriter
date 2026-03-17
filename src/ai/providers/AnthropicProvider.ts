import type { AiProviderDriver, AgentChunk, HttpRequest, LMMessage, LMTool } from './types'

/**
 * Anthropic Claude provider driver.
 *
 * API: https://api.anthropic.com/v1/messages  (SSE streaming)
 * Auth: x-api-key header
 *
 * Key differences from OpenAI format:
 *  - System message is a top-level field, not a message role
 *  - Tool definitions use `input_schema` instead of `parameters`
 *  - Tool calls arrive as content blocks with type 'tool_use'
 *  - Tool results are user messages with `role: 'user', content: [{ type: 'tool_result', ... }]`
 *  - SSE events: message_start / content_block_start / content_block_delta / content_block_stop / message_delta / message_stop
 */
export class AnthropicProvider implements AiProviderDriver {
  readonly id = 'anthropic'

  private static readonly DEFAULT_BASE = 'https://api.anthropic.com'
  private static readonly API_VERSION = '2023-06-01'

  buildRequest(
    messages: LMMessage[],
    tools: LMTool[],
    modelId: string,
    apiKey: string,
    baseUrl?: string
  ): HttpRequest {
    const base = baseUrl?.replace(/\/$/, '') ?? AnthropicProvider.DEFAULT_BASE
    const url = `${base}/v1/messages`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': AnthropicProvider.API_VERSION,
    }

    // Separate system message from the rest
    const systemMsg = messages.find(m => m.role === 'system')
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => this.serializeMessage(m))

    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: 4096,
      stream: true,
      messages: chatMessages,
    }

    if (systemMsg) {
      body.system = systemMsg.content
    }

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }))
    }

    return { url, method: 'POST', headers, body: JSON.stringify(body) }
  }

  parseRawLine(line: string): AgentChunk | null {
    // Anthropic uses two-line SSE: "event: TYPE\ndata: JSON"
    // We only process "data:" lines
    if (!line.startsWith('data: ')) return null
    const data = line.slice(6).trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(data)
    } catch {
      return null
    }

    const type = parsed.type as string

    // Text delta
    if (type === 'content_block_delta') {
      const delta = (parsed.delta ?? {}) as Record<string, unknown>
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        return { type: 'text', delta: delta.text }
      }
      // Tool input JSON delta
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        const index = (parsed.index as number) ?? 0
        return { type: 'tool_call_delta', index, argumentsDelta: delta.partial_json }
      }
    }

    // Tool use block start
    if (type === 'content_block_start') {
      const block = (parsed.content_block ?? {}) as Record<string, unknown>
      if (block.type === 'tool_use') {
        const index = (parsed.index as number) ?? 0
        return {
          type: 'tool_call_start',
          id: String(block.id ?? ''),
          name: String(block.name ?? ''),
          index,
        }
      }
    }

    // Per-tool-call end signal (fires for both text and tool_use blocks;
    // EditParser ignores indices that were never started)
    if (type === 'content_block_stop') {
      const index = (parsed.index as number) ?? 0
      return { type: 'tool_call_end', index }
    }

    // Stream end
    if (type === 'message_delta') {
      const delta = (parsed.delta ?? {}) as Record<string, unknown>
      const stopReason = String(delta.stop_reason ?? 'stop')
      return { type: 'done', stopReason }
    }

    // Usage
    if (type === 'message_start') {
      const msg = (parsed.message ?? {}) as Record<string, unknown>
      const usage = (msg.usage ?? {}) as Record<string, number>
      if (usage.input_tokens !== undefined) {
        return {
          type: 'usage',
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens ?? 0,
        }
      }
    }

    return null
  }

  private serializeMessage(msg: LMMessage): Record<string, unknown> {
    // Anthropic 'tool' role → user message with tool_result content block
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId,
            content: msg.content,
          },
        ],
      }
    }

    // Assistant message with tool calls → content array with tool_use blocks
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const content: unknown[] = []
      if (msg.content) content.push({ type: 'text', text: msg.content })
      for (const tc of msg.toolCalls) {
        let input: unknown = {}
        try { input = JSON.parse(tc.function.arguments) } catch { /* keep {} */ }
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input })
      }
      return { role: 'assistant', content }
    }

    return { role: msg.role, content: msg.content }
  }
}
