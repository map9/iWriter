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
      <li v-for="(row, i) in rows" :key="row.kind === 'file' ? row.file!.path : `d${row.path ?? i}`">
        <!-- 目录行（仅 tree 模式，支持目录级 stage/unstage/discard） -->
        <div
          v-if="row.kind === 'dir'"
          class="group/row flex h-7 items-center hover:bg-base-200"
          @contextmenu.prevent="emit('context', { files: row.files ?? [], isDir: true, kind, ev: $event })"
        >
          <div class="flex min-w-0 flex-1 items-center gap-1 text-base-content/45" :style="{ paddingLeft: (row.depth * 12 + 12) + 'px' }">
            <IconFolder class="icon-2xs shrink-0" />
            <span class="truncate">{{ row.label }}</span>
          </div>
          <div class="flex h-7 shrink-0 items-center pr-2">
            <div class="hidden items-center gap-0.5 group-hover/row:flex">
              <button v-if="kind === 'changes'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.discard')" @click="emit('discard', row.files ?? [])">
                <IconArrowBackUp class="icon-2xs" />
              </button>
              <button v-if="kind === 'staged'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.unstage')" @click="emit('unstage', row.files ?? [])">
                <IconMinus class="icon-2xs" />
              </button>
              <button v-if="kind !== 'staged'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.stage')" @click="emit('stage', row.files ?? [])">
                <IconPlus class="icon-2xs" />
              </button>
            </div>
          </div>
        </div>
        <!-- 文件行 -->
        <div
          v-else
          class="group/row flex h-7 items-center hover:bg-base-200"
          @contextmenu.prevent="emit('context', { files: [row.file!], isDir: false, kind, ev: $event })"
        >
          <button
            class="flex min-w-0 flex-1 items-center gap-2 text-left"
            :style="{ paddingLeft: (row.depth * 12 + 24) + 'px' }"
            :title="row.file!.path"
            @click="emit('open', row.file!)"
          >
            <span class="truncate text-base-content">{{ row.file!.name }}</span>
            <span v-if="!treeView" class="truncate text-base-content/40">{{ row.file!.dir }}</span>
          </button>
          <!-- 文件操作（hover 显示，否则显示状态字母；固定高度避免抖动） -->
          <div class="flex h-7 shrink-0 items-center pr-2">
            <div class="hidden items-center gap-0.5 group-hover/row:flex">
              <button v-if="kind === 'untracked'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.gitignore')" @click="emit('gitignore', [row.file!])">
                <IconBan class="icon-2xs" />
              </button>
              <button v-if="kind === 'changes' || kind === 'untracked'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.discard')" @click="emit('discard', [row.file!])">
                <IconArrowBackUp class="icon-2xs" />
              </button>
              <button v-if="kind === 'staged'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.unstage')" @click="emit('unstage', [row.file!])">
                <IconMinus class="icon-2xs" />
              </button>
              <button v-if="kind !== 'staged'" class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('sourceControl.action.stage')" @click="emit('stage', [row.file!])">
                <IconPlus class="icon-2xs" />
              </button>
            </div>
            <span class="w-4 text-center font-bold group-hover/row:hidden" :class="statusColor(row.file!.status)">{{ row.file!.status }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronRight, IconChevronDown, IconPlus, IconMinus, IconArrowBackUp, IconBan, IconFolder } from '@tabler/icons-vue'
import type { GitFileChange, GitFileStatus } from '@/types/git'
import { buildScmTreeRows, type ScmTreeRow } from './fileTree'

export type ScmGroupKind = 'staged' | 'changes' | 'untracked' | 'conflicts'
/** 右键上下文菜单载荷：目标文件集合 + 是否目录 + 所属分组 + 鼠标事件 */
export interface ScmContextPayload { files: GitFileChange[]; isDir: boolean; kind: ScmGroupKind; ev: MouseEvent }

const props = defineProps<{ title: string; files: GitFileChange[]; kind: ScmGroupKind; treeView?: boolean }>()
const emit = defineEmits<{
  (e: 'open', file: GitFileChange): void
  (e: 'stage' | 'unstage' | 'discard' | 'gitignore', files: GitFileChange[]): void
  (e: 'stageAll' | 'unstageAll' | 'discardAll'): void
  (e: 'context', payload: ScmContextPayload): void
}>()
const { t } = useI18n()
const collapsed = ref(false)

// 统一行模型：list 模式 = 扁平文件行（depth 0）；tree 模式 = 目录+文件行
const rows = computed<ScmTreeRow[]>(() =>
  props.treeView
    ? buildScmTreeRows(props.files)
    : props.files.map(f => ({ depth: 0, kind: 'file' as const, label: f.name, file: f }))
)

function statusColor(s: GitFileStatus): string {
  switch (s) {
    case 'A': case 'U': return 'text-success'
    case 'D': case 'C': return 'text-error'
    default: return 'text-warning'
  }
}
</script>
