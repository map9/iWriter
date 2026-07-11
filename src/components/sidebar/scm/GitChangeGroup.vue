<template>
  <div class="group/grp">
    <div class="flex h-7 w-full items-center gap-1 px-2 hover:bg-base-200">
      <button class="flex min-w-0 flex-1 items-center gap-1 text-left" @click="collapsed = !collapsed">
        <component :is="collapsed ? IconChevronRight : IconChevronDown" class="icon-2xs shrink-0 text-base-content/40" />
        <span class="flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-base-content/60">{{ title }}</span>
      </button>
      <!-- 分组操作（hover 显示，固定高度避免抖动） -->
      <div class="hidden h-5 shrink-0 items-center gap-0.5 group-hover/grp:flex">
        <button v-if="kind === 'changes'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.discardAll')" @click="emit('discardAll')">
          <IconArrowBackUp class="icon-2xs" />
        </button>
        <button v-if="kind === 'staged'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.unstageAll')" @click="emit('unstageAll')">
          <IconMinus class="icon-2xs" />
        </button>
        <button v-if="kind === 'changes' || kind === 'untracked'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.stageAll')" @click="emit('stageAll')">
          <IconPlus class="icon-2xs" />
        </button>
      </div>
      <span class="badge badge-xs shrink-0">{{ files.length }}</span>
    </div>

    <ul v-show="!collapsed">
      <li v-for="f in files" :key="f.path" class="group/row flex h-6 items-center hover:bg-base-200">
        <button class="flex min-w-0 flex-1 items-center gap-2 pl-6 text-left" :title="f.path" @click="emit('open', f)">
          <span class="truncate text-base-content">{{ f.name }}</span>
          <span class="truncate text-base-content/40">{{ f.dir }}</span>
        </button>
        <!-- 文件操作（hover 显示，否则显示状态字母；固定高度避免抖动） -->
        <div class="flex h-6 shrink-0 items-center pr-2">
          <div class="hidden items-center gap-0.5 group-hover/row:flex">
            <button v-if="kind === 'untracked'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.gitignore')" @click="emit('gitignore', f)">
              <IconBan class="icon-2xs" />
            </button>
            <button v-if="kind === 'changes'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.discard')" @click="emit('discard', f)">
              <IconArrowBackUp class="icon-2xs" />
            </button>
            <button v-if="kind === 'staged'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.unstage')" @click="emit('unstage', f)">
              <IconMinus class="icon-2xs" />
            </button>
            <button v-if="kind !== 'staged'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.stage')" @click="emit('stage', f)">
              <IconPlus class="icon-2xs" />
            </button>
          </div>
          <span class="w-4 text-center font-bold group-hover/row:hidden" :class="statusColor(f.status)">{{ f.status }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronRight, IconChevronDown, IconPlus, IconMinus, IconArrowBackUp, IconBan } from '@tabler/icons-vue'
import type { GitFileChange, GitFileStatus } from '@/types/git'

defineProps<{ title: string; files: GitFileChange[]; kind: 'staged' | 'changes' | 'untracked' | 'conflicts' }>()
const emit = defineEmits<{
  (e: 'open' | 'stage' | 'unstage' | 'discard' | 'gitignore', file: GitFileChange): void
  (e: 'stageAll' | 'unstageAll' | 'discardAll'): void
}>()
const { t } = useI18n()
const collapsed = ref(false)

function statusColor(s: GitFileStatus): string {
  switch (s) {
    case 'A': case 'U': return 'text-success'
    case 'D': case 'C': return 'text-error'
    default: return 'text-warning'
  }
}
</script>
