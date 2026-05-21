import type { ThreadMessage } from '../../../src/types/ai'
import type { DomainAgentCapabilities } from './types'
import type { AiAgentMode, EditProposal, CreativeReviewItem, FilesystemReviewItem } from '../../../src/types/ai'
import type { DetectedInputLanguage } from '../../../src/ai/message/detectInputLanguage'

/** Unified review payload — renderer dispatches to edit or creative UI by kind. */
export type DomainReviewItem =
  | { kind: 'edit'; payload: EditProposal }
  | { kind: 'creative'; payload: CreativeReviewItem }
  | { kind: 'filesystem'; payload: FilesystemReviewItem }

export interface DomainBuildContext {
  mode: AiAgentMode
  workspacePath: string | null
  language: DetectedInputLanguage
}

export interface InterruptContext {
  threadId: string
  turnId: string | undefined
  actionRequests: Array<{ name: string; args: Record<string, unknown> }>
  partialMessage?: ThreadMessage
}

export interface SessionCompleteContext {
  threadId: string
  workspacePath: string | null
}

export interface DomainStrategy {
  /** Build domain capabilities. Filesystem backend, skills middleware, and file HITL live in AgentFilesystem. */
  buildCapabilities(ctx: DomainBuildContext): DomainAgentCapabilities

  /** System prompt for the current domain + mode combination. */
  getSystemPrompt(mode: AiAgentMode, language: DetectedInputLanguage): string

  /** AGENTS.md filename (basename only, without directory path). */
  getMemoryFileName(): string

  /**
   * Map actionRequests from a HITL interrupt to unified DomainReviewItem[].
   * Result length must equal actionRequests.length (index-aligned for resume decisions).
   * May perform async I/O (e.g. SnapshotBroker IPC) — edit domain only.
   */
  buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]>

  /** Optional hook called after a run completes normally (no interrupt). */
  onSessionComplete?(ctx: SessionCompleteContext): void

  /** Tool names configured in interruptOn for this domain. Used to detect pending interrupts on thread reopen. */
  getInterruptOnNames(): Set<string>
}
