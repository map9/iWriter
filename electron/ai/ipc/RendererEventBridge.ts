import type { WebContents } from 'electron'
import type {
  RunDoneEvent,
  RunErrorEvent,
  RunInterruptedEvent,
  StreamChunkEvent,
} from './protocol'

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
}
