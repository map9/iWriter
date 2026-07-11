<template>
  <div class="h-full flex flex-col">
    <!-- 容器标题栏 -->
    <div class="iw-sidebar-section">
      <span class="iw-sidebar-section-header">{{ t('sourceControl.title') }}</span>
      <div class="flex shrink-0 items-center gap-1">
        <button
          v-if="gitStore.isRepo && gitStore.branch?.upstream"
          class="iw-toolbar-btn btn-xs"
          :title="t('sourceControl.remote.sync')"
          :disabled="!!gitStore.busy"
          @click="gitStore.sync()"
        >
          <IconRefresh class="icon-xs" :class="{ 'animate-spin': gitStore.busy === 'sync' }" />
        </button>
        <button
          v-if="gitStore.isRepo"
          class="iw-toolbar-btn btn-xs"
          :title="t('explorer.collapseAll')"
          @click="gitStore.refresh()"
        >
          <IconReload class="icon-xs" :class="{ 'animate-spin': gitStore.loading }" />
        </button>
        <button
          class="iw-toolbar-btn btn-xs"
          :title="t('sourceControl.moreActions')"
          @click="showScmViewMenu"
        >
          <IconDots class="icon-xs" />
        </button>
      </div>
    </div>

    <!-- 状态 A：未检测到 Git -->
    <div v-if="!gitStore.availability.available" class="flex flex-1 flex-col justify-top gap-2 p-2">
      <p class="text-left text-sm text-base-content/50">{{ t('sourceControl.gitNotFoundDesc') }}</p>
      <button class="iw-btn btn-primary w-full h-9" @click="recheck">
        <IconRefresh class="icon-sm" />
        <span>{{ t('sourceControl.recheck') }}</span>
      </button>
    </div>

    <!-- 状态 B：非仓库 -->
    <div v-else-if="!gitStore.isRepo" class="flex flex-1 flex-col justify-top gap-2 p-2">
      <p class="text-left text-sm text-base-content/50">{{ t('sourceControl.notRepo') }}</p>
      <button class="iw-btn btn-primary w-full h-9" @click="initRepo">
        <IconGitBranch class="icon-sm" />
        <span>{{ t('sourceControl.initRepo') }}</span>
      </button>
      <button class="iw-btn btn-ghost w-full h-9" @click="gitStore.cloneDialogOpen = true">
        <IconGitBranch class="icon-sm" />
        <span>{{ t('sourceControl.cloneRepo') }}</span>
      </button>
    </div>

    <!-- 状态 C：仓库 → 三 viewer -->
    <SplitView v-else :panes="viewerPanes" :close-title="t('common.close')" class="min-h-0 flex-1">
      <!-- Repositories -->
      <template #repositories>
        <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-base-200" @click="showBranchMenu">
          <IconGitBranch class="icon-xs text-base-content/60 shrink-0" />
          <span class="font-medium truncate">{{ folderName }}</span>
          <span class="text-base-content/60 truncate">{{ gitStore.branch?.current }}</span>
          <span class="ml-auto shrink-0 tabular-nums text-base-content/50">
            ↑{{ gitStore.branch?.ahead ?? 0 }} ↓{{ gitStore.branch?.behind ?? 0 }}
          </span>
        </button>
      </template>

      <!-- Changes -->
      <template #changes-actions>
        <button class="iw-toolbar-btn btn-xs" :title="t('sourceControl.action.stageAll')" @click.stop="gitStore.stageAll()">
          <IconPlus class="icon-2xs" />
        </button>
        <span v-if="gitStore.changeCount" class="badge badge-xs badge-primary">{{ gitStore.changeCount }}</span>
      </template>
      <template #changes>
        <div class="flex flex-col gap-2 border-b border-base-300 p-2">
          <textarea
            v-model="gitStore.commitMessage"
            rows="1"
            class="w-full min-h-7 resize-none overflow-hidden rounded-field border border-base-300 bg-base-100 px-2 py-1.5 text-xs outline-none focus:border-primary"
            :placeholder="t('sourceControl.commitPlaceholder')"
            @keydown="onCommitKey"
            @input="autoGrow"
          />
          <div class="flex">
            <button
              class="btn btn-primary btn-xs flex-1 rounded-r-none gap-1"
              :disabled="!canCommit"
              @click="doPrimaryCommit"
            >
              <span v-if="gitStore.committing" class="loading loading-spinner loading-xs"></span>
              <IconCheck v-else class="icon-2xs" /> {{ t('sourceControl.commit') }}
            </button>
            <button class="btn btn-primary btn-xs rounded-l-none border-l border-primary-content/20 px-1" :title="t('sourceControl.commit')" @click="showCommitMenu">
              <IconChevronDown class="icon-2xs" />
            </button>
          </div>
        </div>

        <div v-if="!gitStore.hasChanges" class="empty-panel px-4 py-6 text-xs">
          {{ t('sourceControl.noChanges') }}
        </div>
        <div v-else class="py-1 text-xs">
          <GitChangeGroup v-if="gitStore.status?.conflicts.length" kind="conflicts" :title="mergeLabel" :files="gitStore.status.conflicts"
            @open="onFileOpen" @stage="onStage" />
          <GitChangeGroup v-if="gitStore.status?.staged.length" kind="staged" :title="stagedLabel" :files="gitStore.status.staged"
            @open="onFileOpen" @unstage="onUnstage" @unstage-all="gitStore.unstageAll()" />
          <GitChangeGroup v-if="gitStore.status?.changes.length" kind="changes" :title="changesLabel" :files="gitStore.status.changes"
            @open="onFileOpen" @stage="onStage" @discard="onDiscard" @stage-all="gitStore.stageAll()" @discard-all="onDiscardAll" />
          <GitChangeGroup v-if="gitStore.status?.untracked.length" kind="untracked" :title="untrackedLabel" :files="gitStore.status.untracked"
            @open="onFileOpen" @stage="onStage" @gitignore="onGitignore" @stage-all="onStageAllUntracked" />
        </div>
      </template>

      <!-- Graph -->
      <template #graph>
        <div v-if="gitStore.graphLoading" class="empty-panel px-4 py-6 text-xs">
          <span class="loading loading-spinner loading-sm"></span>
        </div>
        <div v-else-if="!gitStore.commits.length" class="empty-panel px-4 py-6 text-xs">
          {{ t('sourceControl.noCommits') }}
        </div>
        <ul v-else class="py-1 text-xs">
          <li v-for="c in gitStore.commits" :key="c.hash">
            <button
              class="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-base-200"
              @click="gitStore.toggleCommit(c.hash)"
            >
              <IconGitCommit class="icon-xs mt-0.5 shrink-0 text-primary" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base-content">{{ c.subject }}</span>
                <span class="block truncate text-base-content/50">
                  {{ c.author }} · {{ relTime(c.timestamp) }} · {{ c.shortHash }}
                </span>
              </span>
            </button>
            <ul v-if="gitStore.expandedHash === c.hash" class="pb-1">
              <li v-for="f in gitStore.expandedFiles" :key="f.path">
                <button
                  class="flex w-full items-center gap-2 py-0.5 pr-3 pl-9 text-left text-base-content/80 hover:bg-base-200"
                  :title="f.path"
                  @click="gitStore.openCommitDiff(c.hash, f.path)"
                >
                  <span class="truncate">{{ f.name }}</span>
                  <span class="truncate text-base-content/40">{{ f.dir }}</span>
                  <span class="ml-auto font-bold" :class="statusColor(f.status)">{{ f.status }}</span>
                </button>
              </li>
            </ul>
          </li>
        </ul>
      </template>
    </SplitView>

    <!-- 新建分支输入弹窗 -->
    <div
      v-if="branchDialogOpen"
      class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
      @click.self="branchDialogOpen = false"
    >
      <form
        class="w-80 max-w-[90vw] overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
        @submit.prevent="confirmCreateBranch"
      >
        <div class="border-b border-base-300 px-4 py-3 text-sm font-semibold">{{ t('sourceControl.branch.create') }}</div>
        <div class="px-4 py-4">
          <input
            ref="branchInput"
            v-model="branchName"
            type="text"
            class="iw-input w-full"
            :placeholder="t('sourceControl.branch.createTitle')"
          />
        </div>
        <div class="flex justify-end gap-2 border-t border-base-300 px-4 py-3">
          <button type="button" class="iw-btn btn-ghost btn-sm" @click="branchDialogOpen = false">{{ t('common.cancel') }}</button>
          <button type="submit" class="iw-btn btn-primary btn-sm" :disabled="!branchName.trim()">{{ t('common.create') }}</button>
        </div>
      </form>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconDots, IconGitBranch, IconGitCommit, IconRefresh, IconReload, IconPlus, IconCheck, IconChevronDown } from '@tabler/icons-vue'
import { SplitView, type SplitPane } from '../common/split-view'
import GitChangeGroup from './scm/GitChangeGroup.vue'
import { useGitStore } from '@/stores/git'
import { useAppStore } from '@/stores/app'
import type { ContextMenuItem, GitFileChange, GitFileStatus } from '@/types'
import pathUtils from '@/utils/pathUtils'

const { t } = useI18n()
const gitStore = useGitStore()
const appStore = useAppStore()

const folderName = computed(() =>
  appStore.currentFolder ? pathUtils.basename(appStore.currentFolder) : ''
)

const stagedLabel = computed(() => t('sourceControl.staged'))
const changesLabel = computed(() => t('sourceControl.changes'))
const untrackedLabel = computed(() => t('sourceControl.untracked'))
const mergeLabel = computed(() => t('sourceControl.mergeChanges'))

const viewerPanes = ref<SplitPane[]>([
  { id: 'repositories', title: t('sourceControl.view.repositories'), closable: false, collapsed: true, size: 1 },
  { id: 'changes', title: t('sourceControl.view.changes'), closable: false, size: 3 },
  { id: 'graph', title: t('sourceControl.view.graph'), closable: true, collapsed: true, size: 2 },
])

function onFileOpen(file: GitFileChange) {
  gitStore.openDiff(file.path, { staged: file.staged })
}

// ---- 提交 ----
const canCommit = computed(() => !!gitStore.commitMessage.trim() && !gitStore.committing && gitStore.isRepo)

function autoGrow(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
function onCommitKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doPrimaryCommit() }
}
function doPrimaryCommit() {
  if (!canCommit.value) return
  // 无暂存内容 → Commit All（Q5）
  const hasStaged = (gitStore.status?.staged.length ?? 0) > 0
  gitStore.commit({ all: !hasStaged })
}
async function showCommitMenu(event: MouseEvent) {
  const items: ContextMenuItem[] = [
    { id: 'commit', label: t('sourceControl.commit') },
    { id: 'commit-all', label: t('sourceControl.commitAll') },
    { type: 'separator' },
    { id: 'commit-amend', label: t('sourceControl.amend') },
  ]
  const action = await window.electronAPI.showContextMenu(items, { x: event.clientX, y: event.clientY })
  if (action === 'commit') gitStore.commit({})
  else if (action === 'commit-all') gitStore.commit({ all: true })
  else if (action === 'commit-amend') gitStore.commit({ amend: true })
}

// ---- 暂存 / 放弃 ----
function onStage(f: GitFileChange) { gitStore.stage([f.path]) }
function onUnstage(f: GitFileChange) { gitStore.unstage([f.path]) }
function onStageAllUntracked() {
  const files = gitStore.status?.untracked.map(f => f.path) ?? []
  if (files.length) gitStore.stage(files)
}
async function onDiscard(f: GitFileChange) {
  const ok = await confirmBox(
    t('sourceControl.discardConfirm.title'),
    t('sourceControl.discardConfirm.message', { name: f.name }),
    t('sourceControl.discardConfirm.confirm'),
  )
  if (ok) gitStore.discard([f.path])
}
async function onDiscardAll() {
  const files = gitStore.status?.changes.map(f => f.path) ?? []
  if (!files.length) return
  const ok = await confirmBox(
    t('sourceControl.discardConfirm.allTitle'),
    t('sourceControl.discardConfirm.allMessage', { count: files.length }),
    t('sourceControl.discardConfirm.confirm'),
  )
  if (ok) gitStore.discard(files)
}
function onGitignore(f: GitFileChange) { gitStore.addToGitignore(f.path) }

async function confirmBox(title: string, message: string, confirmLabel: string): Promise<boolean> {
  const res = await window.electronAPI.showMessageBox({
    type: 'warning',
    title,
    message: title,
    detail: message,
    buttons: [t('common.cancel'), confirmLabel],
    defaultId: 0,
  })
  return res?.response === 1
}

// ---- 分支 ----
async function showBranchMenu(event: MouseEvent) {
  const b = gitStore.branch
  if (!b) return
  const items: ContextMenuItem[] = [
    { id: '__create', label: t('sourceControl.branch.create') },
    { type: 'separator' },
    ...b.local.map((name): ContextMenuItem => ({
      id: `co:${name}`, label: name, type: 'checkbox', checked: name === b.current,
    })),
    ...b.remote.filter(r => !r.endsWith('/HEAD')).map((name): ContextMenuItem => ({
      id: `co:${name}`, label: `${name}  (${t('sourceControl.branch.remote')})`,
    })),
  ]
  const action = await window.electronAPI.showContextMenu(items, { x: event.clientX, y: event.clientY })
  if (!action) return
  if (action === '__create') {
    openCreateBranch()
  } else if (action.startsWith('co:')) {
    const ref = action.slice(3)
    if (ref !== b.current) gitStore.checkout(ref.replace(/^origin\//, ''))
  }
}

// 新建分支弹窗
const branchDialogOpen = ref(false)
const branchName = ref('')
const branchInput = ref<HTMLInputElement | null>(null)
function openCreateBranch() {
  branchName.value = ''
  branchDialogOpen.value = true
  nextTick(() => branchInput.value?.focus())
}
function confirmCreateBranch() {
  const name = branchName.value.trim()
  if (!name) return
  branchDialogOpen.value = false
  gitStore.createBranch(name, undefined, true)
}


function statusColor(s: GitFileStatus): string {
  switch (s) {
    case 'A': case 'U': return 'text-success'
    case 'D': return 'text-error'
    case 'C': return 'text-error'
    default: return 'text-warning'
  }
}

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return t('sourceControl.time.now')
  if (m < 60) return t('sourceControl.time.minutes', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('sourceControl.time.hours', { n: h })
  const d = Math.floor(h / 24)
  return t('sourceControl.time.days', { n: d })
}

async function recheck() {
  gitStore.availability = await window.electronAPI.git.detect()
  await gitStore.onFolderChanged(appStore.currentFolder)
}

async function initRepo() {
  if (!appStore.currentFolder) return
  await window.electronAPI.git.init(appStore.currentFolder)
  await gitStore.onFolderChanged(appStore.currentFolder)
}

const showScmViewMenu = async (event: MouseEvent) => {
  const repos = viewerPanes.value.find(p => p.id === 'repositories')
  const graph = viewerPanes.value.find(p => p.id === 'graph')
  const hasUpstream = !!gitStore.branch?.upstream
  const remoteItems: ContextMenuItem[] = gitStore.isRepo
    ? [
        ...(hasUpstream
          ? [
              { id: 'remote-sync', label: t('sourceControl.remote.sync') },
              { id: 'remote-pull', label: t('sourceControl.remote.pull') },
              { id: 'remote-push', label: t('sourceControl.remote.push') },
            ]
          : [{ id: 'remote-publish', label: t('sourceControl.remote.publish') }]),
        { id: 'remote-fetch', label: t('sourceControl.remote.fetch') },
        { type: 'separator' },
      ]
    : []
  const repo = gitStore.isRepo
  const menuItems: ContextMenuItem[] = [
    ...remoteItems,
    { id: 'scm-view-repositories', label: t('sourceControl.view.repositories'), type: 'checkbox', enabled: repo, checked: repo && repos?.visible !== false },
    { id: 'scm-view-changes', label: t('sourceControl.view.changes'), type: 'checkbox', enabled: false, checked: repo },
    { id: 'scm-view-graph', label: t('sourceControl.view.graph'), type: 'checkbox', enabled: repo, checked: repo && graph?.visible !== false },
  ]
  try {
    const action = await window.electronAPI.showContextMenu(menuItems, { x: event.clientX, y: event.clientY })
    if (action === 'scm-view-repositories' && repos) repos.visible = repos.visible === false
    else if (action === 'scm-view-graph' && graph) graph.visible = graph.visible === false
    else if (action === 'remote-sync') gitStore.sync()
    else if (action === 'remote-pull') gitStore.pull()
    else if (action === 'remote-push') gitStore.push()
    else if (action === 'remote-fetch') gitStore.fetch()
    else if (action === 'remote-publish') gitStore.publish()
  } catch (error) {
    console.error('Error showing SCM view menu:', error)
  }
}

// 图谱展开时懒加载（onFolderChanged 由 MainView 统一驱动）
watch(() => viewerPanes.value.find(p => p.id === 'graph')?.collapsed, (collapsed) => {
  if (collapsed === false && gitStore.isRepo && !gitStore.commits.length) gitStore.loadGraph()
})
</script>
