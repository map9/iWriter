<template>
  <div class="flex h-full min-h-0 flex-col text-xs">
    <!-- 空态：对齐 ui/history.html .vempty（大图标 + 两行文案；「初始化仓库」纯文本不加 link） -->
    <div v-if="!activePath" class="px-4 pt-7 text-center text-xs text-base-content/40">
      <IconHistory class="mx-auto mb-2 size-7 opacity-50" />{{ t('explorer.timeline.noFile') }}
    </div>
    <div v-else-if="!gitStore.isRepo" class="px-4 pt-7 text-center text-xs text-base-content/40">
      <IconHistory class="mx-auto mb-2 size-7 opacity-50" />{{ t('explorer.timeline.noRepo') }}<br>{{ t('explorer.timeline.noRepoHint') }}
    </div>
    <div v-else-if="loading" class="p-3 text-left text-xs text-base-content/50"><span class="loading loading-spinner loading-sm"></span></div>
    <div v-else-if="!commits.length" class="px-4 pt-7 text-center text-xs text-base-content/40">
      <IconHistory class="mx-auto mb-2 size-7 opacity-50" />{{ t('explorer.timeline.empty') }}<br>{{ t('explorer.timeline.emptyHint') }}
    </div>
    <ul v-else class="py-1">
      <li
        v-for="c in commits"
        :key="c.hash"
        class="group flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-base-200"
        :title="c.subject"
        @click="openCommitDiff(c)"
      >
        <IconGitCommit class="icon-xs mt-0.5 shrink-0 text-primary" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-base-content">{{ c.subject }}</span>
          <span class="block truncate text-base-content/50">{{ c.author }} · {{ relTime(c.timestamp) }} · {{ c.shortHash }}</span>
        </span>
        <button
          class="btn btn-ghost btn-square btn-xs mt-0.5 hidden h-5 min-h-0 w-5 shrink-0 group-hover:flex"
          :title="t('explorer.timeline.restore')"
          @click.stop="onRestore(c)"
        >
          <IconArrowBackUp class="icon-2xs" />
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconGitCommit, IconArrowBackUp, IconHistory } from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import { useGitStore } from '@/stores/git'
import type { GitCommit } from '@/types/git'
import pathUtils from '@/utils/pathUtils'

const { t } = useI18n()
const appStore = useAppStore()
const gitStore = useGitStore()

const commits = ref<GitCommit[]>([])
const loading = ref(false)

// Timeline 跟随「工作区树的选中文件」（关闭 tab 后 highlight 仍在 → 历史仍显示），
// 无树选中时回落到当前活动 tab；不再直接绑定"是否打开"。
const activePath = computed(() => {
  const sel = appStore.selectedItem
  if (sel?.type === 'file') return sel.path
  return appStore.activeTab?.path ?? null
})

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

/** 点击某提交 → 打开该提交中此文件的 diff（本提交 ↔ 父提交） */
function openCommitDiff(c: GitCommit) {
  const p = activePath.value
  if (!p) return
  gitStore.openCommitDiff(c.hash, relativePath(p))
}

/** 还原此文件到某提交版本（破坏性，二次确认） */
async function onRestore(c: GitCommit) {
  const p = activePath.value
  if (!p) return
  const rel = relativePath(p)
  const name = rel.split('/').pop() || rel
  const res = await window.electronAPI.showMessageBox({
    type: 'warning',
    title: t('explorer.timeline.restoreTitle'),
    message: t('explorer.timeline.restoreTitle'),
    detail: t('explorer.timeline.restoreMessage', { name, hash: c.shortHash }),
    buttons: [t('common.cancel'), t('explorer.timeline.restoreConfirm')],
    defaultId: 0,
  })
  if (res?.response === 1) gitStore.restoreFile(c.hash, rel)
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
