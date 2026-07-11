import { execFile } from 'child_process'
import * as path from 'path'
import * as fs from 'fs/promises'
import simpleGit, { type SimpleGit } from 'simple-git'
import type {
  GitAvailability,
  GitBranchInfo,
  GitCommit,
  GitDiffPayload,
  GitFileChange,
  GitFileStatus,
  GitStatus,
} from '../src/types/git'

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf',
  '.zip', '.gz', '.tar', '.mp3', '.mp4', '.mov', '.woff', '.woff2', '.ttf', '.otf',
])

/**
 * 版本控制服务：对系统 `git` 二进制的封装（经 simple-git）。
 * 所有 git 操作在主进程执行，渲染层经 IPC 调用。
 */
export class GitService {
  private cache = new Map<string, SimpleGit>()
  private availability: GitAvailability | null = null

  private git(root: string): SimpleGit {
    let g = this.cache.get(root)
    if (!g) {
      // core.quotepath=false：让含非 ASCII（如中文）的路径原样输出 UTF-8，
      // 否则 git 会把中文路径转义成 "\345\244\247…" 八进制，导致图谱显示乱码、
      // 且据此路径再 `git show hash:path` 无法命中（diff 显示"没有更改"）。
      g = simpleGit({ baseDir: root, config: ['core.quotepath=false'] })
      this.cache.set(root, g)
    }
    return g
  }

  /** 检测系统是否安装 git（缓存结果） */
  async detect(): Promise<GitAvailability> {
    if (this.availability) return this.availability
    this.availability = await new Promise<GitAvailability>((resolve) => {
      execFile('git', ['--version'], (err, stdout) => {
        if (err) {
          resolve({ available: false })
        } else {
          const version = stdout.toString().replace(/^git version\s*/i, '').trim()
          resolve({ available: true, version, path: 'git' })
        }
      })
    })
    return this.availability
  }

  async isRepo(root: string): Promise<boolean> {
    try {
      return await this.git(root).checkIsRepo()
    } catch {
      return false
    }
  }

  async init(root: string): Promise<void> {
    await this.git(root).init()
  }

  async clone(url: string, dir: string): Promise<void> {
    await simpleGit().clone(url, dir)
  }

  async status(root: string): Promise<GitStatus> {
    const s = await this.git(root).status()
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
      // 已暂存（index 非空非 '?'）
      if (f.index && f.index !== ' ' && f.index !== '?') {
        staged.push(this.makeChange(p, this.mapStatus(f.index), true))
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
    if (paths.length) await this.git(root).add(paths)
  }

  async unstage(root: string, paths: string[]): Promise<void> {
    if (paths.length) await this.git(root).raw(['restore', '--staged', '--', ...paths])
  }

  async stageAll(root: string): Promise<void> {
    await this.git(root).add(['-A'])
  }

  async unstageAll(root: string): Promise<void> {
    await this.git(root).raw(['reset'])
  }

  /** 放弃更改：tracked 还原到 HEAD、untracked 直接清理 */
  async discard(root: string, paths: string[]): Promise<void> {
    if (!paths.length) return
    const s = await this.git(root).status()
    const untrackedSet = new Set(s.not_added)
    const tracked = paths.filter(p => !untrackedSet.has(p))
    const untracked = paths.filter(p => untrackedSet.has(p))
    if (tracked.length) {
      await this.git(root).raw(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked])
    }
    if (untracked.length) {
      await this.git(root).raw(['clean', '-f', '--', ...untracked])
    }
  }

  async commit(root: string, message: string, opts: { all?: boolean; amend?: boolean }): Promise<void> {
    const args = ['commit', '-m', message]
    if (opts.all) args.push('-a')
    if (opts.amend) args.push('--amend')
    await this.git(root).raw(args)
  }

  async getUserIdentity(root: string): Promise<{ name?: string; email?: string }> {
    const read = async (key: string) => {
      try {
        return (await this.git(root).raw(['config', key])).trim() || undefined
      } catch {
        return undefined
      }
    }
    return { name: await read('user.name'), email: await read('user.email') }
  }

  async setUserIdentity(root: string, name: string, email: string, global: boolean): Promise<void> {
    const scope = global ? ['--global'] : []
    await this.git(root).raw(['config', ...scope, 'user.name', name])
    await this.git(root).raw(['config', ...scope, 'user.email', email])
  }

  async checkout(root: string, ref: string): Promise<void> {
    await this.git(root).checkout(ref)
  }

  async createBranch(root: string, name: string, base?: string, checkout?: boolean): Promise<void> {
    const g = this.git(root)
    if (checkout) {
      await g.raw(base ? ['checkout', '-b', name, base] : ['checkout', '-b', name])
    } else {
      await g.raw(base ? ['branch', name, base] : ['branch', name])
    }
  }

  async deleteBranch(root: string, name: string, force: boolean): Promise<void> {
    await this.git(root).raw(['branch', force ? '-D' : '-d', name])
  }

  async fetch(root: string): Promise<void> {
    await this.git(root).raw(['fetch', '--prune'])
  }

  async pull(root: string, opts: { rebase?: boolean }): Promise<void> {
    const args = ['pull']
    if (opts.rebase) args.push('--rebase')
    await this.git(root).raw(args)
  }

  async push(root: string, opts: { setUpstream?: boolean }): Promise<void> {
    if (opts.setUpstream) {
      const cur = (await this.git(root).status()).current
      await this.git(root).raw(['push', '-u', 'origin', cur ?? 'HEAD'])
    } else {
      await this.git(root).raw(['push'])
    }
  }

  /** 同步：pull（可变基）后 push */
  async sync(root: string, opts: { rebase?: boolean }): Promise<void> {
    await this.pull(root, opts)
    await this.push(root, {})
  }

  /** 发布：首次推送并设置 upstream */
  async publish(root: string): Promise<void> {
    await this.push(root, { setUpstream: true })
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
    const g = this.git(root)
    const status = await g.status()
    const branchSummary = await g.branch()
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

  async diff(root: string, filePath: string, opts: { staged: boolean }): Promise<GitDiffPayload> {
    const abs = path.join(root, filePath)
    if (this.isBinaryPath(filePath)) {
      return { path: filePath, oldContent: '', newContent: '', isBinary: true }
    }
    const g = this.git(root)
    let oldContent = ''
    let newContent = ''
    try {
      if (opts.staged) {
        // 已暂存：HEAD ↔ index
        oldContent = await this.showSafe(g, `HEAD:${filePath}`)
        newContent = await this.showSafe(g, `:${filePath}`)
      } else {
        // 未暂存：index(或 HEAD) ↔ 工作区磁盘
        oldContent = await this.showSafe(g, `:${filePath}`)
        if (!oldContent) oldContent = await this.showSafe(g, `HEAD:${filePath}`)
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
    const g = this.git(root)
    const args: string[] = [
      `--max-count=${opts.limit ?? 50}`,
      `--skip=${opts.skip ?? 0}`,
      '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1f%at',
    ]
    if (opts.allBranches) args.push('--all')
    if (opts.ref) args.push(opts.ref)
    if (opts.filePath) { args.push('--', opts.filePath) }
    let out: string
    try {
      out = await g.raw(['log', ...args])
    } catch {
      return []
    }
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, subject, author, date, at] = line.split('\x1f')
        return {
          hash, shortHash, subject, author, date,
          timestamp: Number(at) * 1000,
        } as GitCommit
      })
  }

  async commitFiles(root: string, hash: string): Promise<GitFileChange[]> {
    const g = this.git(root)
    let out: string
    try {
      out = await g.raw(['show', '--name-status', '--pretty=format:', hash])
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
        return this.makeChange(p, this.mapStatus(code), false)
      })
  }

  async commitFileDiff(root: string, hash: string, filePath: string): Promise<GitDiffPayload> {
    if (this.isBinaryPath(filePath)) {
      return { path: filePath, oldContent: '', newContent: '', isBinary: true }
    }
    const g = this.git(root)
    const oldContent = await this.showSafe(g, `${hash}~1:${filePath}`)
    const newContent = await this.showSafe(g, `${hash}:${filePath}`)
    return {
      path: filePath,
      oldContent: this.formatForDiff(filePath, oldContent),
      newContent: this.formatForDiff(filePath, newContent),
      isBinary: false,
    }
  }

  /** 将单个文件还原到某提交的版本（覆盖工作区+index） */
  async restoreFile(root: string, hash: string, filePath: string): Promise<void> {
    await this.git(root).raw(['checkout', hash, '--', filePath])
  }

  dispose(root?: string): void {
    if (root) this.cache.delete(root)
    else this.cache.clear()
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

  private async showSafe(g: SimpleGit, ref: string): Promise<string> {
    try {
      return await g.show([ref])
    } catch {
      return ''
    }
  }

  private async readWorking(abs: string): Promise<string> {
    try {
      return await fs.readFile(abs, 'utf-8')
    } catch {
      return ''
    }
  }

  private makeChange(p: string, status: GitFileStatus, staged: boolean): GitFileChange {
    const norm = p.replace(/\\/g, '/')
    const idx = norm.lastIndexOf('/')
    return {
      path: norm,
      dir: idx >= 0 ? norm.slice(0, idx + 1) : '',
      name: idx >= 0 ? norm.slice(idx + 1) : norm,
      status,
      staged,
      isBinary: this.isBinaryPath(norm),
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
