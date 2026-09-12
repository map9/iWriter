import { IWriterAgentContextSchema, type IWriterAgentContext } from './AgentContext'
import type { DomainReviewItem, ResumeDecision, ThreadMessage } from '@shared/ai/contracts'

interface InterruptedScope {
  /** LangGraph interrupt namespace hash used as the key in Command.resume maps. */
  interruptId: string
  actionRequestCount: number
  actionNames: string[]
  reviewActionOriginalIndices?: number[]
  autoDecisionsByIndex?: Record<number, ResumeDecision>
  /** Full original-order decisions after automatic and renderer decisions have been merged. */
  resolvedDecisions?: ResumeDecision[]
  /** Renderer payload retained while other concurrent interrupt scopes are reviewed. */
  review?: {
    partialMessage?: ThreadMessage
    reviews: DomainReviewItem[]
    actionRequests: Array<{ name: string; args: Record<string, unknown> }>
  }
  /** confirm_writing_plan args by original index — read at resume to register the write-session authorization (04.1 §6 Stage 2). */
  confirmPlanArgsByIndex?: Record<number, { plan: string; targetFiles: string[] }>
  /** finalize_chapter args by original index — read at resume to close/restore the write-session (M1b-3). */
  finalizeArgsByIndex?: Record<number, { chapter: string; summary?: string }>
  /**
   * M1-2 归因：本批次被 auto-apply 命中的章节文件。resume 只对这些文件重取 agent 快照
   * （recordAgentSnapshot），避免笼统扫全部活动会话把中断期间的作者手改误吸收进 lastAgentSnapshot。
   */
  autoAppliedFiles?: string[]
}

interface InterruptedRun {
  turnId?: string
  /** Live runs use keyed multi-resume; checkpoint rehydration may only recover one unkeyed batch. */
  resumeMode?: 'keyed' | 'unkeyed'
  /** Every concurrent LangGraph interrupt, keyed by its namespace-derived interrupt id. */
  scopes: Record<string, InterruptedScope>
  /** Interrupt ids that still require renderer decisions, in presentation order. */
  reviewQueue: string[]
  /** Scope currently displayed by the renderer. Used to reject stale resume responses. */
  activeReviewInterruptId?: string
  /** Host-only run-end finalization has no live LangGraph interrupt to resume. */
  syntheticFinalize?: boolean
}

interface ThreadExecutionContext {
  workspacePath: string | null
}

export class ThreadRuntimeStore {
  private interruptedRuns = new Map<string, InterruptedRun>()
  private threadContexts = new Map<string, ThreadExecutionContext>()
  private currentTurnIds = new Map<string, string>()

  setContext(threadId: string, context: ThreadExecutionContext): void {
    this.threadContexts.set(threadId, context)
  }

  getContext(threadId: string): ThreadExecutionContext | null {
    return this.threadContexts.get(threadId) ?? null
  }

  buildContext(threadId: string): IWriterAgentContext {
    const ctx = this.getContext(threadId)
    return IWriterAgentContextSchema.parse({
      workspacePath: ctx?.workspacePath ?? null,
    })
  }

  setInterrupted(threadId: string, interrupted: InterruptedRun): void {
    this.interruptedRuns.set(threadId, interrupted)
  }

  getInterrupted(threadId: string): InterruptedRun | null {
    return this.interruptedRuns.get(threadId) ?? null
  }

  clearInterrupted(threadId: string): void {
    this.interruptedRuns.delete(threadId)
  }

  setCurrentTurnId(threadId: string, turnId: string): void {
    this.currentTurnIds.set(threadId, turnId)
  }

  getCurrentTurnId(threadId: string): string | null {
    return this.currentTurnIds.get(threadId) ?? null
  }

  clearCurrentTurnId(threadId: string): void {
    this.currentTurnIds.delete(threadId)
  }

  deleteThread(threadId: string): void {
    this.threadContexts.delete(threadId)
    this.interruptedRuns.delete(threadId)
    this.currentTurnIds.delete(threadId)
  }

  clear(): void {
    this.threadContexts.clear()
    this.interruptedRuns.clear()
    this.currentTurnIds.clear()
  }
}

export type { InterruptedRun, InterruptedScope, ThreadExecutionContext }
