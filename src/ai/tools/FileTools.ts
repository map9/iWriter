/**
 * FileTools — executes file-operation tool calls via the existing Electron IPC bridge.
 *
 * All methods return a string result (success content or error message) for
 * feeding back to the LLM as a tool result.
 */

import type { PermissionGate } from './PermissionGate'

// Simple path utilities for renderer (avoids external path polyfill dependency)
function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/').replace(/\/$/, '') || '/'
}
function basename(p: string): string {
  return p.split('/').pop() ?? p
}
function dirname(p: string): string {
  const parts = p.split('/')
  parts.pop()
  return parts.join('/') || '/'
}

export class FileTools {
  constructor(
    private gate: PermissionGate,
    private getWorkspacePath: () => string | null
  ) {}

  async readFile(relativePath: string): Promise<string> {
    const absPath = this.resolvePath(relativePath)
    if (!absPath) return 'Error: No workspace folder is open.'

    const result = await window.electronAPI.readFile(absPath)
    if (result === null) return `Error: Could not read file "${relativePath}".`
    return result
  }

  async listDirectory(relativePath: string): Promise<string> {
    const absPath = this.resolvePath(relativePath)
    if (!absPath) return 'Error: No workspace folder is open.'

    const files = await window.electronAPI.getFiles(absPath)
    if (!files) return `Error: Could not list directory "${relativePath}".`

    const lines = files.map(f => {
      const label = f.isDirectory ? `${f.name}/` : f.name
      return `  ${label}`
    })
    return lines.length ? lines.join('\n') : '(empty directory)'
  }

  async writeFile(relativePath: string, content: string): Promise<string> {
    const absPath = this.resolvePath(relativePath)
    if (!absPath) return 'Error: No workspace folder is open.'

    const { allowed, error } = await this.gate.check('write_file', absPath, true)
    if (!allowed) return `Error: ${error}`

    const ok = await window.electronAPI.saveFile(content, absPath)
    return ok ? `File written successfully: ${relativePath}` : `Error: Failed to write "${relativePath}".`
  }

  async createDocument(
    fileName: string,
    content: string,
    _description?: string
  ): Promise<string> {
    const workspace = this.getWorkspacePath()
    if (!workspace) return 'Error: No workspace folder is open.'

    // Reject path traversal attempts
    if (fileName.includes('/') || fileName.includes('..')) {
      return 'Error: File name must not contain path separators.'
    }

    const absPath = joinPath(workspace, fileName)
    const { allowed, error } = await this.gate.check('create_document', absPath, true)
    if (!allowed) return `Error: ${error}`

    // Check if file already exists
    const exists = await window.electronAPI.pathExists(absPath)
    if (exists) return `Error: File "${fileName}" already exists.`

    const folder = dirname(absPath)
    const name = basename(absPath)
    const createdPath = await window.electronAPI.createFile(folder, name)
    if (!createdPath) return `Error: Failed to create "${fileName}".`

    // Write initial content
    const ok = await window.electronAPI.saveFile(content, createdPath)
    return ok
      ? `Document created successfully: ${fileName}`
      : `File created but content write failed: ${fileName}`
  }

  private resolvePath(relativePath: string): string | null {
    const workspace = this.getWorkspacePath()
    if (!workspace) return null
    if (relativePath === '.' || relativePath === '') return workspace
    return joinPath(workspace, relativePath)
  }
}
