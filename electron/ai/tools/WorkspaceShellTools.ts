import { exec } from 'child_process'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const ALLOWED_PREFIXES = new Set([
  'ls', 'dir', 'find', 'cat', 'head', 'tail', 'grep',
  'wc', 'pwd', 'echo', 'file', 'stat', 'type', 'findstr', 'where',
])

function getRuntimeConfigurable(runtime: unknown): Record<string, unknown> {
  return ((runtime as { config?: { configurable?: Record<string, unknown> } })?.config?.configurable) ?? {}
}

function isWithinWorkspace(workspacePath: string, candidatePath: string): boolean {
  const workspace = path.resolve(workspacePath)
  const candidate = path.resolve(candidatePath)
  return candidate === workspace || candidate.startsWith(`${workspace}${path.sep}`)
}

function extractAbsolutePaths(command: string): string[] {
  const matches = new Set<string>()
  const quoted = /(["'])(\/[^"'`]+)\1/g
  const unquoted = /(^|[\s(])(?:\.?\.?\/)?(\/[^\s"'`|&;()<>]+)/g

  let match: RegExpExecArray | null = null
  while ((match = quoted.exec(command)) !== null) {
    matches.add(match[2])
  }
  while ((match = unquoted.exec(command)) !== null) {
    const value = match[2]
    if (value.startsWith('/')) matches.add(value)
  }

  return Array.from(matches)
}

export function buildWorkspaceShellTools() {
  const execShell = tool(
    async ({ command, cwd }: { command: string; cwd?: string }, runtime) => {
      const trimmed = command.trim()
      if (!trimmed) {
        return 'Error: command must not be empty.'
      }

      const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() ?? ''
      if (!ALLOWED_PREFIXES.has(firstWord)) {
        return `Error: command not permitted: "${firstWord}". Allowed: ${Array.from(ALLOWED_PREFIXES).join(', ')}`
      }

      const configurable = getRuntimeConfigurable(runtime)
      const runtimeWorkspace = typeof configurable.workspace_path === 'string' ? configurable.workspace_path : ''
      if (!runtimeWorkspace) {
        return 'Error: No workspace is available for exec_shell.'
      }

      const resolvedCwd = path.resolve(cwd?.trim() || runtimeWorkspace)
      if (!isWithinWorkspace(runtimeWorkspace, resolvedCwd)) {
        return `Error: cwd must stay inside the workspace: "${runtimeWorkspace}".`
      }

      const absolutePaths = extractAbsolutePaths(trimmed)
      const outsidePath = absolutePaths.find(candidate => !isWithinWorkspace(runtimeWorkspace, candidate))
      if (outsidePath) {
        return `Error: command references a path outside the workspace: "${outsidePath}".`
      }

      return new Promise<string>(resolve => {
        exec(trimmed, { cwd: resolvedCwd, timeout: 5000 }, (error, stdout, stderr) => {
          const exitCode = error?.code ?? 0
          const safeStdout = stdout.slice(0, 20000)
          const safeStderr = stderr.slice(0, 2000)
          if (exitCode !== 0) {
            resolve(`Exit code ${exitCode}\n${safeStderr || safeStdout || '(no output)'}`)
            return
          }
          resolve(safeStdout || safeStderr || '(no output)')
        })
      })
    },
    {
      name: 'exec_shell',
      description:
        'Run a read-only shell command for workspace discovery and inspection. ' +
        'Use this for commands like ls, find, grep, pwd, head, tail, or cat when you need to locate files or inspect plain text safely.',
      schema: z.object({
        command: z.string().describe('Read-only shell command to execute.'),
        cwd: z.string().optional().describe('Optional working directory. Defaults to the current workspace path.'),
      }),
    }
  )

  return [execShell] as const
}
