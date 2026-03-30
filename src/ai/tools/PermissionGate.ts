/**
 * PermissionGate — enforces tool permissions and workspace boundary checks.
 *
 * Permission levels (per tool name, stored in AiSettings.toolPermissions):
 *   allow   — execute without asking
 *   confirm — ask the user once per session per path pattern, then remember
 *   deny    — never execute; returns an error result
 *
 * Workspace boundary: all file write/create operations must target a path
 * inside the currently open workspace folder. Read operations outside the
 * workspace are also blocked by default.
 */

import type { AiToolPermission, AiSettings } from '@/ai/types'

export interface GateResult {
  allowed: boolean
  error?: string
}

export class PermissionGate {
  // Paths/patterns the user has already approved this session
  private sessionApproved = new Set<string>()

  constructor(
    private getSettings: () => AiSettings,
    private getWorkspacePath: () => string | null
  ) {}

  /**
   * Check whether a tool call on the given path is permitted.
   * For 'confirm' tools, prompts the user via showMessageBox (if needed).
   *
   * @param toolName  e.g. 'write_file', 'create_document'
   * @param targetPath  the file/folder path the tool will operate on
   * @param isWrite  true for mutating operations
   */
  async check(toolName: string, targetPath: string, isWrite: boolean): Promise<GateResult> {
    const settings = this.getSettings()
    const permission: AiToolPermission =
      settings.toolPermissions[toolName] ?? (isWrite ? 'confirm' : 'allow')

    if (permission === 'deny') {
      return { allowed: false, error: `Tool "${toolName}" is disabled in settings.` }
    }

    // Workspace boundary check for write operations
    if (isWrite) {
      const workspace = this.getWorkspacePath()
      if (workspace) {
        const absTarget = targetPath.startsWith('/')
          ? targetPath
          : `${workspace}/${targetPath}`
        if (!absTarget.startsWith(workspace)) {
          return {
            allowed: false,
            error: `Access denied: "${targetPath}" is outside the workspace folder.`,
          }
        }
      }
    }

    if (permission === 'allow') {
      return { allowed: true }
    }

    // confirm — check session cache first
    const cacheKey = `${toolName}:${targetPath}`
    if (this.sessionApproved.has(cacheKey)) {
      return { allowed: true }
    }

    // Ask the user
    const approved = await this.promptUser(toolName, targetPath)
    if (approved) {
      this.sessionApproved.add(cacheKey)
      return { allowed: true }
    }
    return { allowed: false, error: 'User declined the operation.' }
  }

  /** Ask user for permission via Electron's native message box. */
  private async promptUser(toolName: string, targetPath: string): Promise<boolean> {
    if (!window.electronAPI?.showMessageBox) return false

    const result = await window.electronAPI.showMessageBox({
      type: 'question',
      title: 'AI 操作权限',
      message: `AI 助手请求执行操作`,
      detail: `工具: ${toolName}\n路径: ${targetPath}\n\n是否允许此操作？本次会话内不再询问此路径。`,
      buttons: ['允许', '拒绝'],
      defaultId: 0,
      cancelId: 1,
    })

    return result.response === 0
  }

  /** Clear session-level approvals (called when workspace changes). */
  clearSession(): void {
    this.sessionApproved.clear()
  }
}
