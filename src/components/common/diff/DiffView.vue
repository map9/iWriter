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
        v-if="editable"
        class="iw-toolbar-btn btn-xs"
        :class="editing ? 'text-primary' : ''"
        :title="t('diffView.edit')"
        @click="toggleEditing"
      >
        <IconPencil class="icon-xs" />
      </button>

      <div class="ml-auto flex items-center gap-2 text-2xs font-mono tabular-nums">
        <span class="text-success">+{{ stats.added }}</span>
        <span class="text-error">−{{ stats.removed }}</span>
      </div>
    </div>

    <!-- 编辑模式：左侧旧内容(随输入实时高亮删除词) + 右侧可编辑 textarea；diff 在编辑时保持可见 -->
    <div v-if="editing" class="grid min-h-0 flex-1 grid-cols-2 overflow-hidden text-xs font-mono leading-normal">
      <div class="overflow-auto whitespace-pre-wrap wrap-break-word border-r border-base-300 px-2 py-1"><template v-for="(s, si) in editLeftSegments" :key="si"><span :class="s.hl ? 'rounded-sm bg-error/40' : ''">{{ s.value }}</span></template></div>
      <textarea
        v-model="draftLocal"
        spellcheck="false"
        class="resize-none overflow-auto px-2 py-1 outline-none"
      ></textarea>
    </div>

    <!-- 主体：滚动内容 + 右侧 overview ruler -->
    <div v-else class="flex min-h-0 flex-1">
      <div
        ref="scrollEl"
        class="relative min-w-0 flex-1 overflow-auto scrollbar-hide font-mono leading-normal"
        @scroll="updateMetrics"
      >
        <!-- 并排 -->
        <template v-if="mode === 'split'">
          <div
            v-for="(p, i) in pairs"
            :key="i"
            :data-block-start="p.blockStart ? '' : null"
            class="group relative grid grid-cols-2"
          >
            <div class="flex border-r border-base-300" :class="sideBg(p.left)">
              <span
                v-if="showLineNumbers"
                class="w-10 shrink-0 select-none border-r border-base-300/50 px-1 text-right tabular-nums text-base-content/40"
              >{{ p.left?.oldNo ?? '' }}</span>
              <span class="min-h-[1.5em] whitespace-pre-wrap wrap-break-word px-2"><template v-for="(s, si) in (p.left?.segs ?? [])" :key="si"><span :class="s.hl ? 'rounded-sm bg-error/40' : ''">{{ s.value }}</span></template></span>
            </div>
            <div class="flex" :class="sideBg(p.right)">
              <span
                v-if="showLineNumbers"
                class="w-10 shrink-0 select-none border-r border-base-300/50 px-1 text-right tabular-nums text-base-content/40"
              >{{ p.right?.newNo ?? '' }}</span>
              <span class="min-h-[1.5em] whitespace-pre-wrap wrap-break-word px-2"><template v-for="(s, si) in (p.right?.segs ?? [])" :key="si"><span :class="s.hl ? 'rounded-sm bg-success/40' : ''">{{ s.value }}</span></template></span>
            </div>
            <div
              v-if="hunkMode && hunkAnchors.splitMap.has(i)"
              class="absolute right-1.5 top-0.5 z-10 hidden items-center gap-0.5 rounded border border-base-300 bg-base-100 px-0.5 shadow-sm group-hover:flex"
            >
              <template v-if="hunkMode === 'unstaged'">
                <button class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('diffView.stageHunk')" @click="onHunk(hunkAnchors.splitMap.get(i)!, 'stage')"><IconPlus class="icon-2xs" /></button>
                <button class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('diffView.discardHunk')" @click="onHunk(hunkAnchors.splitMap.get(i)!, 'discard')"><IconArrowBackUp class="icon-2xs" /></button>
              </template>
              <button v-else class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('diffView.unstageHunk')" @click="onHunk(hunkAnchors.splitMap.get(i)!, 'unstage')"><IconMinus class="icon-2xs" /></button>
            </div>
          </div>
        </template>

        <!-- 内联 -->
        <template v-else>
          <div
            v-for="(l, i) in inlineRows"
            :key="i"
            :data-block-start="l.blockStart ? '' : null"
            class="group relative flex"
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
            <span class="min-h-[1.5em] whitespace-pre-wrap wrap-break-word px-1"><template v-for="(s, si) in l.segs" :key="si"><span :class="hlClass(l.type, s.hl)">{{ s.value }}</span></template></span>
            <div
              v-if="hunkMode && hunkAnchors.inlineMap.has(i)"
              class="absolute right-1.5 top-0.5 z-10 hidden items-center gap-0.5 rounded border border-base-300 bg-base-100 px-0.5 shadow-sm group-hover:flex"
            >
              <template v-if="hunkMode === 'unstaged'">
                <button class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('diffView.stageHunk')" @click="onHunk(hunkAnchors.inlineMap.get(i)!, 'stage')"><IconPlus class="icon-2xs" /></button>
                <button class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('diffView.discardHunk')" @click="onHunk(hunkAnchors.inlineMap.get(i)!, 'discard')"><IconArrowBackUp class="icon-2xs" /></button>
              </template>
              <button v-else class="iw-toolbar-btn btn-xs h-5 min-h-0 w-5" :title="t('diffView.unstageHunk')" @click="onHunk(hunkAnchors.inlineMap.get(i)!, 'unstage')"><IconMinus class="icon-2xs" /></button>
            </div>
          </div>
        </template>
      </div>

      <!-- Overview ruler：整篇缩略 + 变更红/绿标记 + 视口指示块（对标 VSCode） -->
      <div
        v-if="hunkCount"
        ref="rulerEl"
        class="relative w-3.5 shrink-0 cursor-pointer bg-base-100"
        @mousedown="onRulerDown"
      >
        <div
          v-for="(m, i) in marks"
          :key="i"
          class="pointer-events-none absolute inset-x-0 flex"
          :style="{ top: m.top + '%', height: m.height + '%' }"
        >
          <div class="w-1/2" :class="m.removed ? 'bg-error' : ''"></div>
          <div class="w-1/2" :class="m.added ? 'bg-success' : ''"></div>
        </div>
        <div
          class="pointer-events-none absolute inset-x-0 bg-base-content/20"
          :style="{ top: thumb.top + '%', height: thumb.height + '%' }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffLines, diffWords } from 'diff'
import type { DiffHunk } from './hunk-patch'
import {
  IconLayoutColumns,
  IconLayoutRows,
  IconListNumbers,
  IconChevronUp,
  IconChevronDown,
  IconPencil,
  IconPlus,
  IconMinus,
  IconArrowBackUp,
} from '@tabler/icons-vue'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  oldContent: string
  newContent: string
  /** 初始视图模式 */
  initialMode?: 'split' | 'inline'
  /** 初始是否显示行号 */
  initialShowLineNumbers?: boolean
  /** 右侧是否可编辑（工作区文本源，场景1/冲突） */
  editable?: boolean
  /** git hunks（DiffViewerPage 用 computeHunks 传入）；用于渲染逐块 stage/discard 锚点 */
  hunks?: DiffHunk[]
  /** 逐块操作模式：unstaged=暂存/放弃、staged=取消暂存、null=不显示 */
  hunkMode?: 'unstaged' | 'staged' | null
}>(), {
  initialMode: 'split',
  initialShowLineNumbers: true,
  editable: false,
  hunks: () => [],
  hunkMode: null,
})

const emit = defineEmits<{
  'update:content': [value: string]
  'update:editing': [value: boolean]
  'hunk-action': [payload: { index: number; action: 'stage' | 'discard' | 'unstage' }]
}>()

function onHunk(index: number, action: 'stage' | 'discard' | 'unstage') {
  emit('hunk-action', { index, action })
}

const mode = ref<'split' | 'inline'>(props.initialMode)
const showLineNumbers = ref(props.initialShowLineNumbers)
const currentHunk = ref(0)
const scrollEl = ref<HTMLElement | null>(null)
const rulerEl = ref<HTMLElement | null>(null)

// —— 编辑模式（右侧 textarea）——
const editing = ref(false)
const draftLocal = ref(props.newContent)
function toggleEditing() {
  editing.value = !editing.value
  if (editing.value) draftLocal.value = props.newContent
  else flushDraft()
  emit('update:editing', editing.value)
}
// 非编辑时才把外部内容同步进草稿；编辑中草稿为权威，忽略外部变化避免打断输入
watch(() => props.newContent, (v) => {
  if (!editing.value && v !== draftLocal.value) draftLocal.value = v
})
let emitTimer: ReturnType<typeof setTimeout> | null = null
function flushDraft() {
  if (emitTimer) { clearTimeout(emitTimer); emitTimer = null }
  emit('update:content', draftLocal.value)
}
watch(draftLocal, (v) => {
  if (!editing.value) return
  if (emitTimer) clearTimeout(emitTimer)
  emitTimer = setTimeout(() => emit('update:content', v), 500)
})

type LineType = 'context' | 'added' | 'removed'
interface Seg { value: string; hl: boolean }
interface DLine { oldNo: number | null; newNo: number | null; type: LineType; segs: Seg[] }
interface Pair { left: DLine | null; right: DLine | null; blockStart: boolean }
interface InlineRow extends DLine { blockStart: boolean }
interface Block { splitStart: number; splitLen: number; inlineStart: number; inlineLen: number; removed: boolean; added: boolean }

function splitLines(v: string): string[] {
  if (v === '') return []
  const noTrail = v.endsWith('\n') ? v.slice(0, -1) : v
  return noTrail.split('\n')
}

const computed_ = computed(() => {
  const parts = diffLines(props.oldContent ?? '', props.newContent ?? '')
  const pairs: Pair[] = []
  const inlineRows: InlineRow[] = []
  const blocks: Block[] = []
  let oldNo = 1
  let newNo = 1
  let added = 0
  let removed = 0
  let removedBuf: DLine[] = []
  let addedBuf: DLine[] = []

  const flush = () => {
    if (!removedBuf.length && !addedBuf.length) return
    const splitStart = pairs.length
    const inlineStart = inlineRows.length
    const removedFlag = removedBuf.length > 0
    const addedFlag = addedBuf.length > 0

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

    blocks.push({
      splitStart,
      splitLen: pairs.length - splitStart,
      inlineStart,
      inlineLen: inlineRows.length - inlineStart,
      removed: removedFlag,
      added: addedFlag,
    })
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

// 编辑模式左侧：旧内容按 word 级高亮删除，随 draft 实时更新（保持 diff 可见）
const editLeftSegments = computed(() =>
  diffWords(props.oldContent ?? '', draftLocal.value)
    .filter(p => !p.added)
    .map(p => ({ value: p.value, hl: !!p.removed }))
)

const pairs = computed(() => computed_.value.pairs)
const inlineRows = computed(() => computed_.value.inlineRows)
const blocks = computed(() => computed_.value.blocks)
const stats = computed(() => computed_.value.stats)
const hunkCount = computed(() => blocks.value.length)

// git hunk → 渲染行索引的锚点：在该 hunk 首个变更行所在的 split/inline 行渲染逐块操作按钮。
// （git hunk 因 context 合并，可能覆盖多个视觉 block；按 hunk 出一个按钮，避免重复。）
const hunkAnchors = computed(() => {
  const splitMap = new Map<number, number>()
  const inlineMap = new Map<number, number>()
  if (!props.hunkMode || !props.hunks.length) return { splitMap, inlineMap }
  const newToSplit = new Map<number, number>(); const oldToSplit = new Map<number, number>()
  pairs.value.forEach((p, i) => {
    if (p.right?.newNo != null && !newToSplit.has(p.right.newNo)) newToSplit.set(p.right.newNo, i)
    if (p.left?.oldNo != null && !oldToSplit.has(p.left.oldNo)) oldToSplit.set(p.left.oldNo, i)
  })
  const newToInline = new Map<number, number>(); const oldToInline = new Map<number, number>()
  inlineRows.value.forEach((r, i) => {
    if (r.newNo != null && !newToInline.has(r.newNo)) newToInline.set(r.newNo, i)
    if (r.oldNo != null && !oldToInline.has(r.oldNo)) oldToInline.set(r.oldNo, i)
  })
  for (const h of props.hunks) {
    let curOld = h.oldStart; let curNew = h.newStart
    for (const ln of h.lines) {
      const c = ln[0]
      if (c === '+') {
        const si = newToSplit.get(curNew); const ii = newToInline.get(curNew)
        if (si != null && !splitMap.has(si)) splitMap.set(si, h.index)
        if (ii != null && !inlineMap.has(ii)) inlineMap.set(ii, h.index)
        break
      }
      if (c === '-') {
        const si = oldToSplit.get(curOld); const ii = oldToInline.get(curOld)
        if (si != null && !splitMap.has(si)) splitMap.set(si, h.index)
        if (ii != null && !inlineMap.has(ii)) inlineMap.set(ii, h.index)
        break
      }
      curOld++; curNew++ // context 行推进两侧
    }
  }
  return { splitMap, inlineMap }
})

// —— overview ruler —— 按实际 DOM 像素偏移定位（非行序），内容不满时标记落在有内容处
interface Mark { top: number; height: number; removed: boolean; added: boolean }
const marks = ref<Mark[]>([])
function measureMarks() {
  const el = scrollEl.value
  if (!el) { marks.value = []; return }
  const total = el.scrollHeight
  if (total <= 0) { marks.value = []; return }
  const rows = el.children // 行元素（split=pair div，inline=row div），顺序与 pairs/inlineRows 一致
  marks.value = blocks.value.map(b => {
    const start = mode.value === 'split' ? b.splitStart : b.inlineStart
    const len = mode.value === 'split' ? b.splitLen : b.inlineLen
    const first = rows[start] as HTMLElement | undefined
    const after = rows[start + len] as HTMLElement | undefined
    const topPx = first ? first.offsetTop : 0
    const bottomPx = after ? after.offsetTop : total
    return {
      top: (topPx / total) * 100,
      height: Math.max(((bottomPx - topPx) / total) * 100, 0.6),
      removed: b.removed,
      added: b.added,
    }
  })
}

const scrollTop = ref(0)
const scrollHeight = ref(0)
const clientHeight = ref(0)
function updateMetrics() {
  const el = scrollEl.value
  if (!el) return
  scrollTop.value = el.scrollTop
  scrollHeight.value = el.scrollHeight
  clientHeight.value = el.clientHeight
}
const thumb = computed(() => {
  if (scrollHeight.value <= 0) return { top: 0, height: 100 }
  return {
    top: (scrollTop.value / scrollHeight.value) * 100,
    height: Math.min((clientHeight.value / scrollHeight.value) * 100, 100),
  }
})

function scrollToFraction(frac: number) {
  const el = scrollEl.value
  if (!el) return
  el.scrollTop = Math.max(0, frac * el.scrollHeight - el.clientHeight / 2)
}
function onRulerPointer(e: MouseEvent) {
  const r = rulerEl.value?.getBoundingClientRect()
  if (!r || r.height === 0) return
  scrollToFraction((e.clientY - r.top) / r.height)
}
function onRulerDown(e: MouseEvent) {
  e.preventDefault()
  onRulerPointer(e)
  const move = (ev: MouseEvent) => onRulerPointer(ev)
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// —— 变更导航 ——
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

/** 布局变化后同步度量与标记（滚动时只需 updateMetrics） */
function refreshRuler() {
  updateMetrics()
  measureMarks()
}

let ro: ResizeObserver | null = null
// scrollEl 会随编辑模式进出被 v-if 销毁/重建：跟随 ref 变化重挂 ResizeObserver 并刷新度量。
// 否则退出编辑后 overview ruler 因仍观察旧的已卸载元素而不再更新（标记/视口块丢失）。
watch(scrollEl, (el) => {
  ro?.disconnect()
  ro = null
  if (el && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => refreshRuler())
    ro.observe(el)
    nextTick(refreshRuler)
  }
})
onMounted(() => {
  nextTick(refreshRuler)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  // 关闭前 flush 未提交的编辑，避免丢最后一次输入
  if (editing.value && emitTimer) flushDraft()
})

// 内容/模式变化后重置定位并刷新度量与标记
watch([() => props.oldContent, () => props.newContent], () => {
  currentHunk.value = 0
  nextTick(refreshRuler)
})
watch(mode, () => nextTick(() => {
  scrollEl.value?.scrollTo({ top: 0 })
  refreshRuler()
}))
watch(showLineNumbers, () => nextTick(refreshRuler))
</script>
