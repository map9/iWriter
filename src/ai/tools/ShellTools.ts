/**
 * ShellTools — executes read-only shell commands via the Electron IPC bridge.
 *
 * Only read-only commands are permitted (enforced in the main process).
 * Results are truncated to prevent overly large tool responses.
 */

import type { ToolRegistry } from './registry'

export function registerShellTools(registry: ToolRegistry, getWorkspace: () => string | null): void {
  registry.register('exec_shell', async (args) => {
    const command = String(args.command ?? '')
    // Default cwd to the workspace folder so relative paths (e.g. "find . ...") work correctly
    const cwd = args.cwd !== undefined ? String(args.cwd) : (getWorkspace() ?? undefined)

    if (!command.trim()) return 'Error: command must not be empty.'

    console.log('[exec_shell]', { command, cwd })
    const result = await window.electronAPI.execShell(command, cwd)
    console.log('[exec_shell result]', { exitCode: result.exitCode, stdout: result.stdout.slice(0, 500), stderr: result.stderr.slice(0, 200) })
    const output = result.stdout || result.stderr || '(no output)'
    if (result.exitCode !== 0 && result.stderr) {
      return `Exit code ${result.exitCode}\n${result.stderr}`
    }
    return output
  })
}
