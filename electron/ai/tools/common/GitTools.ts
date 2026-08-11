import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { getRuntimeWorkspacePath, isPathInside } from '../../runtime/RuntimePathResolver'
import {
  GitServiceError,
  type GitService,
} from '../../../GitService'
import type { GitMutationEvent } from '../../../../src/types/git'

// Generalized git tools (B1): moved from the storybible-specific CreativeGitTools to the
// common tool面, workspace-generic (no storybible.md/draft defaults). Adds git_init and
// git_restore (04.4 §3 / FR-1.6 / FR-6.4). Version tracking operates on the markdown object
// tree at the workspace root; derived AI artifacts under `.iwriter/` are gitignored.

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

function serviceFailure(error: unknown): Extract<GitResult, { ok: false }> {
  if (error instanceof GitServiceError) {
    switch (error.code) {
      case 'git-not-found':
        return gitError('GIT_NOT_INSTALLED', error.message)
      case 'not-a-repository':
        return gitError('NOT_A_REPO', error.message)
      case 'author-not-configured':
        return gitError('AUTHOR_NOT_CONFIGURED', error.message)
      case 'index-locked':
        return gitError('INDEX_LOCKED', error.message)
      case 'timeout':
        return gitError('GIT_TIMEOUT', error.message)
      default:
        return gitError('COMMAND_FAILED', error.message)
    }
  }
  return gitError('COMMAND_FAILED', error instanceof Error ? error.message : String(error))
}

async function preflightGit(gitService: GitService, workspacePath: string): Promise<GitResult> {
  if (!fs.existsSync(path.join(workspacePath, '.git'))) {
    return gitError('NOT_A_REPO', 'Not a git repository — call git_init first to start version tracking.')
  }
  const availability = await gitService.detect()
  if (!availability.available) {
    return gitError('GIT_NOT_INSTALLED', 'Configured git binary was not found.')
  }
  if (!await gitService.isRepo(workspacePath)) {
    return gitError('NOT_A_REPO', 'Not a git repository — call git_init first to start version tracking.')
  }
  return { ok: true, stdout: availability.version ?? '', stderr: '' }
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
  if (!isPathInside(workspacePath, resolved)) {
    return { ok: false, message: 'Git file path escapes the workspace.' }
  }
  return { ok: true, relativePath: path.relative(workspacePath, resolved).replace(/\\/g, '/') }
}

function isSafeGitRef(ref: string): boolean {
  const trimmed = ref.trim()
  return !!trimmed && !trimmed.startsWith('-') && !/[\s\0-\x1f]/.test(trimmed)
}

async function ensureAuthorConfigured(gitService: GitService, workspacePath: string): Promise<GitResult | null> {
  const identity = await gitService.getUserIdentity(workspacePath)
  if (!identity.name || !identity.email) {
    return gitError('AUTHOR_NOT_CONFIGURED', 'Git is not configured with an author identity. Run `git config user.name` and `git config user.email` first.')
  }
  return null
}

export function getLastGitTagInfo(gitService: GitService, workspacePath: string): Promise<{
  last_git_tag: { name: string; commit: string; message: string } | null
  commits_since_last_tag: number | null
}> {
  if (!fs.existsSync(path.join(workspacePath, '.git'))) {
    return Promise.resolve({ last_git_tag: null, commits_since_last_tag: null })
  }
  return gitService.getLastTagInfo(workspacePath)
}

const NO_WORKSPACE = 'Error: this action requires an open workspace folder.'

export function buildGitTools(options: {
  gitService: GitService
  onMutation: (event: GitMutationEvent) => void
}) {
  const gitService = options.gitService
  const resolveWorkspace = (runtime: unknown): string | null =>
    ensureWorkspace(getRuntimeWorkspacePath(runtime))
  const notifyMutation = (root: string, kind: GitMutationEvent['kind']): void => {
    try {
      options.onMutation({ root, kind })
    } catch (error) {
      console.warn('[GitTools] Failed to notify SCM about Git mutation:', error)
    }
  }

  const gitInit = tool(
    async (_input: Record<string, never>, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return NO_WORKSPACE
      if (fs.existsSync(path.join(workspacePath, '.git'))) {
        notifyMutation(workspacePath, 'repository')
        return JSON.stringify({ ok: true, already_initialized: true, message: 'Workspace is already a git repository.' }, null, 2)
      }
      try {
        await gitService.init(workspacePath)
        notifyMutation(workspacePath, 'repository')
      } catch (error) {
        if (fs.existsSync(path.join(workspacePath, '.git'))) notifyMutation(workspacePath, 'repository')
        return formatGitError(serviceFailure(error))
      }
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
      const preflight = await preflightGit(gitService, workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      try {
        const status = await gitService.status(workspacePath)
        return JSON.stringify({
          ok: true,
          staged: status.staged.map(file => file.path),
          unstaged: [...status.changes, ...status.conflicts].map(file => file.path),
          untracked: status.untracked.map(file => file.path),
        }, null, 2)
      } catch (error) {
        return formatGitError(serviceFailure(error))
      }
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
      const preflight = await preflightGit(gitService, workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      const safeLimit = Math.max(1, Math.min(limit ?? 10, 50))
      try {
        const commits = (await gitService.log(workspacePath, { limit: safeLimit })).map(commit => ({
          shortHash: commit.shortHash,
          hash: commit.hash,
          date: commit.date,
          message: commit.subject,
        }))
        return JSON.stringify({ ok: true, commits }, null, 2)
      } catch (error) {
        return formatGitError(serviceFailure(error))
      }
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
      const preflight = await preflightGit(gitService, workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      if (to && !from) return formatGitError(gitError('COMMAND_FAILED', 'git_diff requires from when to is provided.'))
      if ((from && !isSafeGitRef(from)) || (to && !isSafeGitRef(to))) {
        return formatGitError(gitError('COMMAND_FAILED', 'git_diff refs cannot be empty, whitespace, or option-like values.'))
      }
      try {
        const result = await gitService.diffRefs(workspacePath, from, to)
        return result || 'No diff.'
      } catch (error) {
        return formatGitError(serviceFailure(error))
      }
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
      const preflight = await preflightGit(gitService, workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      const authorError = await ensureAuthorConfigured(gitService, workspacePath)
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
      try {
        const commit = await gitService.commitPaths(workspacePath, cleanMessage, resolvedFiles)
        notifyMutation(workspacePath, 'history')
        return JSON.stringify({
          ok: true,
          message: cleanMessage,
          files: commit.files,
          output: commit.output,
        }, null, 2)
      } catch (error) {
        // commitPaths may already have staged files before a hook/commit failure.
        notifyMutation(workspacePath, 'working-tree')
        return formatGitError(serviceFailure(error))
      }
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
      const preflight = await preflightGit(gitService, workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
      const tagName = name.trim()
      if (!tagName) return formatGitError(gitError('COMMAND_FAILED', 'Tag name is required.'))
      if (!isSafeGitRef(tagName)) return formatGitError(gitError('COMMAND_FAILED', 'Invalid tag name.'))
      if (!await gitService.checkRefFormat(workspacePath, `refs/tags/${tagName}`)) {
        return formatGitError(gitError('COMMAND_FAILED', 'Invalid tag name.'))
      }
      try {
        await gitService.createTag(workspacePath, tagName, { message: message?.trim() || tagName })
        notifyMutation(workspacePath, 'tags')
        const latest = await getLastGitTagInfo(gitService, workspacePath)
        return JSON.stringify({ ok: true, name: tagName, ...latest }, null, 2)
      } catch (error) {
        return formatGitError(serviceFailure(error))
      }
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
      const preflight = await preflightGit(gitService, workspacePath)
      if (!preflight.ok) return formatGitError(preflight)
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
      try {
        await gitService.restorePaths(workspacePath, resolvedFiles, ref)
        notifyMutation(workspacePath, 'working-tree')
        return JSON.stringify({ ok: true, restored: resolvedFiles, source: ref ?? 'index/HEAD' }, null, 2)
      } catch (error) {
        notifyMutation(workspacePath, 'working-tree')
        return formatGitError(serviceFailure(error))
      }
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
