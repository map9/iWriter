// 版本控制共享类型（主进程 GitService ↔ 渲染层 stores/git）

export interface GitAvailability {
  available: boolean
  version?: string
  path?: string
}

/** M=修改 A=新增 D=删除 R=重命名 U=未跟踪 C=冲突 */
export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | 'U' | 'C'

export interface GitFileChange {
  /** 相对仓库根的路径 */
  path: string
  /** 目录部分（含尾斜杠或空） */
  dir: string
  /** 文件名 */
  name: string
  status: GitFileStatus
  /** 是否已暂存 */
  staged: boolean
  isBinary?: boolean
  /** 重命名来源路径 */
  oldPath?: string
}

export interface GitStatus {
  staged: GitFileChange[]
  changes: GitFileChange[]
  untracked: GitFileChange[]
  conflicts: GitFileChange[]
  isMerging: boolean
}

export interface GitBranchInfo {
  current: string
  detached: boolean
  ahead: number
  behind: number
  upstream?: string
  local: string[]
  remote: string[]
}

export interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  author: string
  /** ISO 日期 */
  date: string
  /** 相对时间（如 "2 小时前"）由渲染层格式化，这里给原始时间戳 */
  timestamp: number
  /** 指向该提交的引用装饰（分支/远程/tag/HEAD），来自 git %D */
  refs?: GitCommitRef[]
}

export interface GitCommitRef {
  /** 显示名（已去掉 HEAD-> / tag: 前缀） */
  name: string
  kind: 'head' | 'branch' | 'remote' | 'tag'
}

export interface GitDiffPayload {
  path: string
  oldContent: string
  newContent: string
  isBinary: boolean
}

/**
 * Diff tab 的自描述规格（FileTab.params.diff）。DiffViewerPage 据此自取内容。
 * 对比场景见 design/SOURCE_CONTROL §F7.2。
 */
export interface DiffSpec {
  /** 仓库根 */
  root: string
  /** 仓库相对路径 */
  filePath: string
  /** working=工作区/暂存对比；commit=某提交对父提交 */
  kind: 'working' | 'commit'
  /** kind=working：false→场景1(index↔工作区)，true→场景2(HEAD↔index) */
  staged?: boolean
  /** kind=commit：目标提交 hash（对比其父提交） */
  hash?: string
  /** 该场景天然是否可编辑（场景1/5=true）；本期恒以只读渲染，仅作未来开关 */
  editable?: boolean
}

/** 渲染层通过 window.electronAPI.git.* 调用的接口 */
export interface GitApi {
  detect: () => Promise<GitAvailability>
  isRepo: (root: string) => Promise<boolean>
  init: (root: string) => Promise<void>
  status: (root: string) => Promise<GitStatus>
  branches: (root: string) => Promise<GitBranchInfo>
  diff: (root: string, filePath: string, opts: { staged: boolean }) => Promise<GitDiffPayload>
  log: (root: string, opts: { filePath?: string; allBranches?: boolean; ref?: string; limit?: number; skip?: number }) => Promise<GitCommit[]>
  commitFiles: (root: string, hash: string) => Promise<GitFileChange[]>
  commitFileDiff: (root: string, hash: string, filePath: string) => Promise<GitDiffPayload>
  restoreFile: (root: string, hash: string, filePath: string) => Promise<void>
  merge: (root: string, branch: string) => Promise<void>
  stage: (root: string, paths: string[]) => Promise<void>
  unstage: (root: string, paths: string[]) => Promise<void>
  stageAll: (root: string) => Promise<void>
  unstageAll: (root: string) => Promise<void>
  discard: (root: string, paths: string[]) => Promise<void>
  commit: (root: string, message: string, opts: { all?: boolean; amend?: boolean }) => Promise<void>
  identityGet: (root: string) => Promise<{ name?: string; email?: string }>
  identitySet: (root: string, name: string, email: string, global: boolean) => Promise<void>
  checkout: (root: string, ref: string) => Promise<void>
  createBranch: (root: string, name: string, base?: string, checkout?: boolean) => Promise<void>
  deleteBranch: (root: string, name: string, force: boolean) => Promise<void>
  addToGitignore: (root: string, relPath: string) => Promise<void>
  clone: (url: string, dir: string) => Promise<void>
  fetch: (root: string) => Promise<void>
  pull: (root: string, opts: { rebase?: boolean }) => Promise<void>
  push: (root: string, opts: { setUpstream?: boolean }) => Promise<void>
  sync: (root: string, opts: { rebase?: boolean }) => Promise<void>
  publish: (root: string) => Promise<void>
}
