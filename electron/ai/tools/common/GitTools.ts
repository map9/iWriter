import * as fs from 'fs'
import * as path from 'path'
import { execFile, type ExecFileException } from 'child_process'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { IWriterAgentContext } from '../../runtime/AgentContext'

// Generalized git tools (B1): moved from the storybible-specific CreativeGitTools to the
// common tool面, workspace-generic (no storybible.md/draft defaults). Adds git_init and
// git_restore (04.4 §3 / FR-1.6 / FR-6.4). Version tracking operates on the markdown object
// tree at the workspace root; derived AI artifacts under `.iwriter/` are gitignored.

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

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function getWorkspacePath(runtime: unknown, fallbackWorkspacePath?: string | null): string | null {
  const wp = (runtime as { context?: IWriterAgentContext } | undefined)?.context?.workspacePath
  return wp?.trim() || fallbackWorkspacePath || null
}

function ensureWorkspace(workspacePath: string | null): string | null {
  if (!workspacePath) return null
  return path.resolve(workspacePath)
}

function gitError(errorCode: GitErrorCode, message: string): Extract<GitResult, { ok: false }> {
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
    return gitError('NOT_A_REPO', 'Not a git repository — call git_init first to start version tracking.')
  }
  return runGit(workspacePath, ['--version'], timeout)
}

function resolveGitFile(workspacePath: string, file: string): { ok: true; relativePath: string } | { ok: false; message: string } {
  const trimmed = file.trim()
  if (!trimmed) return { ok: false, message: 'Git file path cannot be empty.' }
  if (trimmed === '.') return { ok: true, relativePath: '.' }
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

const NO_WORKSPACE = 'Error: this action requires an open workspace folder.'

export function buildGitTools(options: {
  workspacePath?: string | null
}) {
  const resolveWorkspace = (runtime: unknown): string | null =>
    ensureWorkspace(getWorkspacePath(runtime, options.workspacePath))

  const gitInit = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return NO_WORKSPACE
      if (fs.existsSync(path.join(workspacePath, '.git'))) {
        return JSON.stringify({ ok: true, already_initialized: true, message: 'Workspace is already a git repository.' }, null, 2)
      }
      const init = await runGit(workspacePath, ['init'], WRITE_TIMEOUT_MS)
      if (!init.ok) return formatGitError(init)
      // Derived AI engineering state under .iwriter/ must not be tracked (04.1 §1.2).
      const gitignorePath = path.join(workspacePath, '.gitignore')
      if (!fs.existsSync(gitignorePath)) {
        await fs.promises.writeFile(gitignorePath, ['.iwriter/', '.DS_Store', ''].join('\n'), 'utf8')
      }
      return JSON.stringify({ ok: true, message: 'Initialized empty git repository (with .gitignore for derived AI artifacts).' }, null, 2)
    },
    {
      name: 'git_init',
      description: 'Initialize a git repository in the workspace (with a .gitignore for derived AI artifacts under .iwriter/) after user approval. Use once when starting version tracking for a project.',
      schema: z.object({}),
    }
  )

  const gitStatus = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return NO_WORKSPACE
      const preflight = await preflightGit(workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      const result = await runGit(workspacePath, ['status', '--porcelain=v1'], READ_TIMEOUT_MS)
      if (!result.ok) return formatGitError(result)
      return JSON.stringify({ ok: true, ...parseStatus(result.stdout) }, null, 2)
    },
    {
      name: 'git_status',
      description: 'Read git status for the workspace. Returns staged, unstaged, and untracked file lists.',
      schema: z.object({}),
    }
  )

  const gitLog = tool(
    async ({ limit }: { limit?: number }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return NO_WORKSPACE
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
      description: 'Read recent git commits for the workspace.',
      schema: z.object({
        limit: z.number().optional().describe('Number of commits to return. Default 10, max 50.'),
      }),
    }
  )

  const gitDiff = tool(
    async ({ from, to }: { from?: string; to?: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return NO_WORKSPACE
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
      if (!workspacePath) return NO_WORKSPACE
      const preflight = await preflightGit(workspacePath, WRITE_TIMEOUT_MS)
      if (!preflight.ok) return formatGitError(preflight)
      if (fs.existsSync(path.join(workspacePath, '.git', 'index.lock'))) {
        return formatGitError(gitError('INDEX_LOCKED', 'Git index is locked by another process.'))
      }
      const authorError = await ensureAuthorConfigured(workspacePath)
      if (authorError) return formatGitError(authorError as Extract<GitResult, { ok: false }>)
      const cleanMessage = message.trim()
      if (!cleanMessage) return formatGitError(gitError('COMMAND_FAILED', 'Commit message is required.'))
      // Default: stage the whole workspace ('.') — .gitignore excludes derived AI artifacts.
      const requestedFiles = files?.length ? files : ['.']
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
      description: 'Stage workspace files and create a git commit after user approval. Defaults to staging the whole workspace ("."); derived AI artifacts are gitignored.',
      schema: z.object({
        message: z.string().describe('Commit message. The user may edit this before approval.'),
        files: z.array(z.string()).optional().describe('Workspace-relative files or directories to stage. Default ["."] (whole workspace).'),
      }),
    }
  )

  const gitTag = tool(
    async ({ name, message }: { name: string; message?: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return NO_WORKSPACE
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

  const gitRestore = tool(
    async ({ files, ref }: { files: string[]; ref?: string }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return NO_WORKSPACE
      const preflight = await preflightGit(workspacePath, WRITE_TIMEOUT_MS)
      if (!preflight.ok) return formatGitError(preflight)
      if (fs.existsSync(path.join(workspacePath, '.git', 'index.lock'))) {
        return formatGitError(gitError('INDEX_LOCKED', 'Git index is locked by another process.'))
      }
      if (!files?.length) return formatGitError(gitError('COMMAND_FAILED', 'git_restore requires at least one file.'))
      if (ref !== undefined && !isSafeGitRef(ref)) {
        return formatGitError(gitError('COMMAND_FAILED', 'git_restore ref cannot be empty, whitespace, or option-like.'))
      }
      const resolvedFiles: string[] = []
      for (const file of files) {
        const resolved = resolveGitFile(workspacePath, file)
        if (!resolved.ok) return formatGitError(gitError('COMMAND_FAILED', resolved.message))
        resolvedFiles.push(resolved.relativePath)
      }
      const args = ref
        ? ['restore', '--source', ref, '--', ...resolvedFiles]
        : ['restore', '--', ...resolvedFiles]
      const result = await runGit(workspacePath, args, WRITE_TIMEOUT_MS)
      if (!result.ok) return formatGitError(result)
      return JSON.stringify({ ok: true, restored: resolvedFiles, source: ref ?? 'index/HEAD' }, null, 2)
    },
    {
      name: 'git_restore',
      description: 'Restore workspace file(s) to their committed state, or to a specific commit/tag (ref), after user approval. Used for version rollback (FR-6.4). Discards working-tree changes to the named files.',
      schema: z.object({
        files: z.array(z.string()).min(1).describe('Workspace-relative files or directories to restore.'),
        ref: z.string().optional().describe('Optional commit/tag to restore from. Omit to restore to the last committed state.'),
      }),
    }
  )

  return [gitInit, gitStatus, gitLog, gitDiff, gitCommit, gitTag, gitRestore] as const
}
