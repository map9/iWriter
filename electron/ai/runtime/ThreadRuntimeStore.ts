import type { AiAgentDomain } from '../../../src/types/ai'
import type { DetectedInputLanguage } from '../../../src/ai/message/detectInputLanguage'
import { IWriterAgentContextSchema, type IWriterAgentContext } from './AgentContext'
import type { ResumeDecision } from '../ipc/protocol'

interface InterruptedRun {
  actionRequestCount: number
  actionNames: string[]
  turnId?: string
  reviewActionOriginalIndices?: number[]
  autoDecisionsByIndex?: Record<number, ResumeDecision>
  /** confirm_writing_plan args by original index — read at resume to register the write-session authorization (04.1 §6 Stage 2). */
  confirmPlanArgsByIndex?: Record<number, { plan: string; targetFiles: string[] }>
  /** finalize_chapter args by original index — read at resume to close/restore the write-session (M1b-3). */
  finalizeArgsByIndex?: Record<number, { chapter: string; summary?: string }>
  /**
   * M1-2 归因：本批次被 auto-apply 命中的章节文件。resume 只对这些文件重取 agent 快照
   * （recordAgentSnapshot），避免笼统扫全部活动会话把中断期间的作者手改误吸收进 lastAgentSnapshot。
   */
  autoAppliedFiles?: string[]
  /**
   * M1-1: this interrupt was synthesized at run-end (the agent finished without finalizing an active
   * write-session), not produced by a live LangGraph interrupt. resumeRun applies the finalize host
   * side effects but MUST NOT feed a Command back into the graph — there is no interrupt to resume.
   */
  syntheticFinalize?: boolean
}

interface ThreadExecutionContext {
  activeFilePath: string | null
  workspacePath: string | null
  language?: DetectedInputLanguage
  attachmentTextFilePaths: string[]
  attachmentBinaryFilePaths: string[]
  attachmentDirectories: string[]
  dirtyDocumentPaths: string[]
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

  buildConfigurable(threadId: string): Record<string, string> {
    return { thread_id: threadId }
  }

  buildContext(threadId: string, domain?: AiAgentDomain): IWriterAgentContext {
    const ctx = this.getContext(threadId)
    return IWriterAgentContextSchema.parse({
      threadId,
      agentDomain: domain ?? 'editing',
      activeFilePath: ctx?.activeFilePath ?? null,
      workspacePath: ctx?.workspacePath ?? null,
      outputLanguage: ctx?.language ?? '',
      attachedTextFilePaths: ctx?.attachmentTextFilePaths ?? [],
      attachedBinaryFilePaths: ctx?.attachmentBinaryFilePaths ?? [],
      attachedDirectories: ctx?.attachmentDirectories ?? [],
      turnId: this.getCurrentTurnId(threadId),
      dirtyDocumentPaths: ctx?.dirtyDocumentPaths ?? [],
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

export type { InterruptedRun, ThreadExecutionContext, IWriterAgentContext }
