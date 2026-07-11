<template>
  <div class="flex h-full flex-col">
    <!-- 头部：文件路径 + 对比基准 + 刷新 -->
    <div class="flex shrink-0 items-center gap-2 border-b border-base-300 bg-base-100 px-3 py-1.5">
      <IconGitCompare class="icon-sm shrink-0 text-base-content/60" />
      <span class="min-w-0 truncate text-sm font-medium" :title="spec?.filePath">{{ fileName }}</span>
      <span class="shrink-0 rounded bg-base-200 px-1.5 py-px text-2xs text-base-content/60">{{ basisLabel }}</span>
      <button
        class="iw-toolbar-btn btn-xs ml-auto shrink-0"
        :title="t('diffView.refresh')"
        :disabled="loading"
        @click="load()"
      >
        <IconRefresh class="icon-xs" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- 主体 -->
    <div class="min-h-0 flex-1">
      <div v-if="loading" class="flex h-full items-center justify-center">
        <span class="loading loading-spinner loading-md"></span>
      </div>
      <div v-else-if="error" class="flex h-full items-center justify-center px-4 text-center text-sm text-base-content/50">
        {{ error }}
      </div>
      <div v-else-if="isImage" class="flex h-full items-center justify-center text-sm text-base-content/50">
        {{ t('sourceControl.imageFile') }}
      </div>
      <div v-else-if="isBinary" class="flex h-full items-center justify-center text-sm text-base-content/50">
        {{ t('sourceControl.binaryFile') }}
      </div>
      <div v-else-if="!hasDiff" class="flex h-full items-center justify-center text-sm text-base-content/50">
        {{ t('sourceControl.noChanges') }}
      </div>
      <DiffView
        v-else
        :old-content="oldContent"
        :new-content="newContent"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconGitCompare, IconRefresh } from '@tabler/icons-vue'
import DiffView from '@/components/common/diff/DiffView.vue'
import { useGitStore } from '@/stores/git'
import { IMAGE_EXTENSIONS } from '@/types'
import type { FileTab } from '@/types'

const props = defineProps<{ tab: FileTab }>()
const { t } = useI18n()
const gitStore = useGitStore()

const spec = computed(() => (props.tab.params?.kind === 'diff' ? props.tab.params.diff : null))

const loading = ref(false)
const error = ref('')
const oldContent = ref('')
const newContent = ref('')
const isBinary = ref(false)

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
  return s.staged ? t('diffView.basisStaged') : t('diffView.basisWorking')
})

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
    const payload = s.kind === 'commit' && s.hash
      ? await api.commitFileDiff(s.root, s.hash, s.filePath)
      : await api.diff(s.root, s.filePath, { staged: !!s.staged })
    isBinary.value = payload.isBinary
    oldContent.value = payload.isBinary ? '' : maybeFormat(payload.oldContent)
    newContent.value = payload.isBinary ? '' : maybeFormat(payload.newContent)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// 工作区 diff 随 git 状态刷新自动重取（stage/discard/commit 后）；commit diff 内容不变。
watch(() => gitStore.revision, () => {
  if (spec.value?.kind === 'working') load()
})

// 复用 tab（identityOf 命中）时 spec 变化则重取
watch(spec, () => load())

function handleMenuAction(): boolean {
  return false
}

defineExpose({
  tab: toRef(props, 'tab'),
  handleMenuAction,
})
</script>
