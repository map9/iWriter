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
  EditProposal,
  AiToolCall,
  ThreadMessage,
  AiAgentProfile,
  OpenTabInfo,
} from '../../../src/types/ai'

// ── Renderer → Main ────────────────────────────────────────────────────────

export interface SendMessageRequest {
  threadId?: string            // Omit to start a new thread
  userText: string
  profile: AiAgentProfile
  /** Context from the renderer at send time */
  editorContext: EditorContext
  /** Attachments: file paths, binary paths, directories */
  attachments?: {
    textFilePaths: string[]
    binaryFilePaths: string[]
    directories: string[]
  }
}

export interface EditorContext {
  filePath: string | null      // Active editing file path (null = no file open)
  isDirty: boolean             // Active file has unsaved changes
  folderPath: string | null    // Open workspace folder path
  openTabs: OpenTabInfo[]
  cursorBlockId?: number       // Display block ID of cursor position
  /** Pre-built <editor_state> XML from renderer (built at send time using ContextBuilder). */
  editorStateXml?: string | null
}

/** @deprecated Use ResumeRunRequest instead */
export interface ApproveProposalRequest {
  sessionId: string
  proposalId: string
}

/** @deprecated Use ResumeRunRequest instead */
export interface RejectProposalRequest {
  sessionId: string
  proposalId: string
}

// ── LangGraph HITL — interrupt / resume ────────────────────────────────────

/**
 * One decision per actionRequest in a HITL interrupt batch.
 *
 * - approved: execute the tool with the original arguments
 * - edited:   execute the tool with user-modified arguments (editedArgs required)
 * - rejected: skip the tool call entirely
 *
 * decisions[i] corresponds to actionRequests[i] from RunInterruptedEvent.
 * The array length MUST equal RunInterruptedEvent.proposals.length.
 * No proposalId needed — position in array determines which action is decided.
 */
export interface ResumeDecision {
  type: 'approved' | 'edited' | 'rejected'
  /** Optional rejection reason shown to the LLM in conversation history. */
  message?: string
  /** Modified tool arguments for 'edited' decisions. */
  editedArgs?: Record<string, unknown>
}

export interface ResumeRunRequest {
  threadId: string
  /**
   * One decision per pending proposal, in the same order as RunInterruptedEvent.proposals.
   * Length MUST equal the number of actionRequests in the interrupt.
   */
  decisions: ResumeDecision[]
}

// ── Main → Renderer ────────────────────────────────────────────────────────

export interface StreamChunkEvent {
  threadId: string
  type: 'text' | 'thinking' | 'tool_call_start' | 'tool_call_end'
  delta?: string               // Text or thinking delta
  toolName?: string            // For tool_call_start
  toolCallId?: string
  toolCall?: AiToolCall        // Full tool call for tool_call_start
}

/**
 * Replaces the old two-event sequence (ai:run-done(isPartial) + ai:interrupt-ready).
 *
 * Emitted when the agent hits a HITL interrupt. Contains:
 * - partialMessage: assistant content accumulated before the interrupt (may be absent)
 * - proposals: ALL proposals from ALL actionRequests in this interrupt batch, in order (UI display)
 * - actionRequests: raw LangGraph actionRequests in order (used for decision index alignment)
 *
 * The renderer must collect one decision per proposal/action before calling ai:resume.
 * decisions[i] corresponds to actionRequests[i] and proposals[i].
 */
export interface RunInterruptedEvent {
  threadId: string
  /**
   * Assistant message (text + tool calls) accumulated before the interrupt.
   * Absent when the LLM called an edit tool as its very first action.
   */
  partialMessage?: ThreadMessage
  /** All proposals from this interrupt batch, in actionRequests order. Used for UI display (diff view). */
  proposals: EditProposal[]
  /**
   * Raw LangGraph actionRequests in order.
   * Used by the renderer to align decisions by index.
   */
  actionRequests: Array<{ name: string; args: Record<string, unknown> }>
}

/** @deprecated Use RunInterruptedEvent instead */
export interface ProposalReadyEvent {
  sessionId: string
  proposal: EditProposal
}

export interface RoundCompleteEvent {
  sessionId: string
  message: ThreadMessage
}

export interface RunDoneEvent {
  threadId: string
  /**
   * Optional error message for fallback display.
   * Normal completions omit this — the renderer reloads messages from the checkpointer.
   */
  message?: ThreadMessage
}

export interface RunErrorEvent {
  threadId: string
  error: string
}

/** Main requests a serialized document snapshot from renderer */
export interface SnapshotRequestEvent {
  requestId: string
  filePath: string | null      // null = active editor
}

/** Renderer responds to a snapshot request */
export interface SnapshotResponse {
  requestId: string
  filePath: string | null
  snapshot: SerializedSnapshot | null
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
  /** Heading level (1-6), only set for heading blocks */
  headingLevel?: number
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
  'ai:cancel': [{ threadId: string }, void]
  'ai:resume': [ResumeRunRequest, void]
  'ai:get-config': [void, AiSettings]
  'ai:update-config': [Partial<AiSettings>, void]
  'ai:get-threads': [void, AiThread[]]
  'ai:delete-thread': [{ threadId: string }, void]
  'ai:clear-threads': [void, void]
  'ai:get-thread-messages': [{ threadId: string }, ThreadMessage[]]
  /** @deprecated Use ai:resume */
  'ai:approve-proposal': [ApproveProposalRequest, void]
  /** @deprecated Use ai:resume */
  'ai:reject-proposal': [RejectProposalRequest, void]
}
