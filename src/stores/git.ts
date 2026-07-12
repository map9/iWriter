import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notify } from '@/utils/notifications'
import { i18n } from '@/i18n'
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
  async function onFolderChanged(newRoot: string | null): Promise<void> {
    root.value = newRoot
    resetRepoState()
    if (!newRoot) return
    await ensureDetected()
    if (!availability.value.available) return
    isRepo.value = await api().isRepo(newRoot)
    if (isRepo.value) await refresh()
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  /** 刷新 status + branches（去抖） */
  function refresh(): Promise<void> {
    return new Promise((resolve) => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(async () => {
        if (!root.value || !isRepo.value) return resolve()
        loading.value = true
        try {
          const [s, b] = await Promise.all([
            api().status(root.value),
            api().branches(root.value),
          ])
          status.value = s
          branch.value = b
          revision.value++
        } catch (err) {
          console.error('[git] refresh failed', err)
        } finally {
          loading.value = false
          resolve()
        }
      }, 150)
    })
  }

  /** 加载提交图谱（graphBranch 指定分支，null=当前 HEAD） */
  async function loadGraph(): Promise<void> {
    if (!root.value || !isRepo.value) return
    graphLoading.value = true
    try {
      commits.value = await api().log(root.value, graphAll.value
        ? { limit: 50, allBranches: true }
        : { limit: 50, ref: graphBranch.value ?? undefined })
    } catch (err) {
      console.error('[git] loadGraph failed', err)
      commits.value = []
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
  function openCommitDiff(hash: string, filePath: string): void {
    if (!root.value) return
    const spec: DiffSpec = { root: root.value, filePath, kind: 'commit', hash }
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
  const checkout = (ref_: string) => run(() => api().checkout(root.value!, ref_))
  const createBranch = (name: string, base?: string, doCheckout?: boolean) =>
    run(() => api().createBranch(root.value!, name, base, doCheckout))
  const deleteBranch = (name: string, force: boolean) => run(() => api().deleteBranch(root.value!, name, force))
  const addToGitignore = (relPath: string) => run(() => api().addToGitignore(root.value!, relPath))
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
  async function stashPush(message?: string): Promise<boolean> {
    const ok = await run(() => api().stashPush(root.value!, message))
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
  }

  return {
    availability, root, isRepo, status, branch, commits, expandedHash, expandedFiles, graphBranch, graphAll,
    loading, graphLoading, busy, progress, revision, cloneDialogOpen, changeCount, hasChanges,
    commitMessage, committing, identityPromptOpen,
    ensureDetected, onFolderChanged, refresh, loadGraph, setGraphBranch, toggleCommit, loadFileHistory,
    openDiff, openCommitDiff, openMergeTab,
    stage, unstage, stageAll, unstageAll, discard, commit,
    checkout, createBranch, deleteBranch, addToGitignore, restoreFile, merge,
    submitIdentity, cancelIdentity,
    fetch, pull, push, sync, publish, clone,
    remotes, loadRemotes, addRemote, removeRemote,
    stashes, loadStashes, stashPush, stashApply, stashPop, stashDrop,
  }
})
