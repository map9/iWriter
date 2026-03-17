import type { AiProviderDriver, AgentChunk, HttpRequest, LMMessage, LMTool } from './types'

/**
 * Google Gemini provider driver.
 *
 * API: https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent
 * Auth: ?key=API_KEY query parameter (or Authorization: Bearer for Vertex AI)
 *
 * Key differences:
 *  - Newline-delimited JSON stream (not SSE `data:` lines)
 *  - Roles: 'user' / 'model' (not 'assistant')
 *  - System instruction is a separate top-level field
 *  - Tools use `functionDeclarations` inside a `tools` array
 *  - Function call response uses `functionResponse` parts
 */
export class GeminiProvider implements AiProviderDriver {
  readonly id = 'gemini'

  private static readonly DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta'

  buildRequest(
    messages: LMMessage[],
    tools: LMTool[],
    modelId: string,
    apiKey: string,
    baseUrl?: string
  ): HttpRequest {
    const base = baseUrl?.replace(/\/$/, '') ?? GeminiProvider.DEFAULT_BASE
    const url = `${base}/models/${modelId}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    const systemMsg = messages.find(m => m.role === 'system')
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => this.serializeMessage(m))

    const body: Record<string, unknown> = { contents: chatMessages }

    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] }
    }

    if (tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ]
    }

    return { url, method: 'POST', headers, body: JSON.stringify(body) }
  }

  parseRawLine(line: string): AgentChunk | null {
    // Gemini uses `data: {...}` SSE lines
    if (!line.startsWith('data: ')) return null
    const data = line.slice(6).trim()
    if (!data || data === '[DONE]') return null

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(data)
    } catch {
      return null
    }

    const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined
    if (!candidates?.length) return null

    const candidate = candidates[0]!
    const finishReason = candidate.finishReason as string | undefined

    const content = candidate.content as Record<string, unknown> | undefined
    const parts = content?.parts as Array<Record<string, unknown>> | undefined

    if (parts?.length) {
      const part = parts[0]!

      // Text part
      if (typeof part.text === 'string') {
        return { type: 'text', delta: part.text }
      }

      // Function call part
      if (part.functionCall) {
        const fc = part.functionCall as Record<string, unknown>
        return {
          type: 'tool_call_start',
          id: `gemini-fc-${Date.now()}`,
          name: String(fc.name ?? ''),
          index: 0,
        }
      }
    }

    if (finishReason && finishReason !== 'FINISH_REASON_UNSPECIFIED') {
      const stopReason =
        finishReason === 'STOP' ? 'stop' :
        finishReason === 'MAX_TOKENS' ? 'length' :
        finishReason.toLowerCase()
      return { type: 'done', stopReason }
    }

    return null
  }

  private serializeMessage(msg: LMMessage): Record<string, unknown> {
    // Gemini uses 'model' instead of 'assistant'
    const role = msg.role === 'assistant' ? 'model' : 'user'

    // Tool results → functionResponse part
    if (msg.role === 'tool') {
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool_result',
              response: { content: msg.content },
            },
          },
        ],
      }
    }

    // Assistant with tool calls → functionCall part
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const parts: unknown[] = []
      if (msg.content) parts.push({ text: msg.content })
      for (const tc of msg.toolCalls) {
        let args: unknown = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* keep {} */ }
        parts.push({ functionCall: { name: tc.function.name, args } })
      }
      return { role, parts }
    }

    return { role, parts: [{ text: msg.content }] }
  }
}
