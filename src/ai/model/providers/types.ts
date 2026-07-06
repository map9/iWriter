// Internal types for the AI provider layer
// These are implementation details — not exposed to the UI directly

// ── Multimodal content blocks ───────────────────────────────────────────────

/** A text block inside a multimodal user message. */
export interface LMTextBlock {
  type: 'text'
  text: string
}

/** An uploaded file referenced by the provider's Files API file_id. */
export interface LMFileRefBlock {
  type: 'file_ref'
  fileId: string          // Provider-specific file ID/URI
  mimeType: string        // e.g. 'image/png', 'application/pdf'
  fileName: string        // Original filename (for display)
}

/** Inline binary content (base64-encoded) — fallback when Files API is unavailable. */
export interface LMInlineBinaryBlock {
  type: 'inline_binary'
  base64: string
  mimeType: string
  fileName: string
}

export type LMContentBlock = LMTextBlock | LMFileRefBlock | LMInlineBinaryBlock

// ── Message format ─────────────────────────────────────────────────────────

// Message format sent to LLM APIs (normalized across providers)
export interface LMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** String for simple text-only messages; block array for multimodal user messages. */
  content: string | LMContentBlock[]
  // For role: 'tool' — links to the assistant tool call it answers
  toolCallId?: string
  // For role: 'assistant' — tool calls the model wants to make
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

// ── Uploaded file reference ────────────────────────────────────────────────

/** Result of uploading a file to a provider's Files API. */
export interface UploadedFileRef {
  fileId: string      // Provider-specific file ID or URI
  mimeType: string
  fileName: string
  providerType: string  // 'anthropic' | 'openai-compat' | 'gemini' — for correct serialization
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
  | { type: 'thinking'; delta: string }
  | { type: 'tool_call_start'; id: string; name: string; index: number; initialArguments?: string }
  | { type: 'tool_call_delta'; index: number; argumentsDelta: string }
  | { type: 'tool_call_end'; index: number }
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
  /**
   * Upload a file to the provider's Files API.
   * Returns an UploadedFileRef on success, or null if the provider doesn't support file uploads.
   */
  uploadFile?(
    base64: string,
    mimeType: string,
    fileName: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<UploadedFileRef | null>
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
