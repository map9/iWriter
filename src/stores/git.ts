import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notify } from '@/utils/notifications'
import { i18n } from '@/i18n'
import { pathUtils } from '@/utils/pathUtils'
import { useAppStore } from './app'
import type {
  GitAvailability,
  GitBranchInfo,
  GitCommit,
  DiffSpec,
  GitFileChange,
  GitProgress,
  GitRemote,
  GitStashEntry,
  GitStatus,
} from '@/types/git'

/**
 * 版本控制渲染层状态：单一数据源，组件只读 + 派发 action。
 * 仓库根 = 当前工作空间文件夹（单仓库）。
 */
export const useGitStore = defineStore('git', () => {
  const api = () => window.electronAPI.git

  // 环境 / 仓库
  const availability = ref<GitAvailability>({ available: false })
  const root = ref<string | null>(null)
  const isRepo = ref(false)

  // 状态
  const status = ref<GitStatus | null>(null)
  const branch = ref<GitBranchInfo | null>(null)

  // 图谱
  const commits = ref<GitCommit[]>([])
  const expandedHash = ref<string | null>(null)
  const expandedFiles = ref<GitFileChange[]>([])
  /** 图谱查看的分支；null = 当前分支 HEAD */
  const graphBranch = ref<string | null>(null)
  /** 图谱是否显示所有分支（git log --all）；为 true 时忽略 graphBranch */
  const graphAll = ref(false)

  // 加载标志
  const loading = ref(false)
  const graphLoading = ref(false)
  /** 正在进行的远程操作：'sync'|'pull'|'push'|'fetch'|'publish'|null */
  const busy = ref<string | null>(null)
  /** 状态修订号：每次刷新/写操作后自增，供 Timeline 等外部视图感知变化 */
  const revision = ref(0)
  /** 克隆弹窗（NoFolderOpened / SCM 面板共用） */
  const cloneDialogOpen = ref(false)

  // 提交
  const commitMessage = ref('')
  const committing = ref(false)
  // 提交身份缺失 → 弹窗
  const identityPromptOpen = ref(false)
  let pendingCommit: { all?: boolean; amend?: boolean } | null = null

  // 派生
  const changeCount = computed(() => {
    const s = status.value
    if (!s) return 0
    return s.staged.length + s.changes.length + s.untracked.length + s.conflicts.length
  })
  const hasChanges = computed(() => changeCount.value > 0)

  /** 检测 git 环境（缓存） */
  async function ensureDetected(): Promise<GitAvailability> {
    if (!availability.value.available) {
      availability.value = await api().detect()
    }
    return availability.value
  }

  /** 工作空间文件夹变化时调用 */
  let folderChangeGeneration = 0
  async function onFolderChanged(newRoot: string | null): Promise<void> {
    const generation = ++folderChangeGeneration
    root.value = newRoot
    resetRepoState()
    if (!newRoot) return
    await ensureDetected()
    if (generation !== folderChangeGeneration) return
    if (!availability.value.available) return
    isRepo.value = await api().isRepo(newRoot)
    if (generation !== folderChangeGeneration) return
    if (isRepo.value) await refresh()
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  // 单飞：一次只跑一轮 status+branches；进行中被再次请求则合并为「跑完再补一轮」，
  // 避免快速连续的文件事件/写操作把多轮刷新并发堆叠（配合主进程仓库级互斥，双保险）。
  let refreshing = false
  let refreshQueued = false
  // 等待者：防抖窗口内所有 refresh() 调用把各自的 resolve 挂到这里；clearTimeout 只取消
  // 定时器、绝不丢弃任何 resolve，本轮刷新真正完成（或跳过）时一并 flush。
  // 否则旧实现里被取消的那次 refresh 的 Promise 永不 resolve，会令等待它的
  // afterWrite()/run()/remoteRun()/commit() 连同 busy/committing/loading 永久挂起。
  let refreshWaiters: Array<() => void> = []
  function flushRefreshWaiters(): void {
    const ws = refreshWaiters
    refreshWaiters = []
    for (const r of ws) r()
  }

  /** 刷新 status + branches（去抖 + 单飞合并；所有等待者在本轮完成时一并 resolve） */
  function refresh(): Promise<void> {
    return new Promise<void>((resolve) => {
      refreshWaiters.push(resolve)
      // 已有刷新在跑：标记补一轮，本等待者随该轮结束的 flush 一并 resolve（不另起定时器）
      if (refreshing) { refreshQueued = true; return }
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(runRefresh, 150)
    })
  }

  async function runRefresh(): Promise<void> {
    refreshTimer = null
    if (!root.value || !isRepo.value) return flushRefreshWaiters()
    refreshing = true
    loading.value = true
    try {
      do {
        refreshQueued = false
        const [s, b] = await Promise.all([
          api().status(root.value),
          api().branches(root.value),
        ])
        status.value = s
        branch.value = b
        revision.value++
      } while (refreshQueued) // 期间又被请求 → 收敛为再跑一轮
    } catch (err) {
      console.error('[git] refresh failed', err)
    } finally {
      refreshing = false
      loading.value = false
      flushRefreshWaiters()
    }
  }

  /** 图谱每页条数；是否可能还有更早提交（末页判断） */
  const GRAPH_PAGE = 50
  const graphHasMore = ref(false)

  /** 构造 log 参数（沿用当前分支/所有分支选择） */
  function graphLogOpts(limit: number, skip: number) {
    return graphAll.value
      ? { limit, skip, allBranches: true }
      : { limit, skip, ref: graphBranch.value ?? undefined }
  }

  /** 加载提交图谱（graphBranch 指定分支，null=当前 HEAD）；刷新时保留已加载深度 */
  async function loadGraph(): Promise<void> {
    if (!root.value || !isRepo.value) return
    graphLoading.value = true
    const limit = Math.max(GRAPH_PAGE, commits.value.length)
    try {
      const batch = await api().log(root.value, graphLogOpts(limit, 0))
      commits.value = batch
      graphHasMore.value = batch.length >= limit
    } catch (err) {
      console.error('[git] loadGraph failed', err)
      commits.value = []
      graphHasMore.value = false
    } finally {
      graphLoading.value = false
    }
  }

  /** 追加更早的一页提交（滚动/按钮加载更多） */
  async function loadMoreGraph(): Promise<void> {
    if (!root.value || !isRepo.value || graphLoading.value || !graphHasMore.value) return
    graphLoading.value = true
    try {
      const batch = await api().log(root.value, graphLogOpts(GRAPH_PAGE, commits.value.length))
      commits.value = [...commits.value, ...batch]
      graphHasMore.value = batch.length >= GRAPH_PAGE
    } catch (err) {
      console.error('[git] loadMoreGraph failed', err)
    } finally {
      graphLoading.value = false
    }
  }

  /** 切换图谱查看的分支并重载；name=null 回到当前 HEAD，all=true 显示所有分支 */
  function setGraphBranch(name: string | null, all = false): void {
    graphAll.value = all
    graphBranch.value = all ? null : name
    expandedHash.value = null
    expandedFiles.value = []
    void loadGraph()
  }

  /** 展开某提交，加载其文件列表 */
  async function toggleCommit(hash: string): Promise<void> {
    if (expandedHash.value === hash) {
      expandedHash.value = null
      expandedFiles.value = []
      return
    }
    expandedHash.value = hash
    expandedFiles.value = []
    if (!root.value) return
    try {
      expandedFiles.value = await api().commitFiles(root.value, hash)
    } catch (err) {
      console.error('[git] commitFiles failed', err)
    }
  }

  /** 某文件的历史（Timeline 用） */
  async function loadFileHistory(filePath: string): Promise<GitCommit[]> {
    if (!root.value || !isRepo.value) return []
    try {
      return await api().log(root.value, { filePath, limit: 50 })
    } catch (err) {
      console.error('[git] loadFileHistory failed', err)
      return []
    }
  }

  /** 打开工作区文件的 diff（Changes 列表点击）→ 编辑区 Diff tab */
  function openDiff(filePath: string, opts: { staged: boolean }): void {
    if (!root.value) return
    const spec: DiffSpec = {
      root: root.value,
      filePath,
      kind: 'working',
      staged: opts.staged,
      editable: !opts.staged, // 场景1(未暂存, 右=工作区文件)天然可编辑；本期只读渲染
    }
    const name = filePath.split('/').pop() || filePath
    const suffix = opts.staged
      ? i18n.global.t('sourceControl.diffTab.staged')
      : i18n.global.t('sourceControl.diffTab.working')
    useAppStore().openDiffTab(spec, `${name} (${suffix})`)
  }

  /** 打开某提交中文件的 diff（Graph 展开点击）→ 编辑区 Diff tab */
  function openCommitDiff(hash: string, filePath: string, oldPath?: string): void {
    if (!root.value) return
    const spec: DiffSpec = { root: root.value, filePath, kind: 'commit', hash, oldPath }
    const name = filePath.split('/').pop() || filePath
    useAppStore().openDiffTab(spec, `${name} (${hash.slice(0, 7)})`)
  }

  /** 打开冲突文件的合并 tab（Merge Changes 点击）→ 2-pane 对照 + 可编辑结果 */
  function openMergeTab(filePath: string): void {
    if (!root.value) return
    const spec: DiffSpec = { root: root.value, filePath, kind: 'conflict', editable: true }
    const name = filePath.split('/').pop() || filePath
    useAppStore().openDiffTab(spec, `${name} (${i18n.global.t('sourceControl.diffTab.merge')})`)
  }

  // ---------- 写操作（每次成功后 refresh + 图谱同步） ----------
  async function afterWrite() {
    await refresh()
    if (commits.value.length) await loadGraph()
  }

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (!root.value) return false
    try {
      await action()
      await afterWrite()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error(msg)
      console.error('[git] action failed', err)
      return false
    }
  }

  const stage = (paths: string[]) => run(() => api().stage(root.value!, paths))
  const unstage = (paths: string[]) => run(() => api().unstage(root.value!, paths))
  const stageAll = () => run(() => api().stageAll(root.value!))
  const unstageAll = () => run(() => api().unstageAll(root.value!))
  const discard = (paths: string[]) => run(() => api().discard(root.value!, paths))
  /** 切换分支/提交；脏工作区阻挡时弹 VSCode 式选择（贮藏并切换 / 迁移改动 / 强制切换 / 取消） */
  async function checkout(ref_: string, opts?: { track?: boolean }): Promise<void> {
    if (!root.value) return
    try {
      await api().checkout(root.value, ref_, opts)
      await afterWrite()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/overwritten by (checkout|merge)|Please commit your changes or stash/i.test(msg)) {
        await promptDirtyCheckout(ref_, opts)
      } else {
        notify.error(msg)
        await afterWrite()
      }
    }
  }

  /** 脏工作区切分支的三选一（对标 VSCode） */
  async function promptDirtyCheckout(ref_: string, opts?: { track?: boolean }): Promise<void> {
    if (!root.value) return
    const res = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: i18n.global.t('sourceControl.checkout.dirtyTitle'),
      message: i18n.global.t('sourceControl.checkout.dirtyTitle'),
      detail: i18n.global.t('sourceControl.checkout.dirtyDetail', { ref: ref_ }),
      buttons: [
        i18n.global.t('sourceControl.checkout.stashAndCheckout'), // 0
        i18n.global.t('sourceControl.checkout.migrate'),          // 1
        i18n.global.t('sourceControl.checkout.force'),            // 2
        i18n.global.t('common.cancel'),                           // 3
      ],
      defaultId: 0,
      cancelId: 3,
    })
    const choice = res?.response
    if (choice === 0) {
      // 贮藏后切换：stash 保留（用户可稍后弹出），非自动 pop
      const ok = await run(async () => {
        await api().stashPush(root.value!, undefined, true)
        await api().checkout(root.value!, ref_, opts)
      })
      if (ok) { await loadStashes(); notify.info(i18n.global.t('sourceControl.checkout.stashed')) }
    } else if (choice === 1) {
      // 迁移改动：`checkout -m` 三方合并；冲突留标记进 Merge Changes，不作硬错误
      try {
        await api().checkout(root.value, ref_, { ...opts, merge: true })
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err)
        if (!/conflict/i.test(m)) notify.error(m)
      } finally {
        await afterWrite()
      }
    } else if (choice === 2) {
      // 强制切换：丢弃本地改动（破坏性；弹窗本身即确认）
      await run(() => api().checkout(root.value!, ref_, { ...opts, force: true }))
    }
    // choice === 3 / undefined：取消
  }
  const createBranch = (name: string, base?: string, doCheckout?: boolean) =>
    run(() => api().createBranch(root.value!, name, base, doCheckout))
  const deleteBranch = (name: string, force: boolean) => run(() => api().deleteBranch(root.value!, name, force))
  const addToGitignore = (relPath: string) => run(() => api().addToGitignore(root.value!, relPath))

  // ---------- 标签 Tags ----------
  const tags = ref<string[]>([])
  async function loadTags(): Promise<string[]> {
    if (!root.value || !isRepo.value) { tags.value = []; return [] }
    try {
      tags.value = await api().listTags(root.value)
    } catch {
      tags.value = []
    }
    return tags.value
  }
  /** 创建标签（hash 指定提交，缺省 HEAD；message 给出则为附注标签）；成功后 run 已刷新图谱→tag 色标显现 */
  async function createTag(name: string, opts: { message?: string; hash?: string } = {}): Promise<boolean> {
    const ok = await run(() => api().createTag(root.value!, name, opts))
    if (ok) await loadTags()
    return ok
  }
  async function deleteTag(name: string): Promise<boolean> {
    const ok = await run(() => api().deleteTag(root.value!, name))
    if (ok) await loadTags()
    return ok
  }
  /** 推送所有标签（远程操作，busy 态 + 失败弹 stderr） */
  const pushTags = () => remoteRun('pushTags', () => api().pushTags(root.value!))

  /** 撤销上次提交（soft，保留改动；调用方负责二次确认） */
  const undoLastCommit = () => run(() => api().undoLastCommit(root.value!))
  /** 重命名本地分支 */
  const renameBranch = (oldName: string, newName: string) => run(() => api().renameBranch(root.value!, oldName, newName))

  // ---------- 打开工作区文件 / 在文件管理器显示（Changes 右键） ----------
  /** 打开变更文件本体（工作区磁盘文件，非 diff） */
  function openWorkingFile(filePath: string): void {
    if (!root.value) return
    void useAppStore().openFile(pathUtils.join(root.value, filePath))
  }
  /** 在系统文件管理器中显示该文件 */
  function revealFile(filePath: string): void {
    if (!root.value) return
    void window.electronAPI.revealInFolder(pathUtils.join(root.value, filePath))
  }
  /** 将文件还原到某提交版本（覆盖工作区，破坏性；调用方负责二次确认） */
  const restoreFile = (hash: string, filePath: string) => run(() => api().restoreFile(root.value!, hash, filePath))

  /** 合并分支到当前分支：冲突不作硬错误（交给 Merge Changes 呈现），仅真错误才提示 */
  async function merge(branch: string): Promise<void> {
    if (!root.value) return
    try {
      await api().merge(root.value, branch)
      notify.success(i18n.global.t('sourceControl.branch.mergeDone', { branch }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/conflict|Automatic merge failed|fix conflicts/i.test(msg)) {
        notify.error(msg)
      }
    } finally {
      await afterWrite()
    }
  }

  /** 提交：校验信息 + 身份，缺身份则弹窗后重试 */
  async function commit(opts: { all?: boolean; amend?: boolean } = {}): Promise<void> {
    if (!root.value || !commitMessage.value.trim() || committing.value) return
    const identity = await api().identityGet(root.value)
    if (!identity.name || !identity.email) {
      pendingCommit = opts
      identityPromptOpen.value = true
      return
    }
    committing.value = true
    try {
      await api().commit(root.value, commitMessage.value, opts)
      commitMessage.value = ''
      await afterWrite()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    } finally {
      committing.value = false
    }
  }

  /** 保存身份后继续挂起的提交 */
  async function submitIdentity(name: string, email: string, global: boolean): Promise<void> {
    if (!root.value) return
    try {
      await api().identitySet(root.value, name, email, global)
      identityPromptOpen.value = false
      const opts = pendingCommit ?? {}
      pendingCommit = null
      await commit(opts)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err))
    }
  }

  function cancelIdentity() {
    identityPromptOpen.value = false
    pendingCommit = null
  }

  // ---------- 远程操作 ----------
  /** 长耗时操作进度（clone/pull/push/fetch）；null=无进行中 */
  const progress = ref<GitProgress | null>(null)
  window.electronAPI?.git?.onProgress?.((p) => { if (busy.value) progress.value = p })

  /** 取多行文本尾部 n 行非空行（远程错误 stderr 的可操作信息通常在末尾） */
  function tailLines(s: string, n: number): string {
    const lines = s.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0)
    return lines.length <= n ? lines.join('\n') : lines.slice(-n).join('\n')
  }

  async function remoteRun(name: string, action: () => Promise<void>): Promise<boolean> {
    if (!root.value || busy.value) return false
    busy.value = name
    progress.value = null
    try {
      await action()
      await afterWrite()
      return true
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err)
      const label = i18n.global.t(`sourceControl.remote.${name}`)
      // 远程失败（认证/网络/非快进）用原生弹窗给出 stderr 指引，不自建密码 UI。
      // 取尾部若干行：sync/pull 的 fetch 进度（含大量分支行）在前，真正的错误/Aborting 在末尾。
      await window.electronAPI.showMessageBox({
        type: 'error',
        title: label,
        message: label,
        detail: tailLines(stderr, 12),
        buttons: ['OK'],
      })
      // 失败后也刷新：pull/sync 的 --autostash pop 冲突需露出到 Merge Changes
      await afterWrite()
      return false
    } finally {
      busy.value = null
      progress.value = null
    }
  }

  const fetch = () => remoteRun('fetch', () => api().fetch(root.value!))
  const pull = (rebase = false) => remoteRun('pull', () => api().pull(root.value!, { rebase }))
  const push = () => remoteRun('push', () => api().push(root.value!, {}))
  const sync = (rebase = false) => remoteRun('sync', () => api().sync(root.value!, { rebase }))
  const publish = () => remoteRun('publish', () => api().publish(root.value!))

  // ---------- 远程管理（add/remove/list remote） ----------
  const remotes = ref<GitRemote[]>([])
  async function loadRemotes(): Promise<GitRemote[]> {
    if (!root.value || !isRepo.value) { remotes.value = []; return [] }
    try {
      remotes.value = await api().listRemotes(root.value)
    } catch {
      remotes.value = []
    }
    return remotes.value
  }
  async function addRemote(name: string, url: string): Promise<boolean> {
    const ok = await run(() => api().addRemote(root.value!, name, url))
    if (ok) await loadRemotes()
    return ok
  }
  async function removeRemote(name: string): Promise<boolean> {
    const ok = await run(() => api().removeRemote(root.value!, name))
    if (ok) await loadRemotes()
    return ok
  }

  // ---------- 贮藏 Stash（F10） ----------
  const stashes = ref<GitStashEntry[]>([])
  async function loadStashes(): Promise<GitStashEntry[]> {
    if (!root.value || !isRepo.value) { stashes.value = []; return [] }
    try {
      stashes.value = await api().stashList(root.value)
    } catch {
      stashes.value = []
    }
    return stashes.value
  }
  async function stashPush(message?: string, includeUntracked?: boolean): Promise<boolean> {
    const ok = await run(() => api().stashPush(root.value!, message, includeUntracked))
    if (ok) await loadStashes()
    return ok
  }
  async function stashApply(index: number): Promise<boolean> {
    const ok = await run(() => api().stashApply(root.value!, index))
    if (ok) await loadStashes()
    return ok
  }
  async function stashDrop(index: number): Promise<boolean> {
    const ok = await run(() => api().stashDrop(root.value!, index))
    if (ok) await loadStashes()
    return ok
  }
  /** 弹出贮藏：冲突不作硬错误（交给 Merge Changes 呈现），仅真错误提示 */
  async function stashPop(index: number): Promise<void> {
    if (!root.value) return
    try {
      await api().stashPop(root.value, index)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/conflict|CONFLICT/i.test(msg)) notify.error(msg)
    } finally {
      await afterWrite()
      await loadStashes()
    }
  }

  /** 克隆到目录（无 root 上下文）；成功返回目标目录 */
  async function clone(url: string, dir: string): Promise<string | null> {
    if (busy.value) return null
    busy.value = 'clone'
    progress.value = null
    try {
      await api().clone(url, dir)
      return dir
    } catch (err) {
      const label = i18n.global.t('sourceControl.clone.title')
      await window.electronAPI.showMessageBox({
        type: 'error', title: label, message: label,
        detail: err instanceof Error ? err.message : String(err), buttons: ['OK'],
      })
      return null
    } finally {
      busy.value = null
      progress.value = null
    }
  }

  function resetRepoState() {
    isRepo.value = false
    status.value = null
    branch.value = null
    commits.value = []
    expandedHash.value = null
    expandedFiles.value = []
    graphBranch.value = null
    graphAll.value = false
    graphHasMore.value = false
    tags.value = []
  }

  return {
    availability, root, isRepo, status, branch, commits, expandedHash, expandedFiles, graphBranch, graphAll, graphHasMore,
    loading, graphLoading, busy, progress, revision, cloneDialogOpen, changeCount, hasChanges,
    commitMessage, committing, identityPromptOpen,
    ensureDetected, onFolderChanged, refresh, loadGraph, loadMoreGraph, setGraphBranch, toggleCommit, loadFileHistory,
    openDiff, openCommitDiff, openMergeTab,
    stage, unstage, stageAll, unstageAll, discard, commit,
    checkout, createBranch, deleteBranch, addToGitignore, restoreFile, merge,
    tags, loadTags, createTag, deleteTag, pushTags, undoLastCommit, renameBranch, openWorkingFile, revealFile,
    submitIdentity, cancelIdentity,
    fetch, pull, push, sync, publish, clone,
    remotes, loadRemotes, addRemote, removeRemote,
    stashes, loadStashes, stashPush, stashApply, stashPop, stashDrop,
  }
})
