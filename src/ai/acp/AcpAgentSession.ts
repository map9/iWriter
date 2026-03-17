/**
 * AcpAgentSession — implements AgentSession for external ACP agents.
 *
 * Spawns the agent process via the main process AcpManager (IPC),
 * then translates ACP stdout events into AgentChunk callbacks.
 *
 * Key design points aligned with acp-ui AcpClientBridge pattern:
 *  - connect() registers ONE persistent listener set, not per-call.
 *  - Messages are routed to pendingInitResolve (during init) or
 *    activeStreamCallbacks (during streaming) based on current state.
 *  - disconnect() removes listeners — only called from cancel().
 *  - The agent process is kept alive across multiple messages.
 */

import type { AgentSession, AgentChunk, AgentStreamOptions, LMMessage, LMTool } from '../providers/types'
import type { AiProviderConfig } from '@/types/ai'
import { parseAcpLine } from './AcpProtocol'
import type { AcpModelInfo, AcpModeInfo, AcpSessionMessage } from './AcpProtocol'

export type AcpInitCallback = (
  models: AcpModelInfo[],
  modes: AcpModeInfo[],
  currentModelId: string | null,
  currentModeId: string | null
) => void
export type AcpPermissionCallback = (
  requestId: number,
  permission: string,
  path: string | undefined,
  description: string | undefined,
  options: string[]
) => void

export class AcpAgentSession implements AgentSession {
  readonly sessionId: string

  /** Whether the process has been successfully launched. */
  private initialized = false
  /** Guard to prevent concurrent launch attempts. */
  private launching = false
  /** Whether persistent listeners are registered. */
  private connected = false

  /** Called once (or on session/update) when the agent reports models/modes. */
  onInit?: AcpInitCallback
  /** Called when the agent requests user permission for a sensitive action. */
  onPermissionRequest?: AcpPermissionCallback

  // ── Workspace context (injected by the store before first stream) ──────────
  private _workspacePath: string | null = null
  private _filePath: string | null = null

  /** The ACP-internal sessionId returned by session/new — required in session/prompt params. */
  private _acpSessionId: string | null = null

  /**
   * The model/mode currently active in the agent process.
   * Populated from session/new result; updated after each set_model/set_mode call.
   * Used to skip redundant set_model/set_mode calls when the value hasn't changed.
   */
  private _agentCurrentModelId: string | null = null
  private _agentCurrentModeId: string | null = null

  // ── Pending init resolver (acp-ui bridge pattern) ─────────────────────────
  private pendingInitResolve: ((success: boolean) => void) | null = null
  private initTimeoutId: ReturnType<typeof setTimeout> | null = null

  // ── Two-phase init tracking ────────────────────────────────────────────────
  // Phase 1: 'initialize' — waiting for the initialize response
  // Phase 2: 'new_session' — waiting for the session/new response (has models/modes)
  private _initPhase: 'initialize' | 'new_session' | null = null

  // ── Active stream callbacks ────────────────────────────────────────────────
  private activeStreamCallbacks: {
    onChunk: (chunk: AgentChunk) => void
    onDone: (stopReason: string) => void
    onError: (error: string) => void
  } | null = null

  // ── Delta tracking for session/update ─────────────────────────────────────
  private prevAssistantContent = ''
  private prevToolCallIds = new Set<string>()

  constructor(private readonly config: AiProviderConfig) {
    this.sessionId = `acp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }

  /**
   * Inject the workspace and file context to be sent in the ACP `initialize` message.
   * Should be called before the first `stream()` call (and updated when context changes).
   */
  setContext(ctx: { workspacePath: string | null; filePath: string | null }): void {
    this._workspacePath = ctx.workspacePath
    this._filePath = ctx.filePath
  }

  // ── Persistent listener bridge (aligned with acp-ui AcpClientBridge) ──────

  /**
   * Register persistent IPC listeners once.
   * All incoming messages are routed to the appropriate handler based on state.
   * Called before the first launch — never re-registers if already connected.
   */
  connect(): void {
    if (this.connected) return
    this.connected = true

    window.electronAPI.onAcpChunk?.((data: { sessionId: string; data: string }) => {
      if (data.sessionId !== this.sessionId) return
      this.handleChunk(data.data)
    })

    window.electronAPI.onAcpDone?.((data: { sessionId: string }) => {
      if (data.sessionId !== this.sessionId) return
      this.handleProcessDone()
    })

    window.electronAPI.onAcpError?.((data: { sessionId: string; message: string }) => {
      if (data.sessionId !== this.sessionId) return
      this.handleProcessError(data.message)
    })
  }

  /**
   * Remove all IPC listeners. Called only from cancel() to fully shut down.
   */
  disconnect(): void {
    // Resolve pending init promise immediately so initialize() returns false rather than hanging
    if (this.pendingInitResolve) {
      if (this.initTimeoutId !== null) {
        clearTimeout(this.initTimeoutId)
        this.initTimeoutId = null
      }
      this.pendingInitResolve(false)
      this.pendingInitResolve = null
    }
    this._initPhase = null
    window.electronAPI.removeAcpListeners?.()
    this.connected = false
    this.activeStreamCallbacks = null
  }

  // ── AgentSession interface ────────────────────────────────────────────────

  stream(
    messages: LMMessage[],
    _tools: LMTool[],
    onChunk: (chunk: AgentChunk) => void,
    onDone: (stopReason: string) => void,
    onError: (error: string) => void,
    options?: AgentStreamOptions
  ): void {
    this.connect() // Ensure persistent listeners are up
    this.doStream(messages, onChunk, onDone, onError, options)
  }

  cancel(): void {
    window.electronAPI.acpCancel?.(this.sessionId).catch(() => {})
    this.disconnect()
    // Allow re-launch on next use after cancel
    this.initialized = false
  }

  /**
   * Proactively initialize the agent process without sending a message.
   * Connects persistent listeners first, then launches the process.
   * Resolves true when init_result is received, false on error or timeout.
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true

    this.connect() // Register persistent listeners BEFORE launching

    return new Promise<boolean>(async (resolve) => {
      this.pendingInitResolve = resolve
      this._initPhase = 'initialize'

      // 120-second timeout (agents like GitHub Copilot may take >30s on first run)
      this.initTimeoutId = setTimeout(() => {
        if (this.pendingInitResolve) {
          this.pendingInitResolve(false)
          this.pendingInitResolve = null
          this.initTimeoutId = null
        }
      }, 120_000)

      const launched = await this.ensureLaunched()
      if (!launched) {
        clearTimeout(this.initTimeoutId!)
        this.initTimeoutId = null
        this.pendingInitResolve?.(false)
        this.pendingInitResolve = null
        return
      }

      // Send the ACP initialize handshake from the renderer — persistent
      // listeners are already up, so the response cannot be missed.
      // Same pattern as acp-ui: acpClient.initialize() is called after connect().
      const initResult = await window.electronAPI.acpInitialize?.({
        sessionId: this.sessionId,
        workspacePath: this._workspacePath,
        filePath: this._filePath,
      })
      if (!initResult?.success && this.pendingInitResolve) {
        clearTimeout(this.initTimeoutId!)
        this.initTimeoutId = null
        this.pendingInitResolve(false)
        this.pendingInitResolve = null
      }
    })
  }

  // ── Message routing ────────────────────────────────────────────────────────

  private handleChunk(line: string): void {
    const event = parseAcpLine(line)

    // ── Phase 1: initialize response ───────────────────────────────────────
    if (event.type === 'init_result' && this._initPhase === 'initialize') {
      // Phase 1 done → send session/new to get models/modes
      this._initPhase = 'new_session'
      window.electronAPI.acpNewSession?.({
        sessionId: this.sessionId,
        cwd: this._workspacePath,
      }).then((result) => {
        if (!result?.success && this.pendingInitResolve) {
          clearTimeout(this.initTimeoutId!)
          this.initTimeoutId = null
          this.pendingInitResolve(false)
          this.pendingInitResolve = null
          this._initPhase = null
        }
      })
      return
    }

    // ── Phase 2: session/new response (models & modes in nested format) ───
    if (event.type === 'init_result' && this._initPhase === 'new_session') {
      this._initPhase = null
      // session/new result uses nested { availableModels: [{modelId,name}] }
      // Re-parse the raw line to extract the nested structure
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        const result = (obj.result ?? {}) as Record<string, unknown>
        // Store the ACP-internal session ID for use in session/prompt
        if (typeof result.sessionId === 'string') {
          this._acpSessionId = result.sessionId
        }
        const modelsObj = result.models as Record<string, unknown> | undefined
        const modesObj  = result.modes  as Record<string, unknown> | undefined
        const rawModels = (Array.isArray(modelsObj?.availableModels) ? modelsObj!.availableModels : []) as Array<Record<string, unknown>>
        const rawModes  = (Array.isArray(modesObj?.availableModes)   ? modesObj!.availableModes  : []) as Array<Record<string, unknown>>
        const models: AcpModelInfo[] = rawModels.map(m => ({
          id:   String(m.modelId ?? m.id ?? ''),
          name: String(m.name ?? m.modelId ?? m.id ?? ''),
          description: m.description != null ? String(m.description) : undefined,
        }))
        const modes: AcpModeInfo[] = rawModes.map(m => ({
          id:   String(m.id ?? ''),
          name: String(m.name ?? m.id ?? ''),
          description: m.description != null ? String(m.description) : undefined,
        }))
        // Track the agent's current (default) model/mode
        const currentModelId = typeof modelsObj?.currentModelId === 'string'
          ? modelsObj.currentModelId
          : (models[0]?.id ?? null)
        const currentModeId = typeof modesObj?.currentModeId === 'string'
          ? modesObj.currentModeId
          : (modes[0]?.id ?? null)
        this._agentCurrentModelId = currentModelId
        this._agentCurrentModeId = currentModeId
        this.onInit?.(models, modes, currentModelId, currentModeId)
      } catch {
        this.onInit?.([], [], null, null)
      }
      if (this.pendingInitResolve) {
        clearTimeout(this.initTimeoutId!)
        this.initTimeoutId = null
        this.pendingInitResolve(true)
        this.pendingInitResolve = null
      }
      return
    }

    // ── Route error to whichever handler is active ─────────────────────────
    if (event.type === 'error') {
      if (this.pendingInitResolve) {
        clearTimeout(this.initTimeoutId!)
        this.initTimeoutId = null
        this.pendingInitResolve(false)
        this.pendingInitResolve = null
      } else {
        this.activeStreamCallbacks?.onError(event.message)
        this.activeStreamCallbacks = null
      }
      return
    }

    // ── All other events go to the active stream ───────────────────────────
    if (!this.activeStreamCallbacks) return
    const { onChunk, onDone } = this.activeStreamCallbacks

    switch (event.type) {
      // ── Plain text delta ─────────────────────────────────────────────────
      case 'text':
        onChunk({ type: 'text', delta: event.content })
        break

      // ── Full session state update ────────────────────────────────────────
      case 'session_update': {
        // Extract text delta from the last assistant message
        const assistantMsg = [...event.messages]
          .reverse()
          .find((m: AcpSessionMessage) => m.role === 'assistant')

        if (assistantMsg) {
          const newContent = this.extractText(assistantMsg.content)
          if (newContent.length > this.prevAssistantContent.length) {
            onChunk({
              type: 'text',
              delta: newContent.slice(this.prevAssistantContent.length),
            })
            this.prevAssistantContent = newContent
          }
        }

        // Emit new tool calls not seen before
        let tcIndex = this.prevToolCallIds.size
        for (const tc of event.toolCalls) {
          if (!this.prevToolCallIds.has(tc.id)) {
            onChunk({
              type: 'tool_call_start',
              id: tc.id,
              name: tc.title ?? tc.id,
              index: tcIndex++,
            })
            onChunk({
              type: 'tool_call_delta',
              index: tcIndex - 1,
              argumentsDelta: JSON.stringify({
                path: tc.filePaths?.[0],
                kind: tc.kind,
              }),
            })
            this.prevToolCallIds.add(tc.id)
          }
        }

        // Bubble up dynamic models/modes if agent sent them
        if (event.models?.length || event.modes?.length) {
          this.onInit?.(event.models ?? [], event.modes ?? [], null, null)
        }

        if (event.done) {
          onDone('stop')
          this.activeStreamCallbacks = null
        }
        break
      }

      // ── Tool call (non-session/update path) ──────────────────────────────
      case 'tool_call':
        onChunk({ type: 'tool_call_start', id: event.id, name: event.name, index: 0 })
        onChunk({ type: 'tool_call_delta', index: 0, argumentsDelta: event.arguments })
        break

      // ── Permission request from agent ────────────────────────────────────
      case 'permission_request':
        this.onPermissionRequest?.(
          event.requestId,
          event.permission,
          event.path,
          event.description,
          event.options
        )
        break

      // ── Done ─────────────────────────────────────────────────────────────
      case 'done':
        onDone(event.stopReason ?? 'stop')
        this.activeStreamCallbacks = null
        break

      default:
        break
    }
  }

  private handleProcessDone(): void {
    this.activeStreamCallbacks?.onDone('stop')
    this.activeStreamCallbacks = null
  }

  private handleProcessError(message: string): void {
    if (this.pendingInitResolve) {
      clearTimeout(this.initTimeoutId!)
      this.initTimeoutId = null
      this.pendingInitResolve(false)
      this.pendingInitResolve = null
    } else {
      this.activeStreamCallbacks?.onError(message)
      this.activeStreamCallbacks = null
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private resetDeltaState() {
    this.prevAssistantContent = ''
    this.prevToolCallIds = new Set()
  }

  private async ensureLaunched(): Promise<boolean> {
    if (this.initialized) return true
    if (this.launching) {
      // Wait briefly for concurrent launch to complete
      await new Promise(r => setTimeout(r, 200))
      return this.initialized
    }

    if (!window.electronAPI.acpLaunch || !window.electronAPI.acpSend) {
      return false
    }

    this.launching = true
    try {
      const result = await window.electronAPI.acpLaunch({
        sessionId: this.sessionId,
        command: this.config.acpCommand ?? 'claude',
        args: this.config.acpArgs ? [...this.config.acpArgs] : [],
        env: this.config.acpEnv ? { ...this.config.acpEnv } : undefined,
        workspacePath: this._workspacePath,
        filePath: this._filePath,
      })

      if (result.success) {
        this.initialized = true
      }
      return result.success
    } finally {
      this.launching = false
    }
  }

  private async doStream(
    messages: LMMessage[],
    onChunk: (chunk: AgentChunk) => void,
    onDone: (stopReason: string) => void,
    onError: (error: string) => void,
    options?: AgentStreamOptions
  ): Promise<void> {
    this.resetDeltaState()

    const launched = await this.ensureLaunched()
    if (!launched) {
      onError('ACP agent 启动失败，请检查命令配置（acpCommand / acpArgs）。')
      return
    }

    // Set active stream callbacks — persistent listener routes events here
    this.activeStreamCallbacks = { onChunk, onDone, onError }

    // ── Send the message ───────────────────────────────────────────────────
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    const content = lastUserMsg?.content ?? ''

    const acpSessionId = this._acpSessionId ?? ''

    // Only call set_model/set_mode when the value has changed from what
    // the agent currently has — avoids redundant round-trips.
    const targetModel = options?.model ?? null
    const targetMode  = options?.mode  ?? null

    if (targetModel && targetModel !== this._agentCurrentModelId) {
      await window.electronAPI.acpSetModel?.({
        sessionId: this.sessionId,
        acpSessionId,
        modelId: targetModel,
      })
      this._agentCurrentModelId = targetModel
    }
    if (targetMode && targetMode !== this._agentCurrentModeId) {
      await window.electronAPI.acpSetMode?.({
        sessionId: this.sessionId,
        acpSessionId,
        modeId: targetMode,
      })
      this._agentCurrentModeId = targetMode
    }

    const sent = await window.electronAPI.acpSend?.({
      sessionId: this.sessionId,
      acpSessionId,
      content,
    })
    if (!sent?.success) {
      this.activeStreamCallbacks = null
      onError('向 ACP agent 发送消息失败。')
    }
  }

  /** Flatten a message's content (string or ContentBlock array) to plain text. */
  private extractText(content: string | unknown): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return (content as Array<{ type?: string; text?: string }>)
        .filter(c => c?.type === 'text' && typeof c.text === 'string')
        .map(c => c.text as string)
        .join('')
    }
    return ''
  }
}
