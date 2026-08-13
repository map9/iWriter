import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { IWriterAgentContext } from '../../runtime/AgentContext'
import type { GitService } from '../../../GitService'
import type { GitMutationEvent } from '../../../../shared/git/types'

export type GitCommandClassification =
  | { kind: 'read' }
  | { kind: 'write' }
  | { kind: 'invalid', message: string }

const SAFE_READ_OPTIONS: Record<string, RegExp[]> = {
  status: [
    /^-(?:s|b|u|z)$/, /^--short$/, /^--branch$/, /^--show-stash$/,
    /^--(?:no-)?ahead-behind$/, /^--porcelain(?:=v[12])?$/,
    /^--untracked-files(?:=(?:no|normal|all))?$/, /^--ignored(?:=(?:traditional|matching|no))?$/,
  ],
  log: [
    /^-\d+$/, /^-(?:n|p|s|g)$/, /^--max-count(?:=\d+)?$/, /^--oneline$/,
    /^--(?:no-)?decorate(?:=\w+)?$/, /^--graph$/, /^--all$/, /^--branches(?:=.*)?$/,
    /^--tags(?:=.*)?$/, /^--remotes(?:=.*)?$/, /^--first-parent$/, /^--reverse$/,
    /^--date(?:=.*)?$/, /^--format(?:=.*)?$/, /^--pretty(?:=.*)?$/,
    /^--(?:no-)?abbrev-commit$/, /^--stat$/, /^--shortstat$/, /^--name-only$/,
    /^--name-status$/, /^--since(?:=.*)?$/, /^--until(?:=.*)?$/, /^--author(?:=.*)?$/,
    /^--committer(?:=.*)?$/, /^--grep(?:=.*)?$/, /^--merges$/, /^--no-merges$/,
    /^--follow$/, /^--simplify-by-decoration$/, /^--topo-order$/, /^--date-order$/,
    /^--author-date-order$/, /^--parents$/, /^--children$/, /^--boundary$/,
    /^--left-right$/, /^--cherry(?:-mark)?$/, /^--walk-reflogs$/, /^--reflog$/,
    /^--patch$/, /^--no-patch$/,
  ],
  diff: [
    /^-(?:p|s|u|w|z)$/, /^-U\d+$/, /^--patch$/, /^--no-patch$/, /^--stat$/,
    /^--shortstat$/, /^--numstat$/, /^--name-only$/, /^--name-status$/,
    /^--summary$/, /^--check$/, /^--cached$/, /^--staged$/, /^--merge-base$/,
    /^--color(?:=(?:always|never|auto))?$/, /^--no-color$/, /^--word-diff(?:=\w+)?$/,
    /^--word-diff-regex(?:=.*)?$/, /^--unified(?:=\d+)?$/, /^--minimal$/,
    /^--patience$/, /^--histogram$/, /^--ignore-space-at-eol$/,
    /^--ignore-space-change$/, /^--ignore-all-space$/, /^--ignore-blank-lines$/,
    /^--binary$/, /^--full-index$/, /^--abbrev(?:=\d+)?$/, /^--relative(?:=.*)?$/,
    /^--submodule(?:=.*)?$/, /^--no-renames$/, /^--find-renames(?:=.*)?$/,
    /^--find-copies(?:=.*)?$/, /^--diff-filter(?:=.*)?$/,
  ],
  show: [
    /^-(?:p|s|w)$/, /^-U\d+$/, /^--format(?:=.*)?$/, /^--pretty(?:=.*)?$/,
    /^--oneline$/, /^--stat$/, /^--shortstat$/, /^--name-only$/, /^--name-status$/,
    /^--summary$/, /^--patch$/, /^--no-patch$/, /^--color(?:=(?:always|never|auto))?$/,
    /^--no-color$/, /^--word-diff(?:=\w+)?$/, /^--unified(?:=\d+)?$/,
  ],
  'rev-parse': [
    /^--verify$/, /^--quiet$/, /^-q$/, /^--short(?:=\d+)?$/, /^--symbolic$/,
    /^--symbolic-full-name$/, /^--abbrev-ref(?:=(?:strict|loose))?$/,
    /^--show-toplevel$/, /^--show-prefix$/, /^--show-cdup$/, /^--git-dir$/,
    /^--is-inside-work-tree$/, /^--is-bare-repository$/, /^--is-shallow-repository$/,
    /^--branches(?:=.*)?$/, /^--tags(?:=.*)?$/, /^--remotes(?:=.*)?$/, /^--all$/,
  ],
  'rev-list': [/^-\d+$/, /^--max-count(?:=\d+)?$/, /^--all$/, /^--count$/, /^--objects$/, /^--parents$/, /^--children$/, /^--reverse$/, /^--topo-order$/, /^--date-order$/],
  'show-ref': [/^--head$/, /^--heads$/, /^--tags$/, /^--dereference$/, /^--hash(?:=\d+)?$/, /^--abbrev(?:=\d+)?$/, /^--verify$/, /^--exists$/, /^--quiet$/, /^-q$/],
  'for-each-ref': [/^--format(?:=.*)?$/, /^--sort(?:=.*)?$/, /^--count(?:=\d+)?$/, /^--points-at(?:=.*)?$/, /^--contains(?:=.*)?$/, /^--no-contains(?:=.*)?$/],
  'ls-files': [/^-(?:c|d|m|o|i|s|u|k|t|v|z)$/, /^--cached$/, /^--deleted$/, /^--modified$/, /^--others$/, /^--ignored$/, /^--stage$/, /^--unmerged$/, /^--killed$/, /^--resolve-undo$/, /^--directory$/, /^--no-empty-directory$/, /^--exclude(?:=.*)?$/, /^--exclude-standard$/, /^--error-unmatch$/, /^--full-name$/],
  'ls-tree': [/^-(?:d|r|t|l|z)$/, /^--long$/, /^--name-only$/, /^--name-status$/, /^--object-only$/, /^--full-name$/, /^--full-tree$/, /^--abbrev(?:=\d+)?$/, /^--format(?:=.*)?$/],
  'cat-file': [/^-[tsep]$/, /^--textconv$/, /^--batch(?:-check|-command)?(?:=.*)?$/, /^--buffer$/, /^--follow-symlinks$/, /^--use-mailmap$/],
  'merge-base': [/^--all$/, /^--octopus$/, /^--independent$/, /^--is-ancestor$/, /^--fork-point$/],
  'name-rev': [/^--name-only$/, /^--tags$/, /^--refs(?:=.*)?$/, /^--exclude(?:=.*)?$/, /^--all$/, /^--stdin$/, /^--always$/, /^--undefined$/],
  describe: [/^--all$/, /^--tags$/, /^--contains$/, /^--abbrev(?:=\d+)?$/, /^--candidates(?:=\d+)?$/, /^--exact-match$/, /^--debug$/, /^--long$/, /^--match(?:=.*)?$/, /^--exclude(?:=.*)?$/, /^--always$/, /^--first-parent$/, /^--dirty(?:=.*)?$/, /^--broken(?:=.*)?$/],
  shortlog: [/^-\d+$/, /^-(?:s|n|e|w)$/, /^--summary$/, /^--numbered$/, /^--email$/, /^--group(?:=.*)?$/, /^--format(?:=.*)?$/],
  blame: [/^-L(?:.*)?$/, /^-(?:b|l|t|s|e|w)$/, /^--root$/, /^--show-stats$/, /^--score-debug$/, /^--show-name$/, /^--show-number$/, /^--porcelain$/, /^--line-porcelain$/, /^--incremental$/, /^--minimal$/, /^--reverse(?:=.*)?$/, /^--first-parent$/, /^--ignore-rev(?:=.*)?$/],
  grep: [/^-\d+$/, /^-(?:n|l|L|c|h|H|i|I|w|v|E|F|G|P|q|e|z)$/, /^--line-number$/, /^--files-with-matches$/, /^--files-without-match$/, /^--count$/, /^--ignore-case$/, /^--word-regexp$/, /^--invert-match$/, /^--extended-regexp$/, /^--fixed-strings$/, /^--basic-regexp$/, /^--perl-regexp$/, /^--quiet$/, /^--all-match$/, /^--break$/, /^--heading$/, /^--full-name$/, /^--cached$/, /^--untracked$/, /^--exclude-standard$/, /^--recurse-submodules$/, /^--max-depth(?:=\d+)?$/],
}

const FORBIDDEN_OPTIONS = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path',
  '--ext-diff', '--textconv', '--open-files-in-pager', '--show-signature', '--paginate',
])

const NO_WORKSPACE = JSON.stringify({
  ok: false,
  exitCode: null,
  stdout: '',
  stderr: 'This Git command requires an open workspace folder.',
}, null, 2)

function resolveWorkspace(runtime: unknown): string | null {
  const workspacePath = (runtime as { context?: IWriterAgentContext } | undefined)?.context?.workspacePath
  return workspacePath?.trim() ? path.resolve(workspacePath) : null
}

function invalid(message: string): GitCommandClassification {
  return { kind: 'invalid', message }
}

function isOutsidePath(value: string): boolean {
  return path.isAbsolute(value)
    || /^[a-zA-Z]:[\\/]/.test(value)
    || value.split(/[\\/]/).includes('..')
}

/** Classifies one argv-style Git invocation for LangChain's native interruptOn.when predicate. */
export function classifyGitCommand(value: unknown): GitCommandClassification {
  if (!Array.isArray(value) || !value.every(arg => typeof arg === 'string')) {
    return invalid('Git arguments must be a string array.')
  }
  if (!value.length || !value[0]!.trim() || value[0]!.startsWith('-')) {
    return invalid('A Git subcommand is required as the first argument.')
  }

  for (const arg of value) {
    if (/\0|[\r\n]/.test(arg)) return invalid('Git arguments cannot contain control characters.')
    const option = arg.split('=', 1)[0]!
    if (FORBIDDEN_OPTIONS.has(option) || (value[0] === 'grep' && /^-O/.test(arg))) {
      return invalid(`Git option "${option}" is not allowed.`)
    }
    if (arg === '--global' || arg === '--system' || option === '--file') {
      return invalid(`Git option "${option}" would escape repository-local configuration.`)
    }
    const embeddedValue = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : null
    if (isOutsidePath(arg) || (embeddedValue !== null && isOutsidePath(embeddedValue))) {
      return invalid(`Git argument "${arg}" points outside the workspace.`)
    }
  }

  const [command, ...commandArgs] = value
  const safeOptions = SAFE_READ_OPTIONS[command!]
  if (!safeOptions) return { kind: 'write' }
  for (const arg of commandArgs) {
    if (arg === '--' || !arg.startsWith('-')) continue
    if (!safeOptions.some(pattern => pattern.test(arg))) return { kind: 'write' }
  }
  return { kind: 'read' }
}

export function shouldInterruptGit(value: unknown): boolean {
  return classifyGitCommand(value).kind === 'write'
}

function rejectedCommand(message: string): string {
  return JSON.stringify({ ok: false, exitCode: null, stdout: '', stderr: message }, null, 2)
}

function mutationKind(command: string): GitMutationEvent['kind'] {
  if (command === 'init') return 'repository'
  if (command === 'tag') return 'tags'
  if ([
    'commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'reset', 'branch', 'checkout',
    'switch', 'fetch', 'pull', 'push', 'remote',
  ].includes(command)) return 'history'
  return 'working-tree'
}

/** One raw Agent Git surface; LangChain HITL decides per invocation whether approval is needed. */
export function buildGitTools(options: {
  gitService: GitService
  onMutation: (event: GitMutationEvent) => void
}) {
  const git = tool(
    async ({ args }: { args: string[] }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return NO_WORKSPACE
      const classification = classifyGitCommand(args)
      if (classification.kind === 'invalid') return rejectedCommand(classification.message)

      const result = await options.gitService.runCommand(workspacePath, args, {
        readOnly: classification.kind === 'read',
      })
      if (classification.kind === 'write') {
        try {
          options.onMutation({ root: workspacePath, kind: mutationKind(args[0]!) })
        } catch (error) {
          console.warn('[GitTools] Failed to notify SCM about Git mutation:', error)
        }
      }
      return JSON.stringify(result, null, 2)
    },
    {
      name: 'git',
      description: 'Run Git in the current workspace using an argv array. Safe read commands run directly; commands that can mutate the repository require user approval. Returns ok, exitCode, stdout, and stderr so you can inspect failures and adjust the next command.',
      schema: z.object({
        args: z.array(z.string()).min(1).describe('Git arguments without the leading "git", for example ["status", "--short"] or ["commit", "-m", "Revise opening"].'),
      }),
    },
  )

  return [git] as const
}
