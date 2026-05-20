import * as fs from 'fs'
import * as path from 'path'
import { execFile, type ExecFileException } from 'child_process'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { IWriterAgentContext } from '../runtime/AgentContext'
import { isInside } from './CreativeTools'

const MAX_BUFFER = 20 * 1024 * 1024
const READ_TIMEOUT_MS = 15000
const WRITE_TIMEOUT_MS = 30000

type GitErrorCode =
  | 'NOT_A_REPO'
  | 'GIT_NOT_INSTALLED'
  | 'AUTHOR_NOT_CONFIGURED'
  | 'INDEX_LOCKED'
  | 'GIT_TIMEOUT'
  | 'COMMAND_FAILED'

type GitResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; errorCode: GitErrorCode; message: string }

function getWorkspacePath(runtime: unknown, fallbackWorkspacePath?: string | null): string | null {
  const wp = (runtime as { context?: IWriterAgentContext } | undefined)?.context?.workspacePath
  return wp?.trim() || fallbackWorkspacePath || null
}

function ensureWorkspace(workspacePath: string | null): string | null {
  if (!workspacePath) return null
  return path.resolve(workspacePath)
}

function gitError(errorCode: GitErrorCode, message: string): GitResult {
  return { ok: false, errorCode, message }
}

function formatGitError(result: Extract<GitResult, { ok: false }>): string {
  return JSON.stringify({ ok: false, errorCode: result.errorCode, message: result.message }, null, 2)
}

function commandFailureMessage(error: ExecFileException, stderr: string): string {
  if (error.killed || /timed out/i.test(error.message)) return 'Git command timed out.'
  const clean = stderr.trim() || error.message
  if (/index\.lock/i.test(clean)) return 'Git index is locked by another process.'
  return clean.split(/\r?\n/).slice(0, 4).join('\n')
}

function runGit(workspacePath: string, args: string[], timeout: number): Promise<GitResult> {
  return new Promise(resolve => {
    execFile('git', args, {
      cwd: workspacePath,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      timeout,
    }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ ok: true, stdout, stderr })
        return
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve(gitError('GIT_NOT_INSTALLED', 'git binary not found on PATH'))
        return
      }
      const message = commandFailureMessage(error, stderr)
      if (message === 'Git command timed out.') {
        resolve(gitError('GIT_TIMEOUT', message))
        return
      }
      if (message === 'Git index is locked by another process.') {
        resolve(gitError('INDEX_LOCKED', message))
        return
      }
      resolve(gitError('COMMAND_FAILED', message))
    })
  })
}

async function preflightGit(workspacePath: string, timeout = READ_TIMEOUT_MS): Promise<GitResult> {
  if (!fs.existsSync(path.join(workspacePath, '.git'))) {
    return gitError('NOT_A_REPO', 'Not a git repository — git tools require the workspace to be initialized with git init.')
  }
  return runGit(workspacePath, ['--version'], timeout)
}

function resolveGitFile(workspacePath: string, file: string): { ok: true; relativePath: string } | { ok: false; message: string } {
  const trimmed = file.trim()
  if (!trimmed) return { ok: false, message: 'Git file path cannot be empty.' }
  if (path.isAbsolute(trimmed) || trimmed.startsWith('~') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { ok: false, message: 'Git file paths must be relative to the workspace.' }
  }
  if (trimmed.split(/[\\/]+/).includes('..')) {
    return { ok: false, message: 'Git file paths cannot contain "..".' }
  }
  const resolved = path.resolve(workspacePath, trimmed)
  if (!isInside(workspacePath, resolved)) {
    return { ok: false, message: 'Git file path escapes the workspace.' }
  }
  return { ok: true, relativePath: path.relative(workspacePath, resolved).replace(/\\/g, '/') }
}

function isSafeGitRef(ref: string): boolean {
  const trimmed = ref.trim()
  return !!trimmed && !trimmed.startsWith('-') && !/[\s\0-\x1f]/.test(trimmed)
}

async function ensureAuthorConfigured(workspacePath: string): Promise<GitResult | null> {
  const name = await runGit(workspacePath, ['config', 'user.name'], READ_TIMEOUT_MS)
  const email = await runGit(workspacePath, ['config', 'user.email'], READ_TIMEOUT_MS)
  if (!name.ok || !email.ok || !name.stdout.trim() || !email.stdout.trim()) {
    return gitError('AUTHOR_NOT_CONFIGURED', 'Git is not configured with an author identity. Run `git config user.name` and `git config user.email` first.')
  }
  return null
}

function parseStatus(output: string) {
  const staged: string[] = []
  const unstaged: string[] = []
  const untracked: string[] = []
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const code = line.slice(0, 2)
    const file = line.slice(3).trim()
    if (!file) continue
    if (code === '??') {
      untracked.push(file)
      continue
    }
    if (code[0] && code[0] !== ' ') staged.push(file)
    if (code[1] && code[1] !== ' ') unstaged.push(file)
  }
  return { staged, unstaged, untracked }
}

export function getLastGitTagInfo(workspacePath: string): Promise<{
  last_git_tag: { name: string; commit: string; message: string } | null
  commits_since_last_tag: number | null
}> {
  return (async () => {
    if (!fs.existsSync(path.join(workspacePath, '.git'))) {
      return { last_git_tag: null, commits_since_last_tag: null }
    }
    const tag = await runGit(workspacePath, ['describe', '--tags', '--abbrev=0'], READ_TIMEOUT_MS)
    if (!tag.ok || !tag.stdout.trim()) return { last_git_tag: null, commits_since_last_tag: null }
    const tagName = tag.stdout.trim()
    const commit = await runGit(workspacePath, ['rev-list', '-n', '1', tagName], READ_TIMEOUT_MS)
    const message = await runGit(workspacePath, ['tag', '-l', tagName, '--format=%(contents)'], READ_TIMEOUT_MS)
    const count = await runGit(workspacePath, ['rev-list', `${tagName}..HEAD`, '--count'], READ_TIMEOUT_MS)
    return {
      last_git_tag: {
        name: tagName,
        commit: commit.ok ? commit.stdout.trim() : '',
        message: message.ok ? message.stdout.trim() : '',
      },
      commits_since_last_tag: count.ok ? Number(count.stdout.trim()) : null,
    }
  })()
}

export function buildCreativeGitTools(options: {
  workspacePath?: string | null
}) {
  const resolveWorkspace = (runtime: unknown): string | null =>
    ensureWorkspace(getWorkspacePath(runtime, options.workspacePath))

  const gitStatus = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const preflight = await preflightGit(workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      const result = await runGit(workspacePath, ['status', '--porcelain=v1'], READ_TIMEOUT_MS)
      if (!result.ok) return formatGitError(result)
      return JSON.stringify({ ok: true, ...parseStatus(result.stdout) }, null, 2)
    },
    {
      name: 'git_status',
      description: 'Read git status for the creative workspace. Returns staged, unstaged, and untracked file lists.',
      schema: z.object({}),
    }
  )

  const gitLog = tool(
    async ({ limit }: { limit?: number }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const preflight = await preflightGit(workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      const safeLimit = String(Math.max(1, Math.min(limit ?? 10, 50)))
      const result = await runGit(workspacePath, ['log', `-n${safeLimit}`, '--date=iso-strict', '--pretty=format:%h%x09%H%x09%ad%x09%s'], READ_TIMEOUT_MS)
      if (!result.ok) return formatGitError(result)
      const commits = result.stdout.split(/\r?\n/).filter(Boolean).map(line => {
        const [shortHash, hash, date, ...messageParts] = line.split('\t')
        return { shortHash, hash, date, message: messageParts.join('\t') }
      })
      return JSON.stringify({ ok: true, commits }, null, 2)
    },
    {
      name: 'git_log',
      description: 'Read recent git commits for the creative workspace.',
      schema: z.object({
        limit: z.number().optional().describe('Number of commits to return. Default 10, max 50.'),
      }),
    }
  )

  const gitDiff = tool(
    async ({ from, to }: { from?: string; to?: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const preflight = await preflightGit(workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      if (to && !from) return formatGitError(gitError('COMMAND_FAILED', 'git_diff requires from when to is provided.'))
      if ((from && !isSafeGitRef(from)) || (to && !isSafeGitRef(to))) {
        return formatGitError(gitError('COMMAND_FAILED', 'git_diff refs cannot be empty, whitespace, or option-like values.'))
      }
      const args = from && to ? ['diff', from, to] : from ? ['diff', from] : ['diff']
      const result = await runGit(workspacePath, args, READ_TIMEOUT_MS)
      if (!result.ok) return formatGitError(result)
      return result.stdout || 'No diff.'
    },
    {
      name: 'git_diff',
      description: 'Read git diff. Defaults to unstaged diff; accepts an optional from/to ref range.',
      schema: z.object({
        from: z.string().optional().describe('Optional base commit or ref.'),
        to: z.string().optional().describe('Optional head commit or ref. Requires from.'),
      }),
    }
  )

  const gitCommit = tool(
    async ({ message, files }: { message: string; files?: string[] }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const preflight = await preflightGit(workspacePath, WRITE_TIMEOUT_MS)
      if (!preflight.ok) return formatGitError(preflight)
      if (fs.existsSync(path.join(workspacePath, '.git', 'index.lock'))) {
        return formatGitError(gitError('INDEX_LOCKED', 'Git index is locked by another process.'))
      }
      const authorError = await ensureAuthorConfigured(workspacePath)
      if (authorError) return formatGitError(authorError as Extract<GitResult, { ok: false }>)
      const cleanMessage = message.trim()
      if (!cleanMessage) return formatGitError(gitError('COMMAND_FAILED', 'Commit message is required.'))
      const requestedFiles = files?.length ? files : ['storybible.md', 'draft/']
      const resolvedFiles: string[] = []
      for (const file of requestedFiles) {
        const resolved = resolveGitFile(workspacePath, file)
        if (!resolved.ok) return formatGitError(gitError('COMMAND_FAILED', resolved.message))
        resolvedFiles.push(resolved.relativePath)
      }
      const add = await runGit(workspacePath, ['add', '--', ...resolvedFiles], WRITE_TIMEOUT_MS)
      if (!add.ok) return formatGitError(add)
      const staged = await runGit(workspacePath, ['diff', '--cached', '--name-only'], READ_TIMEOUT_MS)
      if (!staged.ok) return formatGitError(staged)
      if (!staged.stdout.trim()) {
        return formatGitError(gitError('COMMAND_FAILED', 'No staged changes to commit.'))
      }
      const commit = await runGit(workspacePath, ['commit', '-m', cleanMessage], WRITE_TIMEOUT_MS)
      if (!commit.ok) return formatGitError(commit)
      return JSON.stringify({
        ok: true,
        message: cleanMessage,
        files: staged.stdout.trim().split(/\r?\n/).filter(Boolean),
        output: commit.stdout.trim(),
      }, null, 2)
    },
    {
      name: 'git_commit',
      description: 'Stage selected creative files and create a git commit after user approval. Defaults to storybible.md and draft/.',
      schema: z.object({
        message: z.string().describe('Commit message. The user may edit this before approval.'),
        files: z.array(z.string()).optional().describe('Workspace-relative files or directories to stage. Default ["storybible.md", "draft/"].'),
      }),
    }
  )

  const gitTag = tool(
    async ({ name, message }: { name: string; message?: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const preflight = await preflightGit(workspacePath, WRITE_TIMEOUT_MS)
      if (!preflight.ok) return formatGitError(preflight)
      if (fs.existsSync(path.join(workspacePath, '.git', 'index.lock'))) {
        return formatGitError(gitError('INDEX_LOCKED', 'Git index is locked by another process.'))
      }
      const tagName = name.trim()
      if (!tagName) return formatGitError(gitError('COMMAND_FAILED', 'Tag name is required.'))
      if (!isSafeGitRef(tagName)) return formatGitError(gitError('COMMAND_FAILED', 'Invalid tag name.'))
      const check = await runGit(workspacePath, ['check-ref-format', '--allow-onelevel', `refs/tags/${tagName}`], READ_TIMEOUT_MS)
      if (!check.ok) return formatGitError(gitError('COMMAND_FAILED', 'Invalid tag name.'))
      const result = await runGit(workspacePath, ['tag', '-a', tagName, '-m', message?.trim() || tagName], WRITE_TIMEOUT_MS)
      if (!result.ok) return formatGitError(result)
      const latest = await getLastGitTagInfo(workspacePath)
      return JSON.stringify({ ok: true, name: tagName, ...latest }, null, 2)
    },
    {
      name: 'git_tag',
      description: 'Create an annotated git tag for the current HEAD after user approval.',
      schema: z.object({
        name: z.string().describe('Tag name, e.g. arc1-complete.'),
        message: z.string().optional().describe('Optional annotated tag message.'),
      }),
    }
  )

  return [gitStatus, gitLog, gitDiff, gitCommit, gitTag] as const
}
