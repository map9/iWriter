// Internal types for the AI provider layer
// These are implementation details — not exposed to the UI directly

// Message format sent to LLM APIs (normalized across providers)
export interface LMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  // For role: 'tool' — links to the assistant tool call it answers
  toolCallId?: string
  // For role: 'assistant' — tool calls the model wants to make
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

// Tool definition passed to LLM (JSON Schema based)
export interface LMTool {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema object
}

// Streaming chunks emitted by provider parsing
export type AgentChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_call_start'; id: string; name: string; index: number }
  | { type: 'tool_call_delta'; index: number; argumentsDelta: string }
  | { type: 'done'; stopReason: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }

// Outgoing HTTP request built by the provider driver
export interface HttpRequest {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

// Provider driver — stateless, handles request serialization and response parsing
// Each provider (OpenAI, Anthropic, Gemini) implements this interface
export interface AiProviderDriver {
  readonly id: string
  buildRequest(
    messages: LMMessage[],
    tools: LMTool[],
    modelId: string,
    apiKey: string,
    baseUrl?: string
  ): HttpRequest
  // Parse a single raw SSE line. Returns null to skip the line.
  parseRawLine(line: string): AgentChunk | null
}

// Options passed through to the underlying session (ACP model/mode selection)
export interface AgentStreamOptions {
  model?: string
  mode?: string
}

// Unified agent session — works for both native LLM and ACP external agents
export interface AgentSession {
  stream(
    messages: LMMessage[],
    tools: LMTool[],
    onChunk: (chunk: AgentChunk) => void,
    onDone: (stopReason: string) => void,
    onError: (error: string) => void,
    options?: AgentStreamOptions
  ): void
  cancel(): void
}
