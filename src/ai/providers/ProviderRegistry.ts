import type { AiProviderConfig } from '@/types/ai'
import type { AgentChunk, AgentSession, AiProviderDriver, LMMessage, LMTool } from './types'

/**
 * NativeAgentSession — executes streaming LLM calls directly from the renderer
 * using the Fetch API. No IPC relay needed; Electron's renderer has unrestricted
 * network access so CORS is not an issue for desktop-to-API calls.
 */
class NativeAgentSession implements AgentSession {
  private abortController: AbortController | null = null

  constructor(
    private readonly driver: AiProviderDriver,
    private readonly config: AiProviderConfig,
    private readonly modelId: string
  ) {}

  stream(
    messages: LMMessage[],
    tools: LMTool[],
    onChunk: (chunk: AgentChunk) => void,
    onDone: (stopReason: string) => void,
    onError: (error: string) => void
  ): void {
    this.abortController = new AbortController()
    this.doStream(messages, tools, onChunk, onDone, onError, this.abortController.signal)
  }

  cancel(): void {
    this.abortController?.abort()
  }

  private async doStream(
    messages: LMMessage[],
    tools: LMTool[],
    onChunk: (chunk: AgentChunk) => void,
    onDone: (stopReason: string) => void,
    onError: (error: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const request = this.driver.buildRequest(
      messages,
      tools,
      this.modelId,
      this.config.apiKey,
      this.config.baseUrl
    )

    let response: Response
    try {
      response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal,
      })
    } catch (err) {
      if (signal.aborted) return
      onError(err instanceof Error ? err.message : String(err))
      return
    }

    if (!response.ok) {
      let detail = ''
      try {
        detail = await response.text()
      } catch {
        detail = response.statusText
      }
      onError(`HTTP ${response.status}: ${detail}`)
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let stopReason = 'stop'

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          const chunk = this.driver.parseRawLine(trimmed)
          if (!chunk) continue

          if (chunk.type === 'done') {
            stopReason = chunk.stopReason
          } else {
            onChunk(chunk)
          }
        }
      }
    } catch (err) {
      if (signal.aborted) return
      onError(err instanceof Error ? err.message : String(err))
      return
    }

    onDone(stopReason)
  }
}

/**
 * ProviderRegistry — maps provider type IDs to their driver implementations.
 * Creating a session returns a unified AgentSession regardless of provider type.
 */
export class ProviderRegistry {
  private drivers = new Map<string, AiProviderDriver>()

  register(driver: AiProviderDriver): void {
    this.drivers.set(driver.id, driver)
  }

  get(id: string): AiProviderDriver | undefined {
    return this.drivers.get(id)
  }

  /**
   * Create an AgentSession for the given provider config.
   * Returns null for unsupported provider types.
   */
  createSession(config: AiProviderConfig, modelId: string): AgentSession | null {
    const driver = this.drivers.get(config.type)
    if (!driver) {
      console.warn(`[ProviderRegistry] No driver registered for type: ${config.type}`)
      return null
    }

    return new NativeAgentSession(driver, config, modelId)
  }
}

// Singleton registry — initialized in src/ai/index.ts
export const providerRegistry = new ProviderRegistry()
