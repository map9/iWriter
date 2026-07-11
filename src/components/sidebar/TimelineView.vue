<template>
  <div class="flex h-full min-h-0 flex-col text-xs">
    <!-- 无活动文件 / 无仓库（顶部对齐提示，避免高度塌陷不显示） -->
    <p v-if="!activePath" class="p-3 text-left text-base-content/50">{{ t('explorer.timeline.noFile') }}</p>
    <p v-else-if="!gitStore.isRepo" class="p-3 text-left text-base-content/50">{{ t('explorer.timeline.noRepo') }}</p>
    <div v-else-if="loading" class="p-3"><span class="loading loading-spinner loading-sm"></span></div>
    <p v-else-if="!commits.length" class="p-3 text-left text-base-content/50">{{ t('explorer.timeline.empty') }}</p>
    <ul v-else class="py-1">
      <li
        v-for="c in commits"
        :key="c.hash"
        class="flex items-start gap-2 px-3 py-1.5 hover:bg-base-200"
        :title="c.subject"
      >
        <IconGitCommit class="icon-xs mt-0.5 shrink-0 text-primary" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-base-content">{{ c.subject }}</span>
          <span class="block truncate text-base-content/50">{{ c.author }} · {{ relTime(c.timestamp) }} · {{ c.shortHash }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconGitCommit } from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import { useGitStore } from '@/stores/git'
import type { GitCommit } from '@/types/git'
import pathUtils from '@/utils/pathUtils'

const { t } = useI18n()
const appStore = useAppStore()
const gitStore = useGitStore()

const commits = ref<GitCommit[]>([])
const loading = ref(false)

const activePath = computed(() => appStore.activeTab?.path ?? null)

/** 相对仓库根的路径 */
function relativePath(abs: string): string {
  const root = gitStore.root
  if (!root) return abs
  const nRoot = pathUtils.normalize(root).replace(/[\\/]+$/, '')
  const nPath = pathUtils.normalize(abs)
  const prefix = nRoot + '/'
  return nPath.startsWith(prefix) ? nPath.slice(prefix.length) : nPath
}

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return t('sourceControl.time.now')
  if (m < 60) return t('sourceControl.time.minutes', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('sourceControl.time.hours', { n: h })
  return t('sourceControl.time.days', { n: Math.floor(h / 24) })
}

async function reload() {
  const p = activePath.value
  if (!p || !gitStore.isRepo) { commits.value = []; return }
  loading.value = true
  try {
    commits.value = await gitStore.loadFileHistory(relativePath(p))
  } finally {
    loading.value = false
  }
}

// revision 变化 = 有提交/刷新（如新 commit）→ 重新加载文件历史
watch([activePath, () => gitStore.isRepo, () => gitStore.root, () => gitStore.revision], reload, { immediate: true })
</script>
