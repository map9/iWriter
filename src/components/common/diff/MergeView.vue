<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- 上：ours ↔ theirs 只读对照（复用 DiffView） -->
    <div class="flex min-h-0 flex-[0_0_45%] flex-col border-b-2 border-base-300">
      <div class="flex shrink-0 items-center gap-2 bg-base-200/60 px-3 py-1 text-2xs text-base-content/60">
        <span class="text-success">{{ t('mergeView.ours') }}</span>
        <span>↔</span>
        <span class="text-info">{{ t('mergeView.theirs') }}</span>
      </div>
      <div class="min-h-0 flex-1">
        <DiffView :old-content="ours" :new-content="theirs" />
      </div>
    </div>

    <!-- 下：可编辑合并结果 -->
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center gap-2 bg-base-200/60 px-3 py-1 text-2xs">
        <span class="font-medium text-base-content/70">{{ t('mergeView.result') }}</span>
        <span
          class="ml-auto rounded px-1.5 py-px font-mono"
          :class="remaining ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'"
        >
          {{ remaining ? t('mergeView.remaining', { count: remaining }) : t('mergeView.resolved') }}
        </span>
      </div>

      <div class="min-h-0 flex-1 overflow-auto px-2 py-1 text-xs font-mono leading-[1.5]">
        <template v-for="(seg, i) in segments" :key="i">
          <!-- 上下文（只读） -->
          <pre
            v-if="seg.type === 'context'"
            class="whitespace-pre-wrap break-words text-base-content/70"
          >{{ seg.text }}</pre>

          <!-- 冲突块 -->
          <div v-else class="my-1 rounded border border-warning/40 bg-warning/5">
            <!-- 已选：可编辑结果 -->
            <template v-if="seg.choice">
              <div class="flex items-center gap-2 border-b border-warning/30 px-2 py-0.5 text-2xs">
                <span class="text-base-content/50">{{ t('mergeView.conflict') }} #{{ conflictIndex(i) }}</span>
                <span class="rounded bg-base-300 px-1 text-base-content/60">{{ choiceLabel(seg.choice) }}</span>
                <button class="iw-toolbar-btn btn-xs ml-auto" :title="t('mergeView.reselect')" @click="reselect(seg)">
                  {{ t('mergeView.reselect') }}
                </button>
              </div>
              <textarea
                v-model="seg.text"
                spellcheck="false"
                rows="2"
                class="w-full resize-y bg-transparent px-2 py-1 outline-none"
                @input="autoGrow"
              ></textarea>
            </template>

            <!-- 未选：ours / theirs 对照 + 采用按钮 -->
            <template v-else>
              <div class="flex items-center gap-1 border-b border-warning/30 px-2 py-0.5 text-2xs">
                <span class="text-base-content/50">{{ t('mergeView.conflict') }} #{{ conflictIndex(i) }}</span>
                <div class="ml-auto flex items-center gap-1">
                  <button class="iw-toolbar-btn btn-xs text-success" @click="choose(seg, 'ours')">{{ t('mergeView.useCurrent') }}</button>
                  <button class="iw-toolbar-btn btn-xs text-info" @click="choose(seg, 'theirs')">{{ t('mergeView.useIncoming') }}</button>
                  <button class="iw-toolbar-btn btn-xs" @click="choose(seg, 'both')">{{ t('mergeView.useBoth') }}</button>
                </div>
              </div>
              <div class="grid grid-cols-2 divide-x divide-warning/30">
                <div class="overflow-auto bg-success/5 px-2 py-1">
                  <div class="mb-0.5 text-2xs text-success/80">{{ t('mergeView.ours') }}</div>
                  <pre class="whitespace-pre-wrap break-words">{{ seg.ours || '∅' }}</pre>
                </div>
                <div class="overflow-auto bg-info/5 px-2 py-1">
                  <div class="mb-0.5 text-2xs text-info/80">{{ t('mergeView.theirs') }}</div>
                  <pre class="whitespace-pre-wrap break-words">{{ seg.theirs || '∅' }}</pre>
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DiffView from './DiffView.vue'

const { t } = useI18n()

const props = defineProps<{
  ours: string
  theirs: string
  /** 工作区文件内容（含 git 写入的 <<<<<<< 冲突标记），作为结果侧初值 */
  working: string
}>()

const emit = defineEmits<{
  'update:content': [value: string]
  'update:remaining': [count: number]
}>()

type Choice = 'ours' | 'theirs' | 'both'
interface CtxSeg { type: 'context'; text: string }
interface ConflictSeg {
  type: 'conflict'
  ours: string
  theirs: string
  base: string
  /** 原始冲突块（含标记）逐行拼回，未解决时作为 assembled 的贡献 → 初值等于 working */
  raw: string
  choice: Choice | null
  /** 解决后写入结果的文本（可再编辑） */
  text: string
}
type Seg = CtxSeg | ConflictSeg

const segments = ref<Seg[]>([])

/** 解析含冲突标记的文本为「上下文 | 冲突块」序列（支持 diff3 的 ||||||| base）。 */
function parseConflicts(text: string): Seg[] {
  const lines = text.split('\n')
  const segs: Seg[] = []
  let ctx: string[] = []
  const flushCtx = () => {
    if (ctx.length) { segs.push({ type: 'context', text: ctx.join('\n') }); ctx = [] }
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.startsWith('<<<<<<<')) {
      flushCtx()
      const rawLines: string[] = [line]
      const ours: string[] = []
      const theirs: string[] = []
      const base: string[] = []
      i++
      let cur = lines[i]
      while (cur !== undefined && !cur.startsWith('|||||||') && !cur.startsWith('=======')) {
        ours.push(cur); rawLines.push(cur); cur = lines[++i]
      }
      if (cur !== undefined && cur.startsWith('|||||||')) {
        rawLines.push(cur); cur = lines[++i]
        while (cur !== undefined && !cur.startsWith('=======')) { base.push(cur); rawLines.push(cur); cur = lines[++i] }
      }
      if (cur !== undefined && cur.startsWith('=======')) { rawLines.push(cur); cur = lines[++i] }
      while (cur !== undefined && !cur.startsWith('>>>>>>>')) { theirs.push(cur); rawLines.push(cur); cur = lines[++i] }
      if (cur !== undefined && cur.startsWith('>>>>>>>')) { rawLines.push(cur); i++ }
      segs.push({
        type: 'conflict',
        ours: ours.join('\n'),
        theirs: theirs.join('\n'),
        base: base.join('\n'),
        raw: rawLines.join('\n'),
        choice: null,
        text: '',
      })
    } else {
      ctx.push(line); i++
    }
  }
  flushCtx()
  return segs
}

watch(() => props.working, (w) => { segments.value = parseConflicts(w) }, { immediate: true })

// 未解决冲突块贡献原始标记块（初值=working）；解决后贡献编辑文本。
const assembled = computed(() =>
  segments.value.map(s => (s.type === 'context' ? s.text : (s.choice ? s.text : s.raw))).join('\n'),
)
const remaining = computed(() =>
  segments.value.filter((s): s is ConflictSeg => s.type === 'conflict' && !s.choice).length,
)

watch(assembled, v => emit('update:content', v), { immediate: true })
watch(remaining, v => emit('update:remaining', v), { immediate: true })

/** 冲突块在所有冲突中的序号（1 起） */
function conflictIndex(segIndex: number): number {
  let n = 0
  for (let k = 0; k <= segIndex; k++) if (segments.value[k]?.type === 'conflict') n++
  return n
}

function choose(seg: ConflictSeg, c: Choice) {
  seg.choice = c
  seg.text = c === 'ours' ? seg.ours : c === 'theirs' ? seg.theirs : `${seg.ours}\n${seg.theirs}`
}
function reselect(seg: ConflictSeg) {
  seg.choice = null
  seg.text = ''
}
function choiceLabel(c: Choice): string {
  return c === 'ours' ? t('mergeView.useCurrent') : c === 'theirs' ? t('mergeView.useIncoming') : t('mergeView.useBoth')
}

function autoGrow(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
</script>
