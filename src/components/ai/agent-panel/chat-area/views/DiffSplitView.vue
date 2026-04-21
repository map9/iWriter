<template>
  <div class="text-xs leading-[1.55]">
    <!-- GitHub-style per-side header -->
    <div class="grid grid-cols-2 border-b border-base-300 bg-base-200">
      <div class="flex items-center justify-between gap-2 border-r border-base-300 px-2.5 py-1.5 text-2xs text-base-content/60">
        <span class="inline-flex items-center rounded bg-error/20 px-1.5 py-px font-mono font-semibold text-error">
          {{ t('agentPanel.diffSplit.removals', { count: removedLines }) }}
        </span>
        <span class="tabular-nums">{{ t('agentPanel.diffSplit.lines', { count: oldLineCount }) }}</span>
      </div>
      <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 text-2xs text-base-content/60">
        <span class="inline-flex items-center rounded bg-success/20 px-1.5 py-px font-mono font-semibold text-success">
          {{ t('agentPanel.diffSplit.additions', { count: addedLines }) }}
        </span>
        <span class="tabular-nums">{{ t('agentPanel.diffSplit.lines', { count: newLineCount }) }}{{ editableRight ? isEditing ? ` · ${t('agentPanel.diffSplit.editing')}` : ` · ${t('agentPanel.diffSplit.editable')}` : '' }}</span>
      </div>
    </div>

    <!-- Editable mode: left pre + right textarea -->
    <div
      v-if="editableRight && isEditing"
      class="grid max-h-88 grid-cols-2 items-stretch overflow-y-auto"
    >
      <div class="min-h-32 overflow-hidden bg-error/10 px-2 py-1.5 text-error-content">
        <pre class="m-0 whitespace-break-spaces wrap-break-word font-mono text-xs leading-relaxed">{{ oldContent }}</pre>
      </div>
      <div class="min-h-32 overflow-hidden border-l-2 border-success bg-success/10">
        <textarea
          ref="editorRef"
          :value="editableContent"
          class="block h-auto min-h-full w-full resize-none border-0 bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-success-content outline-none"
          @input="onEditorInput"
          @blur="deactivateEditing"
        />
      </div>
    </div>

    <!-- Rendered diff rows -->
    <div v-else class="grid max-h-88 grid-cols-2 overflow-auto font-mono gap-y-1">
      <template v-for="(row, i) in renderedRows" :key="i">
        <div
          class="whitespace-pre-wrap px-2.5 py-0.5 wrap-anywhere"
          :class="leftCellClass(row)"
        >
          <template v-if="row.type === 'changed'">
            <span
              v-for="(seg, si) in row.leftSegments"
              :key="si"
              :class="seg.kind === 'removed' ? 'rounded-sm bg-error/30' : ''"
            >{{ seg.value }}</span>
          </template>
          <template v-else-if="row.type === 'unchanged' || row.type === 'removed-only'">
            {{ row.leftText || '\u00A0' }}
          </template>
          <template v-else>&nbsp;</template>
        </div>
        <div
          class="whitespace-pre-wrap border-l border-base-300 px-2.5 py-0.5 wrap-anywhere"
          :class="[rightCellClass(row), editableRight ? 'cursor-text' : '']"
          @click="activateEditing"
        >
          <template v-if="row.type === 'changed'">
            <span
              v-for="(seg, si) in row.rightSegments"
              :key="si"
              :class="seg.kind === 'added' ? 'rounded-sm bg-success/40' : ''"
            >{{ seg.value }}</span>
          </template>
          <template v-else-if="row.type === 'unchanged' || row.type === 'added-only'">
            {{ row.rightText || '\u00A0' }}
          </template>
          <template v-else>&nbsp;</template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffArrays, diffWords } from 'diff'
const { t } = useI18n()

const props = defineProps<{
  oldContent: string
  newContent: string
  editableRight?: boolean
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
const isEditing = ref(false)
const editorRef = ref<HTMLTextAreaElement | null>(null)

const effectiveOldContent = computed(() => stripBlockMarkers(props.oldContent ?? ''))
const effectiveNewContent = computed(() => stripBlockMarkers(props.editableRight ? editableContent.value : (props.newContent ?? '')))

const oldLines = computed(() => splitLines(effectiveOldContent.value))
const newLines = computed(() => splitLines(effectiveNewContent.value))

const oldLineCount = computed(() => oldLines.value.length)
const newLineCount = computed(() => newLines.value.length)

const diffChunks = computed(() => diffArrays(oldLines.value, newLines.value))

const addedLines = computed(() =>
  diffChunks.value.filter(c => c.added).reduce((s, c) => s + ((c.value as string[]).length ?? 0), 0)
)

const removedLines = computed(() =>
  diffChunks.value.filter(c => c.removed).reduce((s, c) => s + ((c.value as string[]).length ?? 0), 0)
)

const editableContent = computed(() => props.modelValue ?? props.newContent ?? '')

type Segment = { value: string, kind: 'keep' | 'removed' | 'added' }

type RenderedRow =
  | { type: 'unchanged', leftText: string, rightText: string }
  | { type: 'changed', leftSegments: Segment[], rightSegments: Segment[] }
  | { type: 'removed-only', leftText: string }
  | { type: 'added-only', rightText: string }

const renderedRows = computed<RenderedRow[]>(() => {
  const chunks = diffChunks.value
  const result: RenderedRow[] = []
  let i = 0
  while (i < chunks.length) {
    const chunk = chunks[i]!
    const values = chunk.value as string[]
    if (!chunk.added && !chunk.removed) {
      for (const line of values) {
        const text = stripTrailingNewline(line)
        result.push({ type: 'unchanged', leftText: text, rightText: text })
      }
      i++
      continue
    }

    if (chunk.removed) {
      const next = chunks[i + 1]
      if (next?.added) {
        const leftLines = values
        const rightLines = next.value as string[]
        const count = Math.max(leftLines.length, rightLines.length)
        for (let index = 0; index < count; index++) {
          const leftRaw = leftLines[index]
          const rightRaw = rightLines[index]
          if (leftRaw !== undefined && rightRaw !== undefined) {
            const { leftSegments, rightSegments } = inlineDiff(
              stripTrailingNewline(leftRaw),
              stripTrailingNewline(rightRaw),
            )
            result.push({ type: 'changed', leftSegments, rightSegments })
          } else if (leftRaw !== undefined) {
            result.push({ type: 'removed-only', leftText: stripTrailingNewline(leftRaw) })
          } else if (rightRaw !== undefined) {
            result.push({ type: 'added-only', rightText: stripTrailingNewline(rightRaw) })
          }
        }
        i += 2
        continue
      }

      for (const line of values) {
        result.push({ type: 'removed-only', leftText: stripTrailingNewline(line) })
      }
      i++
      continue
    }

    for (const line of values) {
      result.push({ type: 'added-only', rightText: stripTrailingNewline(line) })
    }
    i++
  }
  return result
})

function inlineDiff(oldLine: string, newLine: string): { leftSegments: Segment[], rightSegments: Segment[] } {
  const parts = diffWords(oldLine, newLine)
  const leftSegments: Segment[] = []
  const rightSegments: Segment[] = []
  for (const part of parts) {
    if (part.added) {
      rightSegments.push({ value: part.value, kind: 'added' })
    } else if (part.removed) {
      leftSegments.push({ value: part.value, kind: 'removed' })
    } else {
      leftSegments.push({ value: part.value, kind: 'keep' })
      rightSegments.push({ value: part.value, kind: 'keep' })
    }
  }
  return { leftSegments, rightSegments }
}

function syncEditorHeight() {
  const el = editorRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function onEditorInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  syncEditorHeight()
}

function activateEditing() {
  if (!props.editableRight || isEditing.value) return
  isEditing.value = true
  nextTick(() => {
    editorRef.value?.focus()
    syncEditorHeight()
  })
}

function deactivateEditing() {
  isEditing.value = false
}

watch(editableContent, () => {
  if (isEditing.value) nextTick(syncEditorHeight)
})

function splitLines(text: string): string[] {
  if (text === '') return ['']
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? ['']
}

function stripBlockMarkers(text: string): string {
  return text.replace(/^\{b:\d+\}\n?/gm, '')
}

function stripTrailingNewline(line: string): string {
  return line.endsWith('\n') ? line.slice(0, -1) : line
}

function leftCellClass(row: RenderedRow): string {
  if (row.type === 'changed' || row.type === 'removed-only') return 'bg-error/10 text-error-content'
  if (row.type === 'added-only') return 'bg-base-200/60'
  return 'text-base-content'
}

function rightCellClass(row: RenderedRow): string {
  if (row.type === 'changed' || row.type === 'added-only') return 'bg-success/10 text-success-content'
  if (row.type === 'removed-only') return 'bg-base-200/60'
  return 'text-base-content'
}
</script>
