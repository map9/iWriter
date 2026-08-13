import type { WebContents } from 'electron'
import type { GitMutationEvent } from '../../../shared/git/types'
import type {
  RunDoneEvent,
  RunErrorEvent,
  RunFilesystemAutoRejectEvent,
  RunInterruptedEvent,
  RunModelFallbackEvent,
  StreamChunkEvent,
} from '@shared/ai/contracts'

export class RendererEventBridge {
  constructor(private readonly getWebContents: () => WebContents | null) {}

  sendStreamChunk(event: StreamChunkEvent): void {
    this.getWebContents()?.send('ai:stream-chunk', event)
  }

  sendRunInterrupted(event: RunInterruptedEvent): void {
    this.getWebContents()?.send('ai:run-interrupted', event)
  }

  sendRunDone(event: RunDoneEvent): void {
    this.getWebContents()?.send('ai:run-done', event)
  }

  sendRunError(event: RunErrorEvent): void {
    this.getWebContents()?.send('ai:run-error', event)
  }

  sendRunModelFallback(event: RunModelFallbackEvent): void {
    this.getWebContents()?.send('ai:model-fallback', event)
  }

  sendRunFilesystemAutoReject(event: RunFilesystemAutoRejectEvent): void {
    this.getWebContents()?.send('ai:filesystem-auto-reject', event)
  }

  sendGitMutation(event: GitMutationEvent): void {
    this.getWebContents()?.send('git:mutation', event)
  }
}
