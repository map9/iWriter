// 版本控制共享类型（主进程 GitService ↔ 渲染层 stores/git）

export interface GitAvailability {
  available: boolean
  version?: string
  path?: string
  error?: string
  /** 未安装时的按平台安装命令（供 SCM 面板安装引导，对齐 LibreOffice） */
  installCommand?: string
  /** 未安装时的下载页 URL */
  downloadUrl?: string
}

export type GitPathMode = 'auto' | 'custom'
export type GitCommitWhenEmpty = 'all' | 'off' | 'prompt'
export type GitDiffLayout = 'split' | 'inline'
export type GitListLayout = 'list' | 'tree'

/**
 * iWriter 自身的版本控制偏好。Git 仓库配置（身份、remote、upstream 等）
 * 仍由原生 Git 配置持有，不复制到这里。
 */
export interface SourceControlSettings {
  gitPathMode: GitPathMode
  gitPath: string
  commitWhenEmpty: GitCommitWhenEmpty
  pullAutoStash: boolean
  fetchPrune: boolean
  diffLayout: GitDiffLayout
  diffShowLineNumbers: boolean
  showRepositories: boolean
  showGraph: boolean
  changesLayout: GitListLayout
  graphFilesLayout: GitListLayout
}

export const DEFAULT_SOURCE_CONTROL_SETTINGS: SourceControlSettings = {
  gitPathMode: 'auto',
  gitPath: '',
  commitWhenEmpty: 'all',
  pullAutoStash: true,
  fetchPrune: true,
  diffLayout: 'split',
  diffShowLineNumbers: true,
  showRepositories: true,
  showGraph: true,
  changesLayout: 'list',
  graphFilesLayout: 'list',
}

export interface GitIdentity {
  name?: string
  email?: string
}

export interface GitIdentityScopes {
  global: GitIdentity
  local?: GitIdentity
  effective: GitIdentity
}

/** 主进程中的 Git 写操作通知渲染层按影响范围刷新 SCM。 */
export type GitMutationKind = 'repository' | 'working-tree' | 'history' | 'tags'

export interface GitMutationEvent {
  root: string
  kind: GitMutationKind
}

/** 可预期的 Git 操作问题：主进程识别，渲染层只负责展示与恢复。 */
export type GitIssueKind =
  | 'branch-unmerged'
  | 'checkout-dirty'
  | 'remote-auth'
  | 'remote-non-fast-forward'
  | 'network'
  | 'unknown'

export interface GitIssue {
  kind: GitIssueKind
  operation: string
  detail: string
  branch?: string
}

export type GitActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; issue: GitIssue }

/** 删除分支预检结果（三查）：由渲染层组织成大白话问题清单 + 决定按钮为「删除」还是「强制删除」 */
export interface DeleteBranchPreflight {
  /** 相对 upstream 未推送的提交数（无 upstream=0） */
  unpushedCommits: number
  /** 主干分支名（main/master），无则 null */
  mainRef: string | null
  /** 是否已并入主干 */
  mergedIntoMain: boolean
  /** 基于本分支派生的其他本地分支 */
  descendantBranches: string[]
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

export interface GitRemote {
  name: string
  /** fetch URL（无则回退 push URL） */
  url: string
}

/** 贮藏条目（git stash list） */
export interface GitStashEntry {
  /** stash@{index} 的序号 */
  index: number
  /** 描述（%s，如 "WIP on main: ..."） */
  message: string
}

/** 长耗时远程操作（clone/fetch/push/pull/checkout）的进度事件（来自 simple-git progress 插件） */
export interface GitProgress {
  /** 操作：clone | fetch | push | pull | checkout */
  method: string
  /** 阶段：counting | compressing | receiving | resolving | writing 等 */
  stage: string
  /** 百分比 0-100 */
  progress: number
  processed?: number
  total?: number
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
  /** 父提交全 hash（来自 git %P）；merge 提交有多个，根提交为空——供泳道图 DAG 布局 */
  parents: string[]
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
 * 合并冲突文件的三方版本（来自 git 冲突暂存阶段 :1/:2/:3）+ 工作区当前内容（含冲突标记）。
 * 用于合并 tab 的 2-pane（ours↔theirs 对照）+ 可编辑结果。
 */
export interface ConflictVersions {
  /** :1: 共同祖先（diff3），某侧删除则为空 */
  base: string
  /** :2: 当前分支 ours */
  ours: string
  /** :3: 传入分支 theirs */
  theirs: string
  /** 工作区文件当前内容（git 已写入 <<<<<<< 冲突标记），作为结果侧初值 */
  working: string
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
  /** working=工作区/暂存对比；commit=某提交对父提交；conflict=合并冲突（F9 合并 tab） */
  kind: 'working' | 'commit' | 'conflict'
  /** kind=working：false→场景1(index↔工作区)，true→场景2(HEAD↔index) */
  staged?: boolean
  /** kind=commit：目标提交 hash（对比其父提交） */
  hash?: string
  /** kind=commit 且文件在该提交中被重命名时的父提交路径 */
  oldPath?: string
  /** 该场景天然是否可编辑（场景1未暂存 / conflict 结果侧=true） */
  editable?: boolean
}

/** 渲染层通过 window.electronAPI.git.* 调用的接口 */
export interface GitApi {
  settingsGet: () => Promise<SourceControlSettings>
  settingsUpdate: (patch: Partial<SourceControlSettings>) => Promise<SourceControlSettings>
  detect: (force?: boolean, candidatePath?: string | null) => Promise<GitAvailability>
  isRepo: (root: string) => Promise<boolean>
  init: (root: string) => Promise<void>
  status: (root: string) => Promise<GitStatus>
  branches: (root: string) => Promise<GitBranchInfo>
  diff: (root: string, filePath: string, opts: { staged: boolean }, oldPath?: string) => Promise<GitDiffPayload>
  log: (root: string, opts: { filePath?: string; allBranches?: boolean; ref?: string; limit?: number; skip?: number }) => Promise<GitCommit[]>
  commitFiles: (root: string, hash: string) => Promise<GitFileChange[]>
  commitFileDiff: (root: string, hash: string, filePath: string, oldPath?: string) => Promise<GitDiffPayload>
  conflictVersions: (root: string, filePath: string) => Promise<ConflictVersions>
  restoreFile: (root: string, hash: string, filePath: string) => Promise<void>
  merge: (root: string, branch: string) => Promise<void>
  applyPatch: (root: string, patch: string, opts: { cached?: boolean; reverse?: boolean }) => Promise<void>
  stage: (root: string, paths: string[]) => Promise<void>
  unstage: (root: string, paths: string[]) => Promise<void>
  stageAll: (root: string) => Promise<void>
  unstageAll: (root: string) => Promise<void>
  discard: (root: string, paths: string[]) => Promise<void>
  commit: (root: string, message: string, opts: { all?: boolean; amend?: boolean }) => Promise<void>
  identityGet: (root: string | null) => Promise<GitIdentity>
  identityGetScopes: (root: string | null) => Promise<GitIdentityScopes>
  identitySet: (root: string | null, name: string, email: string, global: boolean) => Promise<void>
  identityClearLocal: (root: string) => Promise<void>
  checkout: (root: string, ref: string, opts?: { force?: boolean; merge?: boolean; track?: boolean }) => Promise<GitActionResult<void>>
  createBranch: (root: string, name: string, base?: string, checkout?: boolean) => Promise<void>
  deleteBranch: (root: string, name: string, force: boolean) => Promise<GitActionResult<void>>
  preflightDeleteBranch: (root: string, name: string) => Promise<DeleteBranchPreflight>
  preflightMerge: (root: string, branch: string) => Promise<{ fastForward: boolean }>
  listTags: (root: string) => Promise<string[]>
  createTag: (root: string, name: string, opts: { message?: string; hash?: string }) => Promise<void>
  deleteTag: (root: string, name: string) => Promise<void>
  pushTags: (root: string) => Promise<GitActionResult<void>>
  undoLastCommit: (root: string) => Promise<void>
  renameBranch: (root: string, oldName: string, newName: string) => Promise<void>
  addToGitignore: (root: string, relPath: string) => Promise<void>
  clone: (url: string, dir: string) => Promise<GitActionResult<void>>
  fetch: (root: string) => Promise<GitActionResult<void>>
  pull: (root: string) => Promise<GitActionResult<void>>
  push: (root: string, opts: { setUpstream?: boolean }) => Promise<GitActionResult<void>>
  sync: (root: string) => Promise<GitActionResult<void>>
  publish: (root: string) => Promise<GitActionResult<void>>
  listRemotes: (root: string) => Promise<GitRemote[]>
  addRemote: (root: string, name: string, url: string) => Promise<void>
  removeRemote: (root: string, name: string) => Promise<void>
  stashPush: (root: string, message?: string, includeUntracked?: boolean) => Promise<void>
  stashList: (root: string) => Promise<GitStashEntry[]>
  stashApply: (root: string, index: number) => Promise<void>
  stashPop: (root: string, index: number) => Promise<void>
  stashDrop: (root: string, index: number) => Promise<void>
  /** 订阅主进程 Git 写操作；返回取消订阅函数 */
  onMutation: (callback: (event: GitMutationEvent) => void) => () => void
  /** 订阅长耗时操作进度；返回取消订阅函数 */
  onProgress: (callback: (p: GitProgress) => void) => () => void
}
