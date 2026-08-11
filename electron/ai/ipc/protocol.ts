/**
 * IPC Protocol type definitions for the main-process AI agent system.
 *
 * Channels:
 *   Renderer → Main:  ipcRenderer.invoke('ai:*')
 *   Main → Renderer:  webContents.send('ai:*')
 */

import type {
  AiSettings,
  AiThread,
  AiToolCall,
  ThreadMessage,
  AiAgentMode,
  AiAgentDomain,
  AiThinkingLevel,
} from '../../../src/types/ai'
import type { DomainReviewItem } from '../domain/DomainStrategy'
export type { DomainReviewItem }

// ── Renderer → Main ────────────────────────────────────────────────────────

export interface SendMessageRequest {
  threadId?: string            // Omit to start a new thread
  turnId?: string              // Stable renderer-generated turn identity
  userText: string
  uiLocale?: string
  domain: AiAgentDomain
  mode: AiAgentMode
  /** Runtime configuration chosen by the renderer for this thread/run. */
  threadRuntime?: {
    providerConfigId?: string
    modelId?: string
    thinkingLevel?: AiThinkingLevel
  }
  /** Active file when the thread was created; used only for the thread context pill. */
  originFilePath: string | null
  /** Hidden workspace root supplied to runtime tools through runConfig.context. */
  workspacePath: string | null
  /** Attachments selected for this turn. Image files are identified by signature in the main process. */
  attachments?: {
    filePaths: string[]
    directories: string[]
  }
}

export interface SessionContextStatsRequest {
  domain: AiAgentDomain
  mode: AiAgentMode
  threadId?: string
  threadRuntime?: {
    providerConfigId?: string
    modelId?: string
    thinkingLevel?: AiThinkingLevel
  }
}

export interface SessionContextStatsResponse {
  visible: boolean
  currentTokens: number
  triggerTokens: number
  requestBudgetTokens: number
  keepTokens: number
  maxInputTokens?: number
}

// ── LangGraph HITL — interrupt / resume ────────────────────────────────────

/**
 * One decision per actionRequest in a HITL interrupt batch.
 *
 * - approved: execute the tool with the original arguments
 * - edited:   execute the tool with user-modified arguments (editedArgs required)
 * - rejected: skip the tool call entirely
 *
 * decisions[i] corresponds to actionRequests[i] and reviews[i] from RunInterruptedEvent.
 * The array length MUST equal RunInterruptedEvent.reviews.length.
 * No proposalId needed — position in array determines which action is decided.
 */
export interface ResumeDecision {
  type: 'approved' | 'edited' | 'rejected' | 'responded'
  /** Optional rejection/feedback reason. Required for 'responded'. */
  message?: string
  /** Modified tool arguments for 'edited' decisions. */
  editedArgs?: Record<string, unknown>
}

export interface ResumeRunRequest {
  threadId: string
  /**
   * One decision per review item, in the same order as RunInterruptedEvent.reviews.
   * Length MUST equal the number of actionRequests in the interrupt.
   */
  decisions: ResumeDecision[]
}

// ── Main → Renderer ────────────────────────────────────────────────────────

/**
 * Normalized token usage from a single LLM response.
 * Sourced from LangChain's standardized `usage_metadata` field (works across
 * Anthropic, OpenAI, Gemini, and DeepSeek providers).
 */
export interface NormalizedUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** Tokens served from provider cache (Anthropic cache_read_input_tokens, DeepSeek cached_tokens). */
  cacheReadTokens: number
  /** Tokens written into provider cache (Anthropic cache_creation_input_tokens). */
  cacheCreationTokens: number
}

// subagentId is the parent task toolCallId. The renderer uses this shared id to
// render one invocation instead of separate parent task and subagent cards.
export type StreamChunkEvent =
  | { threadId: string; turnId?: string; type: 'text'; delta: string; subagentName?: string; subagentId?: string }
  | { threadId: string; turnId?: string; type: 'thinking'; delta: string; subagentName?: string; subagentId?: string }
  | { threadId: string; turnId?: string; type: 'tool_call_start'; toolName?: string; toolCallId: string; toolCall: AiToolCall; subagentName?: string; subagentId?: string }
  | { threadId: string; turnId?: string; type: 'tool_call_end'; toolCallId: string; toolCall: AiToolCall; subagentName?: string; subagentId?: string }
  | { threadId: string; turnId?: string; type: 'subagent_start'; subagentName: string; taskInput: unknown; subagentId?: string }
  | { threadId: string; turnId?: string; type: 'subagent_end'; subagentName: string; output: unknown; subagentId?: string }
  | { threadId: string; turnId?: string; type: 'subagent_error'; subagentName: string; error: string; subagentId?: string }
  /** Real-time lifecycle event emitted by deepagents while context summarization runs. */
  | {
      threadId: string
      turnId?: string
      type: 'context_compression'
      eventId: string
      status: 'compressing' | 'completed' | 'failed'
      startedAt: number
      timestamp: number
      summary?: string
      filePath?: string | null
      compressedMessageCount?: number
      error?: string
      subagentName?: string
      subagentId?: string
      anchorMessageId?: string
      anchorToolCallId?: string
    }
  /** Real token usage from one LLM call. subagentId present ⇒ emitted by a sub-agent. */
  | { threadId: string; turnId?: string; type: 'usage'; messageId?: string; usage: NormalizedUsage; subagentName?: string; subagentId?: string }

/**
 * Emitted when the agent hits a HITL interrupt. Contains:
 * - partialMessage: assistant content accumulated before the interrupt (may be absent)
 * - reviews: unified DomainReviewItem[] for actionRequests that require user review
 * - actionRequests: reviewable LangGraph actionRequests in the same order as reviews
 *
 * The renderer must collect one decision per review/action before calling ai:resume.
 * decisions[i] corresponds to the reviewable actionRequests[i] and reviews[i].
 * Main process merges these decisions with any auto-approved/auto-rejected actions
 * before resuming LangGraph's original interrupt batch.
 * Dispatch to edit or creative UI by inspecting reviews[i].kind.
 */
export interface RunInterruptedEvent {
  threadId: string
  turnId?: string
  /**
   * Assistant message (text + tool calls) accumulated before the interrupt.
   * Absent when the LLM called an edit tool as its very first action.
   */
  partialMessage?: ThreadMessage
  /** Unified review payloads in reviewable actionRequests order. Dispatch by reviews[i].kind. */
  reviews: DomainReviewItem[]
  /**
   * LangGraph actionRequests that still require user review.
   * Main process keeps any original-index mapping needed for resume.
   */
  actionRequests: Array<{ name: string; args: Record<string, unknown> }>
}

export interface RunDoneEvent {
  threadId: string
  turnId?: string
  /**
   * Optional error message for fallback display.
   * Normal completions omit this — the renderer reloads messages from the checkpointer.
   */
  message?: ThreadMessage
}

export interface RunErrorEvent {
  threadId: string
  turnId?: string
  error: string
}

/** Fired when modelFallbackMiddleware switched from the primary model to a backup. */
export interface RunModelFallbackEvent {
  threadId: string
  fallbackModelId: string
}

/** Fired when a filesystem write/edit tool call was auto-rejected by policy and the run auto-resumed. */
export interface RunFilesystemAutoRejectEvent {
  threadId: string
  toolName: string
  filePath: string
  message: string
}

/** Main requests a serialized document snapshot from renderer */
export interface SnapshotRequestEvent {
  requestId: string
  filePath: string | null      // null = active editor
  /** When set, target the open tab whose FileTab.id matches this (in-memory unsaved_new document). */
  tabId?: string
}

/** Renderer responds to a snapshot request */
export interface SnapshotResponse {
  requestId: string
  filePath: string | null
  snapshot: SerializedSnapshot | null
}

export interface EditorStateRequestEvent {
  requestId: string
}

export interface EditorStateTab {
  path: string | null
  virtualId: string | null
  name: string
  fileType: string
  dirty: boolean
}

export interface EditorStateDocument extends EditorStateTab {
  cursorBlockId: number | null
  cursorSection: { heading: string | null; headingBlockId: number | null } | null
  selection: { blockIds: number[]; content: string | null } | null
  outline: Array<{
    blockId: number
    level: number
    text: string
    sectionBlocks: number
    wordCount: number
  }>
}

export interface EditorStateSnapshot {
  activeDocument: EditorStateDocument | null
  openTabs: EditorStateTab[]
}

export interface EditorStateResponse {
  requestId: string
  state: EditorStateSnapshot
}

export interface ProposalStatusUpdate {
  sessionId: string
  proposalId: string
  status: 'applied' | 'rejected'
  resultText: string
}

// ── Serialized Document Snapshot ──────────────────────────────────────────

/**
 * A serialized, JSON-safe representation of a TipTap document view.
 * Built in the renderer process using DocumentViewBuilder, transferred to
 * the main process via IPC so document tools can query without a live editor.
 */
export interface SerializedSnapshot {
  filePath?: string | null
  /** Full document Markdown with {b:n} block markers */
  viewMarkdown: string
  /** Compact outline text for system prompt injection */
  outlineText: string
  /** Block map: each entry has displayId, nodeId, nodeType, content (markdown), and optional headingLevel */
  blockMap: SerializedBlockEntry[]
  outline: SerializedOutlineEntry[]
  totalBlocks: number
  totalWords: number
  cursorBlockId: number | null
}

export interface SerializedBlockEntry {
  displayId: number
  nodeId: string
  nodeType: string
  /** Markdown content of this block (already rendered by nodeToMarkdown) */
  content: string
  /** Character length of `content` — the unit for content-budget pagination (A4.1). */
  charCount: number
  /** Heading level (1-6), only set for heading blocks */
  headingLevel?: number
  /**
   * Two-level block model (A4.2). A container block wraps a whole list; its
   * `content` is the full list markdown, editable via container-level edit_block
   * (whole-list replace). Container blocks are skipped in the linear content flow.
   */
  isContainer?: boolean
  /** For list-item leaf blocks: the displayId of the enclosing top-level list container. */
  containerId?: number
}

export interface SerializedOutlineEntry {
  displayId: number
  level: number
  text: string
  sectionBlocks: number
  wordCount: number
}

// ── Send/Receive type map (for type-safe IPC) ─────────────────────────────

export type AiIpcInvokeMap = {
  'ai:send-message': [SendMessageRequest, { threadId: string }]
  'ai:get-session-context-stats': [SessionContextStatsRequest, SessionContextStatsResponse]
  'ai:cancel': [{ threadId: string }, void]
  'ai:resume': [ResumeRunRequest, void]
  'ai:get-config': [void, AiSettings]
  'ai:update-config': [Partial<AiSettings>, void]
  'ai:get-threads': [void, AiThread[]]
  'ai:delete-thread': [{ threadId: string }, void]
  'ai:clear-threads': [void, void]
  'ai:get-thread-messages': [{ threadId: string }, ThreadMessage[]]
}
