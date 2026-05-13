import type { AiAgentDomain } from '../../../src/types/ai'
import type { DetectedInputLanguage } from '../../../src/ai/message/detectInputLanguage'

interface InterruptedRun {
  actionRequestCount: number
  actionNames: string[]
  turnId?: string
}

interface ThreadExecutionContext {
  activeFilePath: string | null
  workspacePath: string | null
  language?: DetectedInputLanguage
  attachmentTextFilePaths: string[]
  attachmentBinaryFilePaths: string[]
  attachmentDirectories: string[]
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

  buildConfigurable(threadId: string, domain?: AiAgentDomain): Record<string, string> {
    const ctx = this.getContext(threadId)
    return {
      thread_id: threadId,
      agent_domain: domain ?? 'editing',
      active_file_path: ctx?.activeFilePath ?? '',
      workspace_path: ctx?.workspacePath ?? '',
      output_language: ctx?.language ?? '',
      attached_text_file_paths: JSON.stringify(ctx?.attachmentTextFilePaths ?? []),
      attached_binary_file_paths: JSON.stringify(ctx?.attachmentBinaryFilePaths ?? []),
      attached_directories: JSON.stringify(ctx?.attachmentDirectories ?? []),
    }
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

export type { InterruptedRun, ThreadExecutionContext }
