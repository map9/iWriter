<template>
  <div class="flex h-full flex-col text-xs">
    <!-- 工具栏 -->
    <div class="flex items-center gap-1 border-b border-base-300 bg-base-200 px-2 py-1">
      <div class="join">
        <button
          class="btn btn-xs join-item"
          :class="mode === 'split' ? 'btn-active' : ''"
          :title="t('diffView.split')"
          @click="mode = 'split'"
        >
          <IconLayoutColumns class="icon-xs" />
        </button>
        <button
          class="btn btn-xs join-item"
          :class="mode === 'inline' ? 'btn-active' : ''"
          :title="t('diffView.inline')"
          @click="mode = 'inline'"
        >
          <IconLayoutRows class="icon-xs" />
        </button>
      </div>

      <button
        class="iw-toolbar-btn btn-xs"
        :class="showLineNumbers ? 'text-primary' : ''"
        :title="t('diffView.lineNumbers')"
        @click="showLineNumbers = !showLineNumbers"
      >
        <IconListNumbers class="icon-xs" />
      </button>

      <div class="mx-1 h-4 w-px bg-base-300"></div>

      <button
        class="iw-toolbar-btn btn-xs"
        :disabled="!hunkCount"
        :title="t('diffView.prevChange')"
        @click="gotoHunk(-1)"
      >
        <IconChevronUp class="icon-xs" />
      </button>
      <button
        class="iw-toolbar-btn btn-xs"
        :disabled="!hunkCount"
        :title="t('diffView.nextChange')"
        @click="gotoHunk(1)"
      >
        <IconChevronDown class="icon-xs" />
      </button>
      <span class="select-none text-2xs tabular-nums text-base-content/60">
        {{ hunkCount ? `${currentHunk + 1}/${hunkCount}` : '0' }}
      </span>
      <button
        class="iw-toolbar-btn btn-xs"
        :class="showIndex ? 'text-primary' : ''"
        :disabled="!hunkCount"
        :title="t('diffView.index')"
        @click="showIndex = !showIndex"
      >
        <IconListSearch class="icon-xs" />
      </button>

      <div class="ml-auto flex items-center gap-2 text-2xs font-mono tabular-nums">
        <span class="text-success">+{{ stats.added }}</span>
        <span class="text-error">−{{ stats.removed }}</span>
      </div>
    </div>

    <!-- 主体 -->
    <div class="flex min-h-0 flex-1">
      <div ref="scrollEl" class="min-w-0 flex-1 overflow-auto font-mono leading-[1.5]">
        <!-- 并排 -->
        <template v-if="mode === 'split'">
          <div
            v-for="(p, i) in pairs"
            :key="i"
            :data-block-start="p.blockStart ? '' : null"
            class="grid grid-cols-2"
          >
            <div class="flex border-r border-base-300" :class="sideBg(p.left)">
              <span
                v-if="showLineNumbers"
                class="w-10 shrink-0 select-none border-r border-base-300/50 px-1 text-right tabular-nums text-base-content/40"
              >{{ p.left?.oldNo ?? '' }}</span>
              <span class="min-h-[1.5em] whitespace-pre-wrap break-words px-2"><template v-for="(s, si) in (p.left?.segs ?? [])" :key="si"><span :class="s.hl ? 'rounded-sm bg-error/40' : ''">{{ s.value }}</span></template></span>
            </div>
            <div class="flex" :class="sideBg(p.right)">
              <span
                v-if="showLineNumbers"
                class="w-10 shrink-0 select-none border-r border-base-300/50 px-1 text-right tabular-nums text-base-content/40"
              >{{ p.right?.newNo ?? '' }}</span>
              <span class="min-h-[1.5em] whitespace-pre-wrap break-words px-2"><template v-for="(s, si) in (p.right?.segs ?? [])" :key="si"><span :class="s.hl ? 'rounded-sm bg-success/40' : ''">{{ s.value }}</span></template></span>
            </div>
          </div>
        </template>

        <!-- 内联 -->
        <template v-else>
          <div
            v-for="(l, i) in inlineRows"
            :key="i"
            :data-block-start="l.blockStart ? '' : null"
            class="flex"
            :class="lineBg(l.type)"
          >
            <span
              v-if="showLineNumbers"
              class="w-9 shrink-0 select-none px-1 text-right tabular-nums text-base-content/40"
            >{{ l.oldNo ?? '' }}</span>
            <span
              v-if="showLineNumbers"
              class="w-9 shrink-0 select-none border-r border-base-300/50 px-1 text-right tabular-nums text-base-content/40"
            >{{ l.newNo ?? '' }}</span>
            <span class="w-4 shrink-0 select-none text-center text-base-content/40">{{ sign(l.type) }}</span>
            <span class="min-h-[1.5em] whitespace-pre-wrap break-words px-1"><template v-for="(s, si) in l.segs" :key="si"><span :class="hlClass(l.type, s.hl)">{{ s.value }}</span></template></span>
          </div>
        </template>
      </div>

      <!-- 差异索引面板（可选） -->
      <div
        v-if="showIndex && hunkCount"
        class="w-40 shrink-0 overflow-auto border-l border-base-300 bg-base-200/50 text-2xs"
      >
        <button
          v-for="(h, i) in blocks"
          :key="i"
          class="flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-base-200"
          :class="i === currentHunk ? 'bg-base-200 text-primary' : 'text-base-content/70'"
          @click="scrollToHunk(i)"
        >
          <IconChevronRight class="icon-2xs shrink-0" />
          <span class="tabular-nums">{{ t('diffView.hunkAt', { line: h.line }) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffLines, diffWords } from 'diff'
import {
  IconLayoutColumns,
  IconLayoutRows,
  IconListNumbers,
  IconListSearch,
  IconChevronUp,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-vue'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  oldContent: string
  newContent: string
  /** 初始视图模式 */
  initialMode?: 'split' | 'inline'
}>(), {
  initialMode: 'split',
})

const mode = ref<'split' | 'inline'>(props.initialMode)
const showLineNumbers = ref(true)
const showIndex = ref(false)
const currentHunk = ref(0)
const scrollEl = ref<HTMLElement | null>(null)

type LineType = 'context' | 'added' | 'removed'
interface Seg { value: string; hl: boolean }
interface DLine { oldNo: number | null; newNo: number | null; type: LineType; segs: Seg[] }
interface Pair { left: DLine | null; right: DLine | null; blockStart: boolean }
interface InlineRow extends DLine { blockStart: boolean }

function splitLines(v: string): string[] {
  if (v === '') return []
  const noTrail = v.endsWith('\n') ? v.slice(0, -1) : v
  return noTrail.split('\n')
}

const computed_ = computed(() => {
  const parts = diffLines(props.oldContent ?? '', props.newContent ?? '')
  const pairs: Pair[] = []
  const inlineRows: InlineRow[] = []
  const blocks: { line: number }[] = []
  let oldNo = 1
  let newNo = 1
  let added = 0
  let removed = 0
  let removedBuf: DLine[] = []
  let addedBuf: DLine[] = []

  const flush = () => {
    if (!removedBuf.length && !addedBuf.length) return
    // 记录一个变更块锚点（首个变更行的显示行号）
    const anchorLine = addedBuf[0]?.newNo ?? removedBuf[0]?.oldNo ?? 0
    blocks.push({ line: anchorLine })

    const n = Math.max(removedBuf.length, addedBuf.length)
    for (let i = 0; i < n; i++) {
      const l = removedBuf[i] ?? null
      const r = addedBuf[i] ?? null
      // 成对的行做行内 word 级高亮
      if (l && r) {
        const w = diffWords(l.segs[0]?.value ?? '', r.segs[0]?.value ?? '')
        l.segs = w.filter(p => !p.added).map(p => ({ value: p.value, hl: !!p.removed }))
        r.segs = w.filter(p => !p.removed).map(p => ({ value: p.value, hl: !!p.added }))
      }
      pairs.push({ left: l, right: r, blockStart: i === 0 })
    }
    removedBuf.forEach((l, i) => inlineRows.push({ ...l, blockStart: i === 0 }))
    addedBuf.forEach((r, i) => inlineRows.push({ ...r, blockStart: removedBuf.length === 0 && i === 0 }))
    removedBuf = []
    addedBuf = []
  }

  for (const part of parts) {
    const lines = splitLines(part.value)
    if (part.added) {
      added += lines.length
      for (const text of lines) addedBuf.push({ oldNo: null, newNo: newNo++, type: 'added', segs: [{ value: text, hl: false }] })
    } else if (part.removed) {
      removed += lines.length
      for (const text of lines) removedBuf.push({ oldNo: oldNo++, newNo: null, type: 'removed', segs: [{ value: text, hl: false }] })
    } else {
      flush()
      for (const text of lines) {
        const dl: DLine = { oldNo: oldNo++, newNo: newNo++, type: 'context', segs: [{ value: text, hl: false }] }
        pairs.push({ left: dl, right: dl, blockStart: false })
        inlineRows.push({ ...dl, blockStart: false })
      }
    }
  }
  flush()

  return { pairs, inlineRows, blocks, stats: { added, removed } }
})

const pairs = computed(() => computed_.value.pairs)
const inlineRows = computed(() => computed_.value.inlineRows)
const blocks = computed(() => computed_.value.blocks)
const stats = computed(() => computed_.value.stats)
const hunkCount = computed(() => blocks.value.length)

function sideBg(line: DLine | null): string {
  if (!line) return 'bg-base-200/40'
  if (line.type === 'removed') return 'bg-error/15'
  if (line.type === 'added') return 'bg-success/15'
  return ''
}
function lineBg(type: LineType): string {
  if (type === 'removed') return 'bg-error/15'
  if (type === 'added') return 'bg-success/15'
  return ''
}
function hlClass(type: LineType, hl: boolean): string {
  if (!hl) return ''
  return type === 'removed' ? 'rounded-sm bg-error/40' : 'rounded-sm bg-success/40'
}
function sign(type: LineType): string {
  return type === 'added' ? '+' : type === 'removed' ? '−' : ''
}

function scrollToHunk(i: number) {
  const anchors = scrollEl.value?.querySelectorAll<HTMLElement>('[data-block-start]')
  if (!anchors || !anchors.length) return
  const idx = ((i % anchors.length) + anchors.length) % anchors.length
  currentHunk.value = idx
  anchors[idx]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
function gotoHunk(dir: number) {
  if (!hunkCount.value) return
  scrollToHunk(currentHunk.value + dir)
}

// 内容或模式变化后重置定位
watch([() => props.oldContent, () => props.newContent], () => { currentHunk.value = 0 })
watch(mode, () => { nextTick(() => scrollEl.value?.scrollTo({ top: 0 }) ) })
</script>
