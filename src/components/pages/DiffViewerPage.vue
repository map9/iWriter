<template>
  <div class="flex h-full flex-col">
    <!-- 头部：文件路径 + 对比基准 + 刷新 -->
    <div class="flex shrink-0 items-center gap-2 border-b border-base-300 bg-base-100 px-3 py-1.5">
      <IconGitCompare class="icon-sm shrink-0 text-base-content/60" />
      <span class="min-w-0 truncate text-sm font-medium" :title="spec?.filePath">{{ fileName }}</span>
      <span class="shrink-0 rounded bg-base-200 px-1.5 py-px text-2xs text-base-content/60">{{ basisLabel }}</span>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <button
          v-if="canStage"
          class="iw-toolbar-btn btn-xs"
          :title="t('sourceControl.action.stage')"
          @click="onStage"
        >
          <IconPlus class="icon-xs" />
        </button>
        <button
          v-if="canUnstage"
          class="iw-toolbar-btn btn-xs"
          :title="t('sourceControl.action.unstage')"
          @click="onUnstage"
        >
          <IconMinus class="icon-xs" />
        </button>
        <button
          class="iw-toolbar-btn btn-xs"
          :title="t('diffView.refresh')"
          :disabled="loading"
          @click="load()"
        >
          <IconRefresh class="icon-xs" :class="loading ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <!-- 主体 -->
    <div class="min-h-0 flex-1">
      <div v-if="loading" class="flex h-full items-center justify-center">
        <span class="loading loading-spinner loading-md"></span>
      </div>
      <div v-else-if="error" class="flex h-full items-center justify-center px-4 text-center text-sm text-base-content/50">
        {{ error }}
      </div>
      <MergeView
        v-else-if="isConflict"
        :ours="mergeOurs"
        :theirs="mergeTheirs"
        :working="mergeWorking"
        @update:content="onMergeContent"
        @update:remaining="mergeRemaining = $event"
      />
      <div v-else-if="isImage" class="flex h-full items-center justify-center text-sm text-base-content/50">
        {{ t('sourceControl.imageFile') }}
      </div>
      <div v-else-if="isBinary" class="flex h-full items-center justify-center text-sm text-base-content/50">
        {{ t('sourceControl.binaryFile') }}
      </div>
      <div v-else-if="!hasDiff && !editingDiff" class="flex h-full items-center justify-center text-sm text-base-content/50">
        {{ t('sourceControl.noChanges') }}
      </div>
      <DiffView
        v-else
        :old-content="oldContent"
        :new-content="newContent"
        :editable="canEdit"
        @update:content="onDraftChange"
        @update:editing="editingDiff = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconGitCompare, IconRefresh, IconPlus, IconMinus } from '@tabler/icons-vue'
import DiffView from '@/components/common/diff/DiffView.vue'
import MergeView from '@/components/common/diff/MergeView.vue'
import { useGitStore } from '@/stores/git'
import { useAppStore } from '@/stores/app'
import { notify } from '@/utils/notifications'
import { IMAGE_EXTENSIONS } from '@/types'
import type { FileTab } from '@/types'

const props = defineProps<{ tab: FileTab }>()
const { t } = useI18n()
const gitStore = useGitStore()
const appStore = useAppStore()

const spec = computed(() => (props.tab.params?.kind === 'diff' ? props.tab.params.diff : null))

const loading = ref(false)
const error = ref('')
const oldContent = ref('')
const newContent = ref('')
const isBinary = ref(false)
const editingDiff = ref(false)
const savedContent = ref('') // 工作区文件当前已存内容，用于脏判断

// —— 合并冲突（kind='conflict'）——
const isConflict = computed(() => spec.value?.kind === 'conflict')
const mergeOurs = ref('')
const mergeTheirs = ref('')
const mergeWorking = ref('')
const mergeRemaining = ref(0)

function onMergeContent(v: string) {
  appStore.updateTabState(props.tab.id, { diffDraft: v, isDirty: v !== savedContent.value })
}

// 可编辑：仅未暂存工作区 diff 的文本源（排除 .iwt/.json/二进制），右侧显式保存写回工作区文件
const EDIT_BLOCK_EXT = new Set(['iwt', 'json'])
const canEdit = computed(() =>
  !!spec.value?.editable &&
  spec.value.kind === 'working' && !spec.value.staged &&
  !isBinary.value &&
  !EDIT_BLOCK_EXT.has(ext.value)
)

// 编辑 → 只更新草稿(实时 diff) + 镜像到 tab.diffDraft(供保存/关闭确认)，不自动写盘
function onDraftChange(v: string) {
  newContent.value = v
  appStore.updateTabState(props.tab.id, { diffDraft: v, isDirty: v !== savedContent.value })
}

// 保存（Cmd+S / 菜单「保存」/ 关闭确认）——无专用工具栏图标，复用标准保存路径
async function save() {
  if (!props.tab.isDirty) return
  if (isConflict.value) {
    // 仍有未解决冲突 → 不写盘，提示（替代原禁用按钮的反馈）
    if (mergeRemaining.value > 0) {
      notify.warning(t('mergeView.remaining', { count: mergeRemaining.value }))
      return
    }
    // 全部冲突已解决 → 写回去标记 + git add（saveDiffTab 内做）。
    // 不自动关闭 tab：保存只保存，不做导航跳转；脏点清除即表示已保存，文件离开 Merge Changes。
    const ok = await appStore.saveDiffTab(props.tab)
    if (ok) {
      savedContent.value = props.tab.diffDraft ?? ''
      notify.success(t('mergeView.saved'))
    }
    return
  }
  if (!canEdit.value) return
  const ok = await appStore.saveDiffTab(props.tab)
  if (ok) savedContent.value = props.tab.diffDraft ?? newContent.value
}

const ext = computed(() => {
  const p = spec.value?.filePath ?? ''
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i + 1).toLowerCase() : ''
})
const fileName = computed(() => {
  const p = spec.value?.filePath ?? ''
  return p.split('/').pop() || p
})
const isImage = computed(() => isBinary.value && (IMAGE_EXTENSIONS as readonly string[]).includes(ext.value))
const hasDiff = computed(() => oldContent.value !== newContent.value)

const basisLabel = computed(() => {
  const s = spec.value
  if (!s) return ''
  if (s.kind === 'commit') return t('diffView.basisCommit', { hash: (s.hash ?? '').slice(0, 7) })
  if (s.kind === 'conflict') return t('diffView.basisConflict')
  return s.staged ? t('diffView.basisStaged') : t('diffView.basisWorking')
})

// 文件级操作：仅工作区 diff（commit diff 为只读历史）
const isWorking = computed(() => spec.value?.kind === 'working')
const canStage = computed(() => isWorking.value && !spec.value?.staged)
const canUnstage = computed(() => isWorking.value && !!spec.value?.staged)

// 暂存/取消暂存后切换对比基准，避免当前 diff 变空白（改动只是换了分组）；
// 同时更新锁：staged → 只读带锁，unstaged → 可编辑无锁
function setStaged(staged: boolean) {
  const s = spec.value
  if (!s) return
  appStore.updateTabState(props.tab.id, {
    params: { kind: 'diff', diff: { ...s, staged } },
    fileReadonly: staged,
  })
}
async function onStage() {
  const s = spec.value
  if (!s) return
  setStaged(true)
  await gitStore.stage([s.filePath])
  load()
}
async function onUnstage() {
  const s = spec.value
  if (!s) return
  setStaged(false)
  await gitStore.unstage([s.filePath])
  load()
}

/** .iwt/.json 先格式化再 diff，避免整行差异 */
function maybeFormat(content: string): string {
  if (ext.value === 'iwt' || ext.value === 'json') {
    try {
      return JSON.stringify(JSON.parse(content), null, 2)
    } catch {
      return content
    }
  }
  return content
}

async function load() {
  const s = spec.value
  if (!s) return
  loading.value = true
  error.value = ''
  try {
    const api = window.electronAPI.git
    // 冲突：取三方版本 + 工作区内容（含标记）→ MergeView
    if (s.kind === 'conflict') {
      const cv = await api.conflictVersions(s.root, s.filePath)
      isBinary.value = false
      mergeOurs.value = cv.ours
      mergeTheirs.value = cv.theirs
      mergeWorking.value = cv.working
      savedContent.value = cv.working
      appStore.updateTabState(props.tab.id, { diffDraft: cv.working, isDirty: false })
      return
    }
    const payload = s.kind === 'commit' && s.hash
      ? await api.commitFileDiff(s.root, s.hash, s.filePath)
      : await api.diff(s.root, s.filePath, { staged: !!s.staged })
    isBinary.value = payload.isBinary
    oldContent.value = payload.isBinary ? '' : maybeFormat(payload.oldContent)
    newContent.value = payload.isBinary ? '' : maybeFormat(payload.newContent)
    // 重置编辑基线（load 在编辑中被守护跳过，不会覆盖草稿）
    savedContent.value = newContent.value
    appStore.updateTabState(props.tab.id, { diffDraft: newContent.value, isDirty: false })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// 工作区 diff 随 git 状态刷新自动重取（stage/discard/commit 后）；commit diff 内容不变。
// 编辑中不重取，避免用自身写盘触发的刷新 clobber 草稿。
watch(() => gitStore.revision, () => {
  if (spec.value?.kind === 'working' && !editingDiff.value) load()
})

// 复用 tab（identityOf 命中）时 spec 变化则重取
watch(spec, () => load())

async function handleMenuAction(action: string): Promise<boolean> {
  // 消费 diff tab 的 save，避免落到 app store 的 markdown 保存路径
  if (action === 'save' || action === 'save-as') {
    await save()
    return true
  }
  return false
}

defineExpose({
  tab: toRef(props, 'tab'),
  handleMenuAction,
})
</script>
