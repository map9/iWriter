/**
 * AcpManager — manages external ACP (Agent Client Protocol) agent processes.
 *
 * ACP is Zed's open JSON-RPC protocol over stdin/stdout for integrating
 * external CLI agents (e.g. Claude Code, Gemini CLI) into the editor UI.
 *
 * This module:
 *  1. Spawns the external agent as a child process.
 *  2. Sends ACP JSON-RPC messages to its stdin.
 *  3. Reads response lines from its stdout and forwards them to the renderer
 *     via webContents.send().
 *  4. Manages process lifecycle (start, cancel, cleanup).
 *
 * IPC channels (renderer → main):
 *  acp:launch            — spawn an agent process
 *  acp:send              — send a user message to a running session
 *  acp:cancel            — kill a session's process
 *  acp:permission-respond — reply to an agent's permission request
 *
 * Push events (main → renderer):
 *  acp:chunk             — { sessionId, data: string }  (a stdout line)
 *  acp:done              — { sessionId, exitCode? }
 *  acp:error             — { sessionId, message: string }
 */

import { ipcMain, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'

export const PROTOCOL_VERSION = 1

interface AcpSession {
  sessionId: string
  process: ChildProcess
  senderWindowId: number
}

interface AcpInitMessage {
  jsonrpc: '2.0'
  id: number
  method: 'initialize'
  params: {
    protocolVersion: number
    clientCapabilities: {
      fs: { readTextFile: boolean; writeTextFile: boolean }
    }
    clientInfo: { name: string; title: string; version: string }
  }
}

interface AcpPromptMessage {
  jsonrpc: '2.0'
  id: number
  method: 'session/prompt'
  params: {
    sessionId: string
    prompt: Array<{ type: 'text'; text: string }>
  }
}

interface AcpPermissionResponse {
  jsonrpc: '2.0'
  id: number
  result: {
    response: string   // 'allow_once' | 'allow_always' | 'deny'
  }
}

export class AcpManager {
  private sessions: Map<string, AcpSession>
  private msgCounter: number

  constructor() {
    this.sessions = new Map<string, AcpSession>()
    this.msgCounter = 0
    this.setupIpcHandlers()
  }

  /**
   * Resolve the login shell to use for spawning agent processes.
   *
   * On macOS/Linux, agent CLIs (claude, gemini, npx) are installed into paths
   * that are only available after the user's shell profile is sourced (login shell).
   * Wrapping with `-l -c` ensures PATH, nvm shims, etc. are all available.
   */
  private resolveShell(): { shell: string; shellArgs: string[] } {
    if (process.platform === 'win32') {
      return { shell: 'cmd.exe', shellArgs: ['/C'] }
    }
    const shellPath = process.env.SHELL || '/bin/zsh'
    const shellName = path.basename(shellPath)
    const loginShells = ['bash', 'zsh', 'ksh']
    const shellArgs = loginShells.includes(shellName) ? ['-l', '-c'] : ['-c']
    return { shell: shellPath, shellArgs }
  }

  setupIpcHandlers(): void {
    // ── Launch an agent process ──────────────────────────────────────────────
    ipcMain.handle(
      'acp:launch',
      async (
        event,
        params: {
          sessionId: string
          command: string
          args: string[]
          env?: Record<string, string>
          workspacePath: string | null
          filePath: string | null
        }
      ) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return { success: false, error: 'No window' }
        return this.launchSession(params, win.id)
      }
    )

    // ── Send a message to a running session ──────────────────────────────────
    ipcMain.handle(
      'acp:send',
      async (
        _event,
        params: {
          sessionId: string
          acpSessionId: string
          content: string
        }
      ) => {
        return this.sendMessage(params.sessionId, params.acpSessionId, params.content)
      }
    )

    // ── Set model for a running session ──────────────────────────────────────
    ipcMain.handle(
      'acp:set-model',
      async (
        _event,
        params: { sessionId: string; acpSessionId: string; modelId: string }
      ) => {
        return this.setModel(params.sessionId, params.acpSessionId, params.modelId)
      }
    )

    // ── Set mode for a running session ───────────────────────────────────────
    ipcMain.handle(
      'acp:set-mode',
      async (
        _event,
        params: { sessionId: string; acpSessionId: string; modeId: string }
      ) => {
        return this.setMode(params.sessionId, params.acpSessionId, params.modeId)
      }
    )

    // ── Send ACP initialize handshake (called by renderer after spawn) ───────
    ipcMain.handle(
      'acp:initialize',
      async (
        _event,
        params: {
          sessionId: string
          workspacePath: string | null
          filePath: string | null
        }
      ) => {
        const session = this.sessions.get(params.sessionId)
        if (!session) return { success: false, error: 'Session not found' }

        console.log(`[AcpManager] acp:initialize for session ${params.sessionId}`)
        const initMsg: AcpInitMessage = {
          jsonrpc: '2.0',
          id: ++this.msgCounter,
          method: 'initialize',
          params: {
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
            clientInfo: { name: 'iWriter', title: 'iWriter', version: '1.0.0' },
          },
        }
        this.writeToProcess(session.process, initMsg)
        return { success: true }
      }
    )

    // ── Send ACP session/new (called after initialize to get models/modes) ───
    ipcMain.handle(
      'acp:newSession',
      async (_event, params: { sessionId: string; cwd: string | null }) => {
        const session = this.sessions.get(params.sessionId)
        if (!session) return { success: false, error: 'Session not found' }

        console.log(`[AcpManager] acp:newSession for session ${params.sessionId}`)
        const newSessionMsg = {
          jsonrpc: '2.0',
          id: ++this.msgCounter,
          method: 'session/new',
          params: { cwd: params.cwd || '', mcpServers: [] },
        }
        this.writeToProcess(session.process, newSessionMsg)
        return { success: true }
      }
    )

    // ── Cancel / kill a session ──────────────────────────────────────────────
    ipcMain.handle('acp:cancel', async (_event, sessionId: string) => {
      return this.cancelSession(sessionId)
    })

    // ── Reply to an agent's session/request_permission ──────────────────────
    ipcMain.handle(
      'acp:permission-respond',
      async (
        _event,
        params: { sessionId: string; requestId: number; response: string }
      ) => {
        return this.sendPermissionResponse(
          params.sessionId,
          params.requestId,
          params.response
        )
      }
    )

    // ── Send a JSON-RPC response to the agent for an fs/read or fs/write request ──
    ipcMain.handle(
      'acp:fs-respond',
      async (
        _event,
        params: {
          sessionId: string
          requestId: number
          result?: unknown
          error?: { code: number; message: string }
        }
      ) => {
        return this.sendFsResponse(
          params.sessionId,
          params.requestId,
          params.result,
          params.error
        )
      }
    )
  }

  private launchSession(
    params: {
      sessionId: string
      command: string
      args: string[]
      env?: Record<string, string>
      workspacePath: string | null
      filePath: string | null
    },
    windowId: number
  ): { success: boolean; error?: string } {
    if (this.sessions.has(params.sessionId)) {
      return { success: false, error: 'Session already exists' }
    }

    let proc: ChildProcess
    try {
      const { shell, shellArgs } = this.resolveShell()
      // Build the full command string; shell handles PATH resolution (nvm shims, homebrew, etc.)
      const cmdParts = [params.command, ...(params.args ?? [])]
      const cmdString = cmdParts.join(' ')
      const customEnv = params.env ?? {}
      console.log(`[AcpManager] spawn: ${shell} ${[...shellArgs, cmdString].map(a => JSON.stringify(a)).join(' ')}`)
      console.log(`[AcpManager] env.PATH=${process.env.PATH}`)
      if (Object.keys(customEnv).length > 0) {
        console.log(`[AcpManager] custom env:`, customEnv)
      }
      proc = spawn(shell, [...shellArgs, cmdString], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(params.env ?? {}) },
      })
    } catch (err) {
      return {
        success: false,
        error: `Failed to spawn "${params.command}": ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const session: AcpSession = {
      sessionId: params.sessionId,
      process: proc,
      senderWindowId: windowId,
    }
    this.sessions.set(params.sessionId, session)

    // NOTE: We do NOT send `initialize` here.
    // The renderer sends it explicitly via acp:initialize after setting up
    // persistent listeners — same pattern as acp-ui's agent.rs spawn_agent().

    // ── Forward stdout lines to renderer ─────────────────────────────────────
    let buffer = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        console.log(`[AcpManager] stdout (${params.sessionId}):`, trimmed.slice(0, 200))
        this.sendToRenderer(windowId, 'acp:chunk', {
          sessionId: params.sessionId,
          data: trimmed,
        })
      }
    })

    // Forward stderr lines to renderer for startup progress tracking
    let stderrBuffer = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString()
      const lines = stderrBuffer.split('\n')
      stderrBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        console.warn(`[AcpManager] stderr (${params.sessionId}):`, trimmed)
        this.sendToRenderer(windowId, 'acp:stderr', {
          sessionId: params.sessionId,
          line: trimmed,
        })
      }
    })

    proc.on('close', code => {
      this.sessions.delete(params.sessionId)
      this.sendToRenderer(windowId, 'acp:done', {
        sessionId: params.sessionId,
        exitCode: code,
      })
    })

    proc.on('error', err => {
      this.sessions.delete(params.sessionId)
      const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
      const message = isNotFound
        ? `命令 "${params.command}" 未找到。` +
          (params.command !== 'npx'
            ? `请先安装对应 CLI（如：npm install -g @anthropic-ai/claude-code），或在 Provider 设置中改用 npx 方式。`
            : '请确认 Node.js 已正确安装并在 PATH 中。')
        : err.message
      this.sendToRenderer(windowId, 'acp:error', {
        sessionId: params.sessionId,
        message,
      })
    })

    return { success: true }
  }

  private sendMessage(
    sessionId: string,
    acpSessionId: string,
    content: string
  ): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) return { success: false, error: 'Session not found' }

    const msg: AcpPromptMessage = {
      jsonrpc: '2.0',
      id: ++this.msgCounter,
      method: 'session/prompt',
      params: {
        sessionId: acpSessionId,
        prompt: [{ type: 'text', text: content }],
      },
    }
    this.writeToProcess(session.process, msg)
    return { success: true }
  }

  private setModel(
    sessionId: string,
    acpSessionId: string,
    modelId: string
  ): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) return { success: false, error: 'Session not found' }

    const msg = {
      jsonrpc: '2.0',
      id: ++this.msgCounter,
      method: 'session/set_model',
      params: { sessionId: acpSessionId, modelId },
    }
    this.writeToProcess(session.process, msg)
    return { success: true }
  }

  private setMode(
    sessionId: string,
    acpSessionId: string,
    modeId: string
  ): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) return { success: false, error: 'Session not found' }

    const msg = {
      jsonrpc: '2.0',
      id: ++this.msgCounter,
      method: 'session/set_mode',
      params: { sessionId: acpSessionId, modeId },
    }
    this.writeToProcess(session.process, msg)
    return { success: true }
  }

  private sendPermissionResponse(
    sessionId: string,
    requestId: number,
    response: string
  ): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) return { success: false, error: 'Session not found' }

    const msg: AcpPermissionResponse = {
      jsonrpc: '2.0',
      id: requestId,
      result: { response },
    }
    this.writeToProcess(session.process, msg)
    return { success: true }
  }

  private sendFsResponse(
    sessionId: string,
    requestId: number,
    result?: unknown,
    error?: { code: number; message: string }
  ): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) return { success: false, error: 'Session not found' }

    const msg = error
      ? { jsonrpc: '2.0', id: requestId, error }
      : { jsonrpc: '2.0', id: requestId, result: result ?? null }

    this.writeToProcess(session.process, msg)
    return { success: true }
  }

  private cancelSession(sessionId: string): { success: boolean } {
    const session = this.sessions.get(sessionId)
    if (!session) return { success: false }
    try { session.process.kill('SIGTERM') } catch { /* ignore */ }
    this.sessions.delete(sessionId)
    return { success: true }
  }

  private writeToProcess(proc: ChildProcess, msg: unknown): void {
    try {
      proc.stdin?.write(JSON.stringify(msg) + '\n')
    } catch {
      // Process may have already exited
    }
  }

  private sendToRenderer(windowId: number, channel: string, data: unknown): void {
    const win = BrowserWindow.fromId(windowId)
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }

  destroy(): void {
    for (const session of this.sessions.values()) {
      try { session.process.kill() } catch { /* ignore */ }
    }
    this.sessions.clear()
    ipcMain.removeHandler('acp:launch')
    ipcMain.removeHandler('acp:initialize')
    ipcMain.removeHandler('acp:newSession')
    ipcMain.removeHandler('acp:send')
    ipcMain.removeHandler('acp:set-model')
    ipcMain.removeHandler('acp:set-mode')
    ipcMain.removeHandler('acp:cancel')
    ipcMain.removeHandler('acp:permission-respond')
    ipcMain.removeHandler('acp:fs-respond')
  }
}
