import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notify } from '@/utils/notifications'
import type {
  GitAvailability,
  GitBranchInfo,
  GitCommit,
  GitDiffPayload,
  GitFileChange,
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

  // 加载标志
  const loading = ref(false)
  const graphLoading = ref(false)
  /** 正在进行的远程操作：'sync'|'pull'|'push'|'fetch'|'publish'|null */
  const busy = ref<string | null>(null)
  /** 状态修订号：每次刷新/写操作后自增，供 Timeline 等外部视图感知变化 */
  const revision = ref(0)
  /** 克隆弹窗（NoFolderOpened / SCM 面板共用） */
  const cloneDialogOpen = ref(false)

  // Diff 浮层
  const diffOpen = ref(false)
  const diffLoading = ref(false)
  const diffPayload = ref<GitDiffPayload | null>(null)
  const diffTitle = ref('')

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

  /** 加载提交图谱 */
  async function loadGraph(): Promise<void> {
    if (!root.value || !isRepo.value) return
    graphLoading.value = true
    try {
      commits.value = await api().log(root.value, { limit: 50 })
    } catch (err) {
      console.error('[git] loadGraph failed', err)
      commits.value = []
    } finally {
      graphLoading.value = false
    }
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

  /** 打开工作区文件的 diff（Changes 列表点击） */
  async function openDiff(filePath: string, opts: { staged: boolean }): Promise<void> {
    if (!root.value) return
    diffOpen.value = true
    diffLoading.value = true
    diffPayload.value = null
    diffTitle.value = filePath + (opts.staged ? ' · Staged' : '')
    try {
      diffPayload.value = await api().diff(root.value, filePath, opts)
    } catch (err) {
      console.error('[git] openDiff failed', err)
    } finally {
      diffLoading.value = false
    }
  }

  /** 打开某提交中文件的 diff（Graph 展开点击） */
  async function openCommitDiff(hash: string, filePath: string): Promise<void> {
    if (!root.value) return
    diffOpen.value = true
    diffLoading.value = true
    diffPayload.value = null
    diffTitle.value = `${filePath} · ${hash.slice(0, 7)}`
    try {
      diffPayload.value = await api().commitFileDiff(root.value, hash, filePath)
    } catch (err) {
      console.error('[git] openCommitDiff failed', err)
    } finally {
      diffLoading.value = false
    }
  }

  function closeDiff() {
    diffOpen.value = false
    diffPayload.value = null
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
  async function remoteRun(name: string, action: () => Promise<void>): Promise<boolean> {
    if (!root.value || busy.value) return false
    busy.value = name
    try {
      await action()
      await afterWrite()
      return true
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err)
      // 远程失败（认证/网络/非快进）用原生弹窗给出 stderr 指引，不自建密码 UI
      await window.electronAPI.showMessageBox({
        type: 'error',
        title: name,
        message: name,
        detail: stderr,
        buttons: ['OK'],
      })
      return false
    } finally {
      busy.value = null
    }
  }

  const fetch = () => remoteRun('fetch', () => api().fetch(root.value!))
  const pull = (rebase = false) => remoteRun('pull', () => api().pull(root.value!, { rebase }))
  const push = () => remoteRun('push', () => api().push(root.value!, {}))
  const sync = (rebase = false) => remoteRun('sync', () => api().sync(root.value!, { rebase }))
  const publish = () => remoteRun('publish', () => api().publish(root.value!))

  /** 克隆到目录（无 root 上下文）；成功返回目标目录 */
  async function clone(url: string, dir: string): Promise<string | null> {
    if (busy.value) return null
    busy.value = 'clone'
    try {
      await api().clone(url, dir)
      return dir
    } catch (err) {
      await window.electronAPI.showMessageBox({
        type: 'error', title: 'clone', message: 'clone',
        detail: err instanceof Error ? err.message : String(err), buttons: ['OK'],
      })
      return null
    } finally {
      busy.value = null
    }
  }

  function resetRepoState() {
    isRepo.value = false
    status.value = null
    branch.value = null
    commits.value = []
    expandedHash.value = null
    expandedFiles.value = []
  }

  return {
    availability, root, isRepo, status, branch, commits, expandedHash, expandedFiles,
    loading, graphLoading, busy, revision, cloneDialogOpen, changeCount, hasChanges,
    diffOpen, diffLoading, diffPayload, diffTitle,
    commitMessage, committing, identityPromptOpen,
    ensureDetected, onFolderChanged, refresh, loadGraph, toggleCommit, loadFileHistory,
    openDiff, openCommitDiff, closeDiff,
    stage, unstage, stageAll, unstageAll, discard, commit,
    checkout, createBranch, deleteBranch, addToGitignore,
    submitIdentity, cancelIdentity,
    fetch, pull, push, sync, publish, clone,
  }
})
