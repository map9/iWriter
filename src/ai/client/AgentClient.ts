import type {
  AiSettings,
  AiThread,
  ResumeRunRequest,
  RunDoneEvent,
  RunErrorEvent,
  RunFilesystemAutoRejectEvent,
  RunInterruptedEvent,
  RunModelFallbackEvent,
  SendMessageRequest,
  SessionContextStatsRequest,
  SessionContextStatsResponse,
  StreamChunkEvent,
  ThreadMessage,
} from '@shared/ai/contracts'

export class AgentClient {
  sendMessage(request: SendMessageRequest): Promise<{ threadId: string }> | undefined {
    return window.electronAPI.aiSendMessage?.(request)
  }

  getSessionContextStats(
    request: SessionContextStatsRequest,
  ): Promise<SessionContextStatsResponse> | undefined {
    return window.electronAPI.aiGetSessionContextStats?.(request)
  }

  cancel(threadId: string): Promise<void> | undefined {
    return window.electronAPI.aiCancel?.(threadId)
  }

  resume(request: ResumeRunRequest): Promise<void> | undefined {
    return window.electronAPI.aiResume?.(request)
  }

  updateConfig(patch: Partial<AiSettings>): Promise<void> | undefined {
    return window.electronAPI.aiUpdateConfig?.(patch)
  }

  getThreads(): Promise<AiThread[]> | undefined {
    return window.electronAPI.aiGetThreads?.()
  }

  deleteThread(threadId: string): Promise<void> | undefined {
    return window.electronAPI.aiDeleteThread?.(threadId)
  }

  clearThreads(): Promise<void> | undefined {
    return window.electronAPI.aiClearThreads?.()
  }

  getThreadMessages(threadId: string): Promise<ThreadMessage[]> | undefined {
    return window.electronAPI.aiGetThreadMessages?.(threadId)
  }

  onStreamChunk(callback: (event: StreamChunkEvent) => void): void {
    window.electronAPI.onAiStreamChunk?.(callback)
  }

  onRunInterrupted(callback: (event: RunInterruptedEvent) => void): void {
    window.electronAPI.onAiRunInterrupted?.(callback)
  }

  onRunDone(callback: (event: RunDoneEvent) => void): void {
    window.electronAPI.onAiRunDone?.(callback)
  }

  onRunError(callback: (event: RunErrorEvent) => void): void {
    window.electronAPI.onAiRunError?.(callback)
  }

  onModelFallback(callback: (event: RunModelFallbackEvent) => void): void {
    window.electronAPI.onAiModelFallback?.(callback)
  }

  onFilesystemAutoReject(callback: (event: RunFilesystemAutoRejectEvent) => void): void {
    window.electronAPI.onAiFilesystemAutoReject?.(callback)
  }

  removeListeners(): void {
    window.electronAPI.removeAiListeners?.()
  }
}

export const agentClient = new AgentClient()
