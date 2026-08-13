import type { DomainAgentCapabilities } from './types'
import type { AiAgentMode, DomainReviewItem, ThreadMessage } from '../../../shared/ai/contracts'
import type { DetectedInputLanguage } from '../../../shared/ai/core/detectInputLanguage'
import type { ResumeDecision } from '../../../shared/ai/contracts/protocol'
import type { DomainSummarizationProfile } from '../scaffold/summarization/SummarizationFramework'

export type { DomainReviewItem } from '../../../shared/ai/contracts'

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

  /**
   * Skill source directories to expose to the main agent, in last-wins order.
   * The project-level `{workspace}/.iwriter/skills` dir belongs末位 (highest priority).
   * Empty by default.
   */
  getSkillSources?(aiRootPath: string, workspacePath: string | null): string[]

  /** System prompt for the current domain + mode combination. */
  getSystemPrompt(mode: AiAgentMode, language: DetectedInputLanguage): string

  /** Semantic fields the shared summarization framework must preserve for this domain. */
  getSummarizationProfile(): DomainSummarizationProfile

  /**
   * 该 domain 的用户级协作记忆目录名（`~/.iwriter/ai/memory/{dir}/memory.md`）。
   * 与 getSkillSources 一致，由各 domain 自持目录名。
   */
  getMemoryDir(): string

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

  /**
   * Optional domain-level guard against mixed-kind interrupt batches.
   * Called after filesystem pre-decisions, before buildReviewItems.
   * Returns auto-reject decisions keyed by original actionRequests index for any
   * actions that should not be reviewed (e.g. non-dominant kind in a mixed batch).
   * Returned indices are removed from the review queue; the model receives the
   * rejection message so it can resubmit in a separate turn.
   */
  preDecideMixed?(
    reviewActionRequests: Array<{ name: string; args: Record<string, unknown> }>,
    reviewActionOriginalIndices: number[],
  ): Record<number, ResumeDecision> | undefined
}
