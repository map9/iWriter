import { execFile } from 'child_process'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import simpleGit, { type SimpleGit, type SimpleGitProgressEvent } from 'simple-git'
import { GitConfigStore } from './GitConfigStore'
import type {
  GitAvailability,
  GitBranchInfo,
  GitCommit,
  GitCommitRef,
  GitDiffPayload,
  GitFileChange,
  GitFileStatus,
  GitIdentity,
  GitIdentityScopes,
  GitIssue,
  SourceControlSettings,
  GitStatus,
} from '../src/types/git'

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf',
  '.zip', '.gz', '.tar', '.mp3', '.mp4', '.mov', '.woff', '.woff2', '.ttf', '.otf',
])

export type GitServiceErrorCode =
  | 'git-not-found'
  | 'not-a-repository'
  | 'author-not-configured'
  | 'index-locked'
  | 'timeout'
  | 'no-staged-changes'
  | 'command-failed'

export interface GitRestorePreview {
  source: {
    ref: string
    shortHash?: string
    subject?: string
  }
  files: Array<{
    path: string
    additions: number | null
    deletions: number | null
  }>
}

export class GitServiceError extends Error {
  constructor(
    public readonly code: GitServiceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'GitServiceError'
  }
}

function normalizeGitServiceError(error: unknown): GitServiceError {
  if (error instanceof GitServiceError) return error
  const detail = error instanceof Error ? error.message : String(error)
  if (/ENOENT|not found|cannot spawn|spawn .*git/i.test(detail)) {
    return new GitServiceError('git-not-found', detail, { cause: error })
  }
  if (/not a git repository/i.test(detail)) {
    return new GitServiceError('not-a-repository', detail, { cause: error })
  }
  if (/index\.lock|Another git process seems to be running/i.test(detail)) {
    return new GitServiceError('index-locked', detail, { cause: error })
  }
  if (/block timeout reached|timed out|timeout/i.test(detail)) {
    return new GitServiceError('timeout', detail, { cause: error })
  }
  return new GitServiceError('command-failed', detail, { cause: error })
}

/** 将 Git 的可预期失败转为领域问题；原始输出保留给按需展开的技术详情。 */
export function classifyGitIssue(error: unknown, operation: string, branch?: string): GitIssue {
  const detail = error instanceof Error ? error.message : String(error)
  if (operation === 'delete-branch' && /not fully merged/i.test(detail)) {
    return { kind: 'branch-unmerged', operation, detail, branch }
  }
  if (operation === 'checkout' && /overwritten by (checkout|merge)|Please commit your changes or stash/i.test(detail)) {
    return { kind: 'checkout-dirty', operation, detail }
  }
  if (/Authentication failed|Permission denied|could not read Username|403|401/i.test(detail)) {
    return { kind: 'remote-auth', operation, detail }
  }
  if (/non-fast-forward|fetch first|rejected.*non-fast-forward/i.test(detail)) {
    return { kind: 'remote-non-fast-forward', operation, detail }
  }
  if (/Could not resolve host|network|timed out|connection.*(refused|reset)|unable to access/i.test(detail)) {
    return { kind: 'network', operation, detail }
  }
  return { kind: 'unknown', operation, detail, branch }
}

/**
 * 版本控制服务：对系统 `git` 二进制的封装（经 simple-git）。
 * 所有 git 操作在主进程执行，渲染层经 IPC 调用。
 */
export class GitService {
  private cache = new Map<string, SimpleGit>()
  private availability: GitAvailability | null = null
  /** 自动检测到的绝对路径；避免安装 Git 后当前 Electron 进程的旧 PATH 仍找不到它。 */
  private detectedBinaryPath: string | null = null
  private onProgress: ((p: SimpleGitProgressEvent) => void) | null = null

  constructor(private readonly configStore = new GitConfigStore()) {}

  getSettings(): SourceControlSettings {
    return this.configStore.getSettings()
  }

  updateSettings(patch: Partial<SourceControlSettings>): SourceControlSettings {
    const before = this.getSettings()
    const settings = this.configStore.updateSettings(patch)
    if (before.gitPathMode !== settings.gitPathMode || before.gitPath !== settings.gitPath) {
      this.availability = null
      this.detectedBinaryPath = null
      // 保留仓库队列链尾：正在执行的旧客户端完成后，新命令才会用新路径创建客户端，
      // 避免切换 Git 路径瞬间绕过已有写操作并发执行。
      this.cache.clear()
    }
    return settings
  }

  /** 设置长耗时操作进度回调（App.ts 转发到渲染层）。闭包读取，故设置早晚不影响已建实例。 */
  setProgressHandler(cb: (p: SimpleGitProgressEvent) => void): void {
    this.onProgress = cb
  }

  private binary(): string {
    const settings = this.getSettings()
    return settings.gitPathMode === 'custom' && settings.gitPath
      ? settings.gitPath
      : this.detectedBinaryPath ?? 'git'
  }

  private createGit(root?: string): SimpleGit {
    return simpleGit({
      ...(root ? { baseDir: root } : {}),
      binary: this.binary(),
      config: ['core.quotepath=false'],
      maxConcurrentProcesses: 1,
      timeout: { block: 60_000 },
      progress: (evt) => this.onProgress?.(evt),
    })
  }

  private git(root: string): SimpleGit {
    let g = this.cache.get(root)
    if (!g) {
      // core.quotepath=false：让含非 ASCII（如中文）的路径原样输出 UTF-8，
      // 否则 git 会把中文路径转义成 "\345\244\247…" 八进制，导致图谱显示乱码、
      // 且据此路径再 `git show hash:path` 无法命中（diff 显示"没有更改"）。
      g = this.createGit(root)
      this.cache.set(root, g)
    }
    return g
  }

  // —— 仓库级串行 + index.lock 竞争重试 ——
  // 同一 root 的所有 git 命令经此排队执行（显式互斥，不依赖 simple-git 内部串行的隐式保证），
  // 且遇 index.lock 争用（外部 git 进程 / 陈旧锁 / 用户快速连续操作）指数退避重试而非直接抛错，
  // 杜绝并发抢锁产生的 "Unable to create '.git/index.lock': File exists"。
  private tails = new Map<string, Promise<unknown>>()

  private exec<T>(root: string, fn: (g: SimpleGit) => Promise<T>): Promise<T> {
    const prev = this.tails.get(root) ?? Promise.resolve()
    const run = prev.then(() => this.execWithRetry(root, fn), () => this.execWithRetry(root, fn))
    // 链尾吞掉成败，仅用于排队；调用方仍从返回的 run 拿到真实结果/错误
    this.tails.set(root, run.then(() => undefined, () => undefined))
    return run
  }

  private async execWithRetry<T>(root: string, fn: (g: SimpleGit) => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await fn(this.git(root))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // index.lock 争用发生在 git 真正改动之前（先抢锁失败即中止，未落任何改动），故重试安全
      if (attempt < 4 && /index\.lock|Another git process seems to be running/i.test(msg)) {
        await new Promise(r => setTimeout(r, 100 * 2 ** attempt)) // 100/200/400/800ms 退避
        return this.execWithRetry(root, fn, attempt + 1)
      }
      throw normalizeGitServiceError(err)
    }
  }

  /** 串行执行一条 raw git 命令（经 exec 互斥 + 重试） */
  private raw(root: string, args: string[]): Promise<string> {
    return this.exec(root, g => g.raw(args))
  }

  /**
   * 检测 Git 可执行文件。
   * candidatePath === undefined 时检测并缓存当前配置；
   * candidatePath === null 时检测系统 PATH；字符串则只检测候选路径，不污染当前缓存。
   */
  async detect(force = false, candidatePath?: string | null): Promise<GitAvailability> {
    const detectsConfiguredPath = candidatePath === undefined
    if (detectsConfiguredPath && !force && this.availability) return this.availability

    const settings = this.getSettings()
    const autoDetect = detectsConfiguredPath && settings.gitPathMode === 'auto'
    const configuredBinary = settings.gitPathMode === 'custom' && settings.gitPath
      ? settings.gitPath
      : 'git'
    const binary = detectsConfiguredPath
      ? configuredBinary
      : candidatePath?.trim() || 'git'
    const candidates = autoDetect
      ? this.getAutoDetectionCandidates(binary)
      : [binary]

    let result: GitAvailability | null = null
    let detectedBinary: string | null = null
    for (const candidate of candidates) {
      result = await this.checkAvailability(candidate)
      if (result.available) {
        detectedBinary = await this.resolveExecutablePath(candidate)
        result.path = detectedBinary
        break
      }
    }
    result ??= this.unavailableResult('No Git executable candidates were found.')

    if (detectsConfiguredPath) {
      if (autoDetect) {
        const nextDetectedPath = result.available ? detectedBinary : null
        if (this.detectedBinaryPath !== nextDetectedPath) {
          this.detectedBinaryPath = nextDetectedPath
          this.cache.clear()
        }
      }
      this.availability = result
    }
    return result
  }

  private getAutoDetectionCandidates(binary: string): string[] {
    const candidates = [binary]
    if (process.platform === 'win32') {
      for (const base of [
        process.env.ProgramW6432,
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : undefined,
      ]) {
        if (!base) continue
        candidates.push(
          path.join(base, 'Git', 'cmd', 'git.exe'),
          path.join(base, 'Git', 'bin', 'git.exe'),
        )
      }
    } else if (process.platform === 'darwin') {
      candidates.push(
        '/opt/homebrew/bin/git',
        '/usr/local/bin/git',
        '/usr/local/git/bin/git',
        '/usr/bin/git',
      )
    } else {
      candidates.push('/usr/local/bin/git', '/usr/bin/git', '/snap/bin/git')
    }
    return [...new Set(candidates)]
  }

  private checkAvailability(binary: string): Promise<GitAvailability> {
    return new Promise(resolve => {
      execFile(binary, ['--version'], { timeout: 15_000 }, (err, stdout) => {
        if (err) {
          resolve(this.unavailableResult(err.message))
          return
        }
        const version = stdout.toString().replace(/^git version\s*/i, '').trim()
        resolve({ available: true, version })
      })
    })
  }

  private unavailableResult(error: string): GitAvailability {
    return {
      available: false,
      error,
      installCommand: this.getInstallCommand(),
      downloadUrl: 'https://git-scm.com/downloads',
    }
  }

  private async resolveExecutablePath(binary: string): Promise<string> {
    if (path.isAbsolute(binary) || /[\\/]/.test(binary)) return binary
    const locator = process.platform === 'win32' ? 'where.exe' : 'which'
    return new Promise(resolve => {
      execFile(locator, [binary], { timeout: 5_000 }, (error, stdout) => {
        const detected = error ? '' : stdout.toString().split(/\r?\n/, 1)[0]?.trim()
        resolve(detected || binary)
      })
    })
  }

  /** 未安装 git 时的按平台安装命令（对齐 LibreOfficeService.getInstallCommand） */
  private getInstallCommand(): string {
    switch (process.platform) {
      case 'darwin':
        return 'brew install git'
      case 'win32':
        return 'winget install Git.Git'
      default:
        return 'sudo apt install git'
    }
  }

  async isRepo(root: string): Promise<boolean> {
    try {
      return await this.exec(root, g => g.checkIsRepo())
    } catch {
      return false
    }
  }

  async init(root: string): Promise<void> {
    await this.exec(root, g => g.init())
  }

  async clone(url: string, dir: string): Promise<void> {
    try {
      await this.createGit().clone(url, dir)
    } catch (error) {
      throw normalizeGitServiceError(error)
    }
  }

  async status(root: string): Promise<GitStatus> {
    const s = await this.exec(root, g => g.status())
    const staged: GitFileChange[] = []
    const changes: GitFileChange[] = []
    const untracked: GitFileChange[] = []
    const conflicts: GitFileChange[] = []

    for (const f of s.files) {
      const p = f.path
      // conflicts
      if (s.conflicted.includes(p)) {
        conflicts.push(this.makeChange(p, 'C', false))
        continue
      }
      // untracked：index 与 working_dir 均为 '?'
      if (f.index === '?' && f.working_dir === '?') {
        untracked.push(this.makeChange(p, 'U', false))
        continue
      }
      // 已暂存（index 非空非 '?'）；重命名(R)带上源路径，供 diff 取 HEAD 旧内容
      if (f.index && f.index !== ' ' && f.index !== '?') {
        staged.push(this.makeChange(p, this.mapStatus(f.index), true, f.from || undefined))
      }
      // 工作区改动（working_dir 非空非 '?'）
      if (f.working_dir && f.working_dir !== ' ' && f.working_dir !== '?') {
        changes.push(this.makeChange(p, this.mapStatus(f.working_dir), false))
      }
    }

    return {
      staged,
      changes,
      untracked,
      conflicts,
      isMerging: await this.isMerging(root),
    }
  }

  async stage(root: string, paths: string[]): Promise<void> {
    if (paths.length) await this.exec(root, g => g.add(paths))
  }

  async unstage(root: string, paths: string[]): Promise<void> {
    if (paths.length) await this.raw(root,['restore', '--staged', '--', ...paths])
  }

  async stageAll(root: string): Promise<void> {
    await this.exec(root, g => g.add(['-A']))
  }

  async unstageAll(root: string): Promise<void> {
    await this.raw(root,['reset'])
  }

  /** 放弃更改：HEAD 里已有的文件还原到 HEAD；新增文件（未跟踪或已暂存 index='A'）移出 index 并清理工作区 */
  async discard(root: string, paths: string[]): Promise<void> {
    if (!paths.length) return
    await this.exec(root, async g => {
      const s = await g.status()
      const untrackedSet = new Set(s.not_added)
      // index 为 'A' 的是「已暂存新增」，同样不在 HEAD——不能用 restore --source=HEAD 还原（会因 pathspec 不匹配报错）
      const addedSet = new Set(s.files.filter(f => f.index === 'A').map(f => f.path))
      const tracked = paths.filter(p => !untrackedSet.has(p) && !addedSet.has(p))
      const newFiles = paths.filter(p => untrackedSet.has(p) || addedSet.has(p))
      if (tracked.length) {
        await g.raw(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked])
      }
      if (newFiles.length) {
        // 先移出 index（-f 覆盖「暂存内容与 HEAD/工作区均不同」的安全拦截，--cached 不动工作区文件；
        // --ignore-unmatch 容忍纯未跟踪文件），再从工作区清理
        await g.raw(['rm', '--cached', '-f', '--ignore-unmatch', '--', ...newFiles])
        await g.raw(['clean', '-f', '--', ...newFiles])
      }
    })
  }

  async commit(root: string, message: string, opts: { all?: boolean; amend?: boolean }): Promise<void> {
    await this.exec(root, async g => {
      // `git commit -a` excludes untracked files. Commit All must first populate
      // the index with every working-tree change, matching the SCM action label.
      if (opts.all) await g.add(['-A'])
      const args = ['commit', '-m', message]
      if (opts.amend) args.push('--amend')
      await g.raw(args)
    })
  }

  /**
   * Agent commit transaction: stage the approved paths, verify the resulting index,
   * then commit without allowing SCM commands to interleave between those steps.
   */
  async commitPaths(root: string, message: string, paths: string[]): Promise<{ files: string[]; output: string }> {
    return this.exec(root, async g => {
      const identity = async (key: string) => {
        try {
          return (await g.raw(['config', '--get', key])).trim()
        } catch {
          return ''
        }
      }
      if (!await identity('user.name') || !await identity('user.email')) {
        throw new GitServiceError(
          'author-not-configured',
          'Git is not configured with an author identity.',
        )
      }
      await g.raw(['add', '--', ...paths])
      const staged = (await g.raw(['diff', '--cached', '--name-only']))
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
      if (!staged.length) {
        throw new GitServiceError('no-staged-changes', 'No staged changes to commit.')
      }
      const output = await g.raw(['commit', '-m', message])
      return { files: staged, output: output.trim() }
    })
  }

  async diffRefs(root: string, from?: string, to?: string): Promise<string> {
    const args = ['diff']
    if (from) args.push(from)
    if (to) args.push(to)
    return this.raw(root, args)
  }

  async checkRefFormat(root: string, ref: string): Promise<boolean> {
    try {
      await this.raw(root, ['check-ref-format', '--allow-onelevel', ref])
      return true
    } catch {
      return false
    }
  }

  async restorePaths(root: string, files: string[], ref?: string): Promise<void> {
    const args = ref
      ? ['restore', '--source', ref, '--', ...files]
      : ['restore', '--', ...files]
    await this.raw(root, args)
  }

  /**
   * Preview the exact working-tree changes made by restorePaths(). Git numstat describes
   * source → working tree, so additions/deletions are swapped to report working tree → source.
   */
  async previewRestorePaths(root: string, files: string[], ref?: string): Promise<GitRestorePreview> {
    const trimmedRef = ref?.trim()
    if (trimmedRef && (trimmedRef.startsWith('-') || /[\s\0-\x1f]/.test(trimmedRef))) {
      throw new GitServiceError('command-failed', 'Invalid Git restore source.')
    }

    const source: GitRestorePreview['source'] = { ref: trimmedRef || 'index' }
    if (trimmedRef) {
      const metadata = (await this.raw(root, [
        'log',
        '-1',
        '--format=%h%x1f%s',
        trimmedRef,
      ])).trim()
      if (metadata) {
        const separator = metadata.indexOf('\x1f')
        source.shortHash = separator >= 0 ? metadata.slice(0, separator) : metadata
        if (separator >= 0) source.subject = metadata.slice(separator + 1)
      }
    }

    if (!files.length) return { source, files: [] }
    const args = ['diff', '--numstat', '--no-renames']
    if (trimmedRef) args.push(trimmedRef)
    args.push('--', ...files)
    const output = await this.raw(root, args)
    const parsed = output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [workingAdditions = '-', workingDeletions = '-', ...pathParts] = line.split('\t')
        const binary = workingAdditions === '-' || workingDeletions === '-'
        return {
          path: pathParts.join('\t'),
          additions: binary ? null : Number(workingDeletions),
          deletions: binary ? null : Number(workingAdditions),
        }
      })

    const ordered: GitRestorePreview['files'] = []
    const consumed = new Set<number>()
    for (const requestedPath of files) {
      const normalized = requestedPath.replace(/\\/g, '/').replace(/\/$/, '')
      const matches = parsed
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry, index }) => !consumed.has(index) && (
          normalized === '.'
          || entry.path === normalized
          || entry.path.startsWith(`${normalized}/`)
        ))
      for (const { entry, index } of matches) {
        consumed.add(index)
        ordered.push(entry)
      }
      if (!matches.length && normalized !== '.') {
        ordered.push({ path: normalized, additions: 0, deletions: 0 })
      }
    }
    parsed.forEach((entry, index) => {
      if (!consumed.has(index)) ordered.push(entry)
    })

    return { source, files: ordered }
  }

  async getLastTagInfo(root: string): Promise<{
    last_git_tag: { name: string; commit: string; message: string } | null
    commits_since_last_tag: number | null
  }> {
    let tagName = ''
    try {
      tagName = (await this.raw(root, ['describe', '--tags', '--abbrev=0'])).trim()
    } catch {
      return { last_git_tag: null, commits_since_last_tag: null }
    }
    if (!tagName) return { last_git_tag: null, commits_since_last_tag: null }
    const [commit, message, count] = await Promise.all([
      this.raw(root, ['rev-list', '-n', '1', tagName]).catch(() => ''),
      this.raw(root, ['tag', '-l', tagName, '--format=%(contents)']).catch(() => ''),
      this.raw(root, ['rev-list', `${tagName}..HEAD`, '--count']).catch(() => ''),
    ])
    return {
      last_git_tag: {
        name: tagName,
        commit: commit.trim(),
        message: message.trim(),
      },
      commits_since_last_tag: count.trim() ? Number(count.trim()) : null,
    }
  }

  private async readConfig(root: string, key: string, scope?: '--global' | '--local'): Promise<string | undefined> {
    try {
      const args = ['config']
      if (scope) args.push(scope)
      args.push('--get', key)
      return (await this.raw(root, args)).trim() || undefined
    } catch {
      return undefined
    }
  }

  async getUserIdentity(root: string | null): Promise<GitIdentity> {
    const baseDir = root || os.homedir()
    if (!root) {
      return {
        name: await this.readConfig(baseDir, 'user.name', '--global'),
        email: await this.readConfig(baseDir, 'user.email', '--global'),
      }
    }
    return {
      name: await this.readConfig(baseDir, 'user.name'),
      email: await this.readConfig(baseDir, 'user.email'),
    }
  }

  async getUserIdentityScopes(root: string | null): Promise<GitIdentityScopes> {
    const baseDir = root || os.homedir()
    const global: GitIdentity = {
      name: await this.readConfig(baseDir, 'user.name', '--global'),
      email: await this.readConfig(baseDir, 'user.email', '--global'),
    }
    if (!root) return { global, effective: global }
    const local: GitIdentity = {
      name: await this.readConfig(root, 'user.name', '--local'),
      email: await this.readConfig(root, 'user.email', '--local'),
    }
    return {
      global,
      local,
      effective: {
        name: local.name ?? global.name,
        email: local.email ?? global.email,
      },
    }
  }

  async setUserIdentity(root: string | null, name: string, email: string, global: boolean): Promise<void> {
    const baseDir = root || os.homedir()
    if (!global && !root) {
      throw new GitServiceError('not-a-repository', 'A repository is required for local Git identity.')
    }
    const scope = global ? ['--global'] : ['--local']
    await this.exec(baseDir, async g => {
      await g.raw(['config', ...scope, 'user.name', name])
      await g.raw(['config', ...scope, 'user.email', email])
    })
  }

  async clearLocalUserIdentity(root: string): Promise<void> {
    await this.exec(root, async g => {
      try {
        await g.raw(['config', '--local', '--unset-all', 'user.name'])
      } catch {
        // Missing local keys are already in the desired state.
      }
      try {
        await g.raw(['config', '--local', '--unset-all', 'user.email'])
      } catch {
        // Missing local keys are already in the desired state.
      }
    })
  }

  /**
   * 切换分支/提交。
   * - force: `-f` 丢弃本地改动强制切换（破坏性）。
   * - merge: `-m` 三方合并，把本地未提交改动迁移到目标分支（冲突则留标记，进 Merge Changes）。
   */
  async checkout(root: string, ref: string, opts?: { force?: boolean; merge?: boolean; track?: boolean }): Promise<void> {
    const args = ['checkout']
    if (opts?.force) args.push('-f')
    if (opts?.merge) args.push('-m')
    if (opts?.track) args.push('--track')
    args.push(ref)
    await this.raw(root,args)
  }

  async createBranch(root: string, name: string, base?: string, checkout?: boolean): Promise<void> {
    if (checkout) {
      await this.raw(root, base ? ['checkout', '-b', name, base] : ['checkout', '-b', name])
    } else {
      await this.raw(root, base ? ['branch', name, base] : ['branch', name])
    }
  }

  async deleteBranch(root: string, name: string, force: boolean): Promise<void> {
    await this.raw(root,['branch', force ? '-D' : '-d', name])
  }

  /** 删除分支预检（三查）：未推送到远程 / 未并入 main / 有其他分支基于它派生 */
  async preflightDeleteBranch(root: string, name: string): Promise<{
    unpushedCommits: number
    mainRef: string | null
    mergedIntoMain: boolean
    descendantBranches: string[]
  }> {
    // 本地分支 → 确定主干（main/master）
    let locals: string[] = []
    try {
      locals = (await this.raw(root, ['branch', '--format=%(refname:short)'])).split('\n').map(s => s.trim()).filter(Boolean)
    } catch { /* ignore */ }
    const mainRef = locals.includes('main') ? 'main' : locals.includes('master') ? 'master' : null
    // ① 未推送：相对 upstream 领先的提交数（无 upstream → 0，不噪扰纯本地库）
    let unpushedCommits = 0
    try {
      unpushedCommits = parseInt((await this.raw(root, ['rev-list', '--count', `${name}@{upstream}..${name}`])).trim(), 10) || 0
    } catch { unpushedCommits = 0 }
    // ② 是否已并入主干
    let mergedIntoMain = false
    if (mainRef && mainRef !== name) {
      try {
        mergedIntoMain = (await this.raw(root, ['branch', '--merged', mainRef, '--format=%(refname:short)'])).split('\n').map(s => s.trim()).includes(name)
      } catch { mergedIntoMain = false }
    }
    // ③ 其他本地分支包含它的 tip（= 基于它派生）
    let descendantBranches: string[] = []
    try {
      descendantBranches = (await this.raw(root, ['branch', '--contains', name, '--format=%(refname:short)'])).split('\n').map(s => s.trim()).filter(n => n && n !== name)
    } catch { descendantBranches = [] }
    return { unpushedCommits, mainRef, mergedIntoMain, descendantBranches }
  }

  /** 合并预检：当前 HEAD 是否为目标分支的祖先（是→可快进，否→需合并提交/可能冲突） */
  async preflightMerge(root: string, branch: string): Promise<{ fastForward: boolean }> {
    try {
      await this.raw(root, ['merge-base', '--is-ancestor', 'HEAD', branch])
      return { fastForward: true }
    } catch {
      return { fastForward: false }
    }
  }

  // ---------- 标签 Tags ----------
  /** 列出标签（按创建时间倒序，最新在前） */
  async listTags(root: string): Promise<string[]> {
    let out = ''
    try {
      out = await this.raw(root,['tag', '--sort=-creatordate'])
    } catch {
      return []
    }
    return out.split('\n').map(l => l.trim()).filter(Boolean)
  }

  /** 创建标签：有 message → 附注标签（-a -m）；有 hash → 打在指定提交，否则 HEAD */
  async createTag(root: string, name: string, opts: { message?: string; hash?: string }): Promise<void> {
    const args = ['tag']
    if (opts.message) args.push('-a', '-m', opts.message)
    args.push(name)
    if (opts.hash) args.push(opts.hash)
    await this.raw(root,args)
  }

  async deleteTag(root: string, name: string): Promise<void> {
    await this.raw(root,['tag', '-d', name])
  }

  /** 推送所有标签到远程 */
  async pushTags(root: string): Promise<void> {
    await this.raw(root,['push', '--tags'])
  }

  /** 撤销上次提交，保留改动到工作区（soft reset，破坏性较低；调用方负责二次确认） */
  async undoLastCommit(root: string): Promise<void> {
    await this.raw(root,['reset', '--soft', 'HEAD~1'])
  }

  /** 重命名本地分支 */
  async renameBranch(root: string, oldName: string, newName: string): Promise<void> {
    await this.raw(root,['branch', '-m', oldName, newName])
  }

  async fetch(root: string): Promise<void> {
    const prune = this.getSettings().fetchPrune ? '--prune' : '--no-prune'
    await this.raw(root, ['fetch', prune])
  }

  private pullArgs(): string[] {
    const settings = this.getSettings()
    return [
      'pull',
      '--no-rebase',
      settings.pullAutoStash ? '--autostash' : '--no-autostash',
      settings.fetchPrune ? '--prune' : '--no-prune',
    ]
  }

  async pull(root: string): Promise<void> {
    // 文档版本管理固定保留历史的 merge 策略；显式 --no-rebase，避免外部 pull.rebase 配置改变行为。
    // autostash：脏工作区自动 stash→pull→pop；恢复冲突交给 Merge Changes。
    await this.raw(root, this.pullArgs())
  }

  private async pushWithGit(g: SimpleGit, opts: { setUpstream?: boolean }): Promise<void> {
    if (opts.setUpstream) {
      const cur = (await g.status()).current
      await g.raw(['push', '-u', 'origin', cur ?? 'HEAD'])
    } else {
      await g.raw(['push'])
    }
  }

  async push(root: string, opts: { setUpstream?: boolean }): Promise<void> {
    await this.exec(root, g => this.pushWithGit(g, opts))
  }

  /** 同步：固定 merge pull 后 push。 */
  async sync(root: string): Promise<void> {
    await this.exec(root, async g => {
      await g.raw(this.pullArgs())
      await this.pushWithGit(g, {})
    })
  }

  /** 发布：首次推送并设置 upstream */
  async publish(root: string): Promise<void> {
    await this.push(root, { setUpstream: true })
  }

  /** 列出远程（name + fetch URL，回退 push URL） */
  async listRemotes(root: string): Promise<{ name: string; url: string }[]> {
    const remotes = await this.exec(root, g => g.getRemotes(true))
    return remotes.map(r => ({ name: r.name, url: r.refs.fetch || r.refs.push || '' }))
  }

  async addRemote(root: string, name: string, url: string): Promise<void> {
    await this.exec(root, g => g.addRemote(name, url))
  }

  async removeRemote(root: string, name: string): Promise<void> {
    await this.exec(root, g => g.removeRemote(name))
  }

  // ---------- 贮藏 Stash ----------
  async stashPush(root: string, message?: string, includeUntracked?: boolean): Promise<void> {
    const args = ['stash', 'push']
    if (includeUntracked) args.push('-u')
    if (message) args.push('-m', message)
    await this.raw(root,args)
  }

  async stashList(root: string): Promise<{ index: number; message: string }[]> {
    let out = ''
    try {
      out = await this.raw(root,['stash', 'list', '--pretty=format:%gd%x1f%s'])
    } catch {
      return []
    }
    return out.split('\n').filter(Boolean).map((line, i) => {
      const [ref, subject] = line.split('\x1f')
      const m = /stash@\{(\d+)\}/.exec(ref ?? '')
      return { index: m ? Number(m[1]) : i, message: subject ?? '' }
    })
  }

  async stashApply(root: string, index: number): Promise<void> {
    await this.raw(root,['stash', 'apply', `stash@{${index}}`])
  }

  async stashPop(root: string, index: number): Promise<void> {
    await this.raw(root,['stash', 'pop', `stash@{${index}}`])
  }

  async stashDrop(root: string, index: number): Promise<void> {
    await this.raw(root,['stash', 'drop', `stash@{${index}}`])
  }

  async addToGitignore(root: string, relPath: string): Promise<void> {
    const file = path.join(root, '.gitignore')
    let existing = ''
    try { existing = await fs.readFile(file, 'utf-8') } catch { /* new file */ }
    const lines = existing.split('\n').map(l => l.trim())
    if (lines.includes(relPath)) return
    const sep = existing && !existing.endsWith('\n') ? '\n' : ''
    await fs.writeFile(file, existing + sep + relPath + '\n', 'utf-8')
  }

  async branches(root: string): Promise<GitBranchInfo> {
    const status = await this.exec(root, g => g.status())
    const branchSummary = await this.exec(root, g => g.branch())
    const local: string[] = []
    const remote: string[] = []
    for (const name of branchSummary.all) {
      if (name.startsWith('remotes/')) remote.push(name.replace(/^remotes\//, ''))
      else local.push(name)
    }
    return {
      current: status.current ?? branchSummary.current ?? '',
      detached: status.detached ?? false,
      ahead: status.ahead ?? 0,
      behind: status.behind ?? 0,
      upstream: status.tracking ?? undefined,
      local,
      remote,
    }
  }

  async diff(root: string, filePath: string, opts: { staged: boolean }, oldPath?: string): Promise<GitDiffPayload> {
    const abs = path.join(root, filePath)
    if (this.isBinaryPath(filePath)) {
      return { path: filePath, oldContent: '', newContent: '', isBinary: true }
    }
    // 重命名时旧内容取自源路径（HEAD:oldPath），否则新路径在 HEAD 里不存在会误判为整文件新增
    const headRef = `HEAD:${oldPath ?? filePath}`
    let oldContent = ''
    let newContent = ''
    try {
      if (opts.staged) {
        // 已暂存：HEAD ↔ index
        oldContent = await this.showSafe(root, headRef)
        newContent = await this.showSafe(root, `:${filePath}`)
      } else {
        // 未暂存：index(或 HEAD) ↔ 工作区磁盘
        const indexContent = await this.showOptional(root, `:${filePath}`)
        oldContent = indexContent ?? await this.showSafe(root, headRef)
        newContent = await this.readWorking(abs)
      }
    } catch {
      // 忽略：新增/删除文件某一侧不存在
    }
    return {
      path: filePath,
      oldContent: this.formatForDiff(filePath, oldContent),
      newContent: this.formatForDiff(filePath, newContent),
      isBinary: false,
    }
  }

  async log(root: string, opts: { filePath?: string; allBranches?: boolean; ref?: string; limit?: number; skip?: number }): Promise<GitCommit[]> {
    const args: string[] = [
      `--max-count=${opts.limit ?? 50}`,
      `--skip=${opts.skip ?? 0}`,
      '--decorate=short',
      // --date-order 保证「父不早于其全部子出现」——泳道图布局要求 child 先于 parent，
      // 否则并行分支/merge 在默认 commit-date 序下可能父先出现而错位。
      '--date-order',
      '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%at%x1f%D%x1f%P',
    ]
    if (opts.allBranches) args.push('--all')
    if (opts.ref) args.push(opts.ref)
    if (opts.filePath) { args.push('--', opts.filePath) }
    let out: string
    try {
      out = await this.raw(root, ['log', ...args])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      if (/does not have any commits yet/i.test(detail)) return []
      throw error
    }
    const remoteNames = await this.remoteNames(root)
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, subject, author, date, at, decoration, parents] = line.split('\x1f')
        return {
          hash, shortHash, subject, author, date,
          timestamp: Number(at) * 1000,
          refs: this.parseRefs(decoration ?? '', remoteNames),
          parents: (parents ?? '').split(' ').filter(Boolean),
        } as GitCommit
      })
  }

  /** 已配置的远程名集合，用于把 `<remote>/<branch>` 装饰判为远程引用。 */
  private async remoteNames(root: string): Promise<Set<string>> {
    try {
      const out = await this.raw(root, ['remote'])
      return new Set(out.split('\n').map(s => s.trim()).filter(Boolean))
    } catch {
      return new Set()
    }
  }

  /** 解析 git %D 装饰串（如 "HEAD -> main, origin/main, tag: v1.0"）为结构化引用 */
  private parseRefs(decoration: string, remoteNames: Set<string>): GitCommitRef[] {
    if (!decoration.trim()) return []
    return decoration.split(',').map(raw => {
      const s = raw.trim()
      if (s.startsWith('tag:')) return { name: s.slice(4).trim(), kind: 'tag' as const }
      if (s.startsWith('HEAD ->')) return { name: s.slice(7).trim(), kind: 'head' as const }
      if (s === 'HEAD') return { name: 'HEAD', kind: 'head' as const }
      // 远程引用形如 <remote>/<branch>；仅当首段是已知远程名才判为 remote，
      // 否则含 '/' 的本地分支（如 feature/x）会被误判为远程（丢失 unpublished 标记、配色错位）。
      const slash = s.indexOf('/')
      if (slash > 0 && remoteNames.has(s.slice(0, slash))) return { name: s, kind: 'remote' as const }
      return { name: s, kind: 'branch' as const }
    }).filter(r => r.name)
  }

  async commitFiles(root: string, hash: string): Promise<GitFileChange[]> {
    let out: string
    try {
      out = await this.raw(root, ['show', '--name-status', '--pretty=format:', hash])
    } catch {
      return []
    }
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('\t')
        const code = parts[0]?.[0] ?? 'M'
        const p = parts[parts.length - 1] ?? ''
        const oldPath = parts.length >= 3 ? parts[1] : undefined
        return this.makeChange(p, this.mapStatus(code), false, oldPath)
      })
  }

  async commitFileDiff(root: string, hash: string, filePath: string, oldPath?: string): Promise<GitDiffPayload> {
    if (this.isBinaryPath(filePath)) {
      return { path: filePath, oldContent: '', newContent: '', isBinary: true }
    }
    const oldContent = await this.showSafe(root, `${hash}~1:${oldPath ?? filePath}`)
    const newContent = await this.showSafe(root, `${hash}:${filePath}`)
    return {
      path: filePath,
      oldContent: this.formatForDiff(filePath, oldContent),
      newContent: this.formatForDiff(filePath, newContent),
      isBinary: false,
    }
  }

  /**
   * 取合并冲突文件的三方版本（:1 base / :2 ours / :3 theirs）+ 工作区当前内容（含标记）。
   * 用于合并 tab；某侧在冲突中被删除时对应 show 失败 → 空串。
   */
  async conflictVersions(root: string, filePath: string): Promise<{ base: string; ours: string; theirs: string; working: string }> {
    const abs = path.join(root, filePath)
    const [base, ours, theirs, working] = await Promise.all([
      this.showSafe(root, `:1:${filePath}`),
      this.showSafe(root, `:2:${filePath}`),
      this.showSafe(root, `:3:${filePath}`),
      this.readWorking(abs),
    ])
    return { base, ours, theirs, working }
  }

  /** 将单个文件还原到某提交的版本（覆盖工作区+index） */
  async restoreFile(root: string, hash: string, filePath: string): Promise<void> {
    await this.raw(root,['checkout', hash, '--', filePath])
  }

  /** 合并指定分支到当前分支（冲突时 git 以非零退出，交由渲染层按 status 呈现 Merge Changes） */
  async merge(root: string, branch: string): Promise<void> {
    await this.raw(root,['merge', branch])
  }

  /**
   * 应用 unified diff 补丁（用于 hunk 级 stage/discard/unstage）。
   * - cached: `--cached`（更新 index，用于暂存/取消暂存）；否则应用到工作区（用于放弃）。
   * - reverse: `-R`（反向应用，用于放弃/取消暂存）。
   * 补丁经临时文件传入（simple-git 不便走 stdin）。失败抛错，交渲染层提示。
   */
  async applyPatch(root: string, patch: string, opts: { cached?: boolean; reverse?: boolean }): Promise<void> {
    const tmp = path.join(os.tmpdir(), `iwriter-hunk-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`)
    // 补丁以 \n 行尾；确保末尾有换行，git apply 对此敏感
    await fs.writeFile(tmp, patch.endsWith('\n') ? patch : patch + '\n', 'utf-8')
    try {
      const args = ['apply', '--whitespace=nowarn']
      if (opts.cached) args.push('--cached')
      if (opts.reverse) args.push('--reverse')
      args.push('--', tmp)
      await this.raw(root,args)
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => { /* ignore */ })
    }
  }

  dispose(root?: string): void {
    if (root) { this.cache.delete(root); this.tails.delete(root) }
    else { this.cache.clear(); this.tails.clear() }
  }

  // ---------- 内部工具 ----------

  private async isMerging(root: string): Promise<boolean> {
    try {
      await fs.access(path.join(root, '.git', 'MERGE_HEAD'))
      return true
    } catch {
      return false
    }
  }

  private async showSafe(root: string, ref: string): Promise<string> {
    return (await this.showOptional(root, ref)) ?? ''
  }

  private async showOptional(root: string, ref: string): Promise<string | null> {
    try {
      return await this.exec(root, g => g.show([ref]))
    } catch {
      return null
    }
  }

  private async readWorking(abs: string): Promise<string> {
    try {
      return await fs.readFile(abs, 'utf-8')
    } catch {
      return ''
    }
  }

  private makeChange(p: string, status: GitFileStatus, staged: boolean, oldPath?: string): GitFileChange {
    const norm = p.replace(/\\/g, '/')
    const idx = norm.lastIndexOf('/')
    return {
      path: norm,
      dir: idx >= 0 ? norm.slice(0, idx + 1) : '',
      name: idx >= 0 ? norm.slice(idx + 1) : norm,
      status,
      staged,
      isBinary: this.isBinaryPath(norm),
      oldPath,
    }
  }

  private mapStatus(code: string): GitFileStatus {
    switch (code) {
      case 'A': return 'A'
      case 'D': return 'D'
      case 'R': return 'R'
      case 'U': return 'C'
      case '?': return 'U'
      default: return 'M'
    }
  }

  private isBinaryPath(p: string): boolean {
    return BINARY_EXTS.has(path.extname(p).toLowerCase())
  }

  /** `.iwt` 为 JSON：格式化后再 diff，避免整行差异 */
  private formatForDiff(filePath: string, raw: string): string {
    if (!raw) return raw
    if (path.extname(filePath).toLowerCase() === '.iwt') {
      try {
        return JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        return raw
      }
    }
    return raw
  }
}
