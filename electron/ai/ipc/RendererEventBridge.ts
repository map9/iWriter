import type { WebContents } from 'electron'
import type {
  RunContextCompressedEvent,
  RunDoneEvent,
  RunErrorEvent,
  RunInterruptedEvent,
  RunModelFallbackEvent,
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

  sendRunContextCompressed(event: RunContextCompressedEvent): void {
    this.getWebContents()?.send('ai:context-compressed', event)
  }

  sendRunModelFallback(event: RunModelFallbackEvent): void {
    this.getWebContents()?.send('ai:model-fallback', event)
  }
}
