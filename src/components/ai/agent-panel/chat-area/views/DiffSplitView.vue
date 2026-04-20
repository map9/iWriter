<template>
  <div class="dsv">
    <!-- Stats bar -->
    <div v-if="addedLines > 0 || removedLines > 0" class="dsv-stats">
      <span v-if="removedLines > 0" class="dsv-stat dsv-stat--removed">-{{ removedLines }}</span>
      <span v-if="addedLines > 0" class="dsv-stat dsv-stat--added">+{{ addedLines }}</span>
    </div>

    <!-- Column headers -->
    <div class="dsv-headers">
      <div class="dsv-header dsv-header--left">原文</div>
      <div class="dsv-header dsv-header--right">{{ editableRight ? '修改后（可编辑）' : '修改后' }}</div>
    </div>

    <!-- Diff rows -->
    <div v-if="editableRight && isEditing" class="dsv-body dsv-body--editable">
      <div class="dsv-cell dsv-cell--removed dsv-cell--full">
        <pre class="dsv-pre">{{ oldContent }}</pre>
      </div>
      <div
        class="dsv-cell dsv-cell--full dsv-cell--editor"
      >
        <textarea
          ref="editorRef"
          :value="editableContent"
          class="dsv-editor"
          @input="onEditorInput"
          @blur="deactivateEditing"
        />
      </div>
    </div>
    <div v-else class="dsv-rendered">
      <template v-for="(row, i) in renderedRows" :key="i">
        <div
          class="dsv-rendered-pane"
          :class="renderedOldPaneClass(row.type)"
        >
          <MarkdownContentView
            v-if="row.left"
            :content="row.left"
            mode="markdown"
          />
        </div>
        <div
          class="dsv-rendered-pane"
          :class="[renderedNewPaneClass(row.type), editableRight ? 'dsv-cell--clickable' : '']"
          @click="activateEditing"
        >
          <MarkdownContentView
            v-if="row.right"
            :content="row.right"
            mode="markdown"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { diffArrays } from 'diff'
import MarkdownContentView from './MarkdownContentView.vue'

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

const effectiveNewContent = computed(() => props.editableRight ? editableContent.value : (props.newContent ?? ''))

const oldLines = computed(() => splitLines(props.oldContent ?? ''))
const newLines = computed(() => splitLines(effectiveNewContent.value))
const oldBlocks = computed(() => splitMarkdownBlocks(props.oldContent ?? ''))
const newBlocks = computed(() => splitMarkdownBlocks(effectiveNewContent.value))

const diffChunks = computed(() => diffArrays(oldLines.value, newLines.value))
const renderedDiffChunks = computed(() => diffArrays(oldBlocks.value, newBlocks.value))

const addedLines = computed(() =>
  diffChunks.value.filter(c => c.added).reduce((s, c) => s + ((c.value as string[]).length ?? 0), 0)
)

const removedLines = computed(() =>
  diffChunks.value.filter(c => c.removed).reduce((s, c) => s + ((c.value as string[]).length ?? 0), 0)
)

const editableContent = computed(() => props.modelValue ?? props.newContent ?? '')

type RenderedRow = {
  type: 'unchanged' | 'changed' | 'removed-only' | 'added-only'
  left: string
  right: string
}

const renderedRows = computed<RenderedRow[]>(() => {
  const chunks = renderedDiffChunks.value
  const result: RenderedRow[] = []
  let i = 0
  while (i < chunks.length) {
    const chunk = chunks[i]!
    const values = chunk.value as string[]
    if (!chunk.added && !chunk.removed) {
      for (const block of values) {
        result.push({ type: 'unchanged', left: block, right: block })
      }
      i++
      continue
    }

    if (chunk.removed) {
      const next = chunks[i + 1]
      if (next?.added) {
        const leftBlocks = values
        const rightBlocks = next.value as string[]
        const count = Math.max(leftBlocks.length, rightBlocks.length)
        for (let index = 0; index < count; index++) {
          const left = leftBlocks[index] ?? ''
          const right = rightBlocks[index] ?? ''
          if (left && right) {
            result.push({ type: 'changed', left, right })
          } else if (left) {
            result.push({ type: 'removed-only', left, right: '' })
          } else {
            result.push({ type: 'added-only', left: '', right })
          }
        }
        i += 2
        continue
      }

      for (const block of values) {
        result.push({ type: 'removed-only', left: block, right: '' })
      }
      i++
      continue
    }

    for (const block of values) {
      result.push({ type: 'added-only', left: '', right: block })
    }
    i++
  }
  return result
})

function onEditorInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function activateEditing() {
  if (!props.editableRight || isEditing.value) return
  isEditing.value = true
  nextTick(() => {
    editorRef.value?.focus()
  })
}

function deactivateEditing() {
  isEditing.value = false
}

function splitLines(text: string): string[] {
  if (text === '') return ['']
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? ['']
}

function splitMarkdownBlocks(text: string): string[] {
  if (!text.trim()) return ['']

  const lines = text.split('\n')
  const blocks: string[] = []
  let buffer: string[] = []
  let inFence = false
  let currentKind: 'paragraph' | 'heading' | 'list' | 'quote' | 'table' | 'code' | null = null
  let currentListIndent: number | null = null

  const flush = () => {
    if (!buffer.length) return
    blocks.push(buffer.join('\n').trimEnd())
    buffer = []
    currentKind = null
    currentListIndent = null
  }

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (!inFence && buffer.length) flush()
      inFence = !inFence
      currentKind = 'code'
      buffer.push(line)
      if (!inFence) flush()
      continue
    }

    if (inFence) {
      buffer.push(line)
      continue
    }

    if (line.trim() === '') {
      flush()
      continue
    }

    const nextKind = classifyMarkdownLine(line)
    const nextListIndent = nextKind === 'list' ? getListIndent(line) : null

    if (!buffer.length) {
      currentKind = nextKind
      currentListIndent = nextListIndent
      buffer.push(line)
      continue
    }

    if (
      currentKind === 'list'
      && nextKind === 'list'
      && currentListIndent !== null
      && nextListIndent === currentListIndent
      && isListItemStart(line)
    ) {
      flush()
      currentKind = nextKind
      currentListIndent = nextListIndent
      buffer.push(line)
      continue
    }

    if (shouldContinueBlock(
      currentKind,
      nextKind,
      line,
      buffer[buffer.length - 1] ?? '',
      currentListIndent,
      nextListIndent,
    )) {
      buffer.push(line)
      continue
    }

    flush()
    currentKind = nextKind
    currentListIndent = nextListIndent
    buffer.push(line)
  }

  flush()
  return blocks.length ? blocks : ['']
}

function classifyMarkdownLine(line: string): 'paragraph' | 'heading' | 'list' | 'quote' | 'table' | 'code' {
  if (/^\s{0,3}#{1,6}\s/.test(line)) return 'heading'
  if (/^\s*>/.test(line)) return 'quote'
  if (/^\s*(?:[-+*]|\d+\.)\s+/.test(line) || /^\s{2,}(?:[-+*]|\d+\.)\s+/.test(line)) return 'list'
  if (/^\s*\|.*\|\s*$/.test(line) || /^\s*[:\-]+\s*(?:\|\s*[:\-]+\s*)+$/.test(line)) return 'table'
  return 'paragraph'
}

function shouldContinueBlock(
  currentKind: 'paragraph' | 'heading' | 'list' | 'quote' | 'table' | 'code' | null,
  nextKind: 'paragraph' | 'heading' | 'list' | 'quote' | 'table' | 'code',
  line: string,
  previousLine: string,
  currentListIndent: number | null,
  nextListIndent: number | null,
): boolean {
  if (!currentKind) return false
  if (currentKind === 'code') return true
  if (currentKind === 'heading') return false
  if (currentKind === 'table') return nextKind === 'table'
  if (currentKind === 'quote') return nextKind === 'quote' || (nextKind === 'paragraph' && /^\s{2,}/.test(line))
  if (currentKind === 'list') {
    return (nextKind === 'list' && (
      !isListItemStart(line)
      || currentListIndent === null
      || nextListIndent === null
      || nextListIndent > currentListIndent
    ))
      || /^\s{2,}\S/.test(line)
      || (/^\s*$/.test(previousLine) && /^\s{2,}\S/.test(line))
  }
  if (currentKind === 'paragraph') {
    return nextKind === 'paragraph'
  }
  return false
}

function isListItemStart(line: string): boolean {
  return /^\s*(?:[-+*]|\d+\.)\s+/.test(line)
}

function getListIndent(line: string): number {
  const match = line.match(/^(\s*)/)
  return match?.[1]?.length ?? 0
}

function renderedOldPaneClass(type: RenderedRow['type']): string {
  if (type === 'changed' || type === 'removed-only') return 'dsv-rendered-pane--old-strong'
  if (type === 'added-only') return 'dsv-rendered-pane--placeholder'
  return 'dsv-rendered-pane--old-soft'
}

function renderedNewPaneClass(type: RenderedRow['type']): string {
  if (type === 'changed' || type === 'added-only') return 'dsv-rendered-pane--new-strong'
  if (type === 'removed-only') return 'dsv-rendered-pane--placeholder'
  return 'dsv-rendered-pane--new-soft'
}
</script>

<style scoped>
.dsv {
  font-size: 0.75rem;
  line-height: 1.55;
}

/* Stats bar */
.dsv-stats {
  display: flex;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid #fde68a;
  background: #fffbeb;
}
.dsv-stat {
  font-size: 0.7rem;
  font-weight: 600;
  font-family: ui-monospace, Menlo, monospace;
  padding: 0 0.35rem;
  border-radius: 0.25rem;
}
.dsv-stat--removed { color: #b91c1c; background: #fee2e2; }
.dsv-stat--added   { color: #15803d; background: #dcfce7; }

/* Column headers */
.dsv-headers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid #fde68a;
}
.dsv-header {
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
}
.dsv-header--left  { color: #b91c1c; border-right: 1px solid #fde68a; }
.dsv-header--right { color: #15803d; }

/* Body grid */
.dsv-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  max-height: 22rem;
  overflow-y: auto;
}
.dsv-body--editable {
  align-items: stretch;
  height: 22rem;
}

.dsv-rendered {
  display: grid;
  grid-template-columns: 1fr 1fr;
  max-height: 22rem;
  overflow: auto;
}

.dsv-rendered-pane {
  min-height: 4rem;
  overflow: auto;
  padding: 0.6rem 0.75rem;
  border-top: 1px solid #f3e7a2;
}

.dsv-rendered-pane + .dsv-rendered-pane {
  border-left: 1px solid #fde68a;
}

.dsv-rendered-pane--old-soft { background: #fffdfa; color: #6b5b40; }
.dsv-rendered-pane--new-soft { background: #fbfefb; color: #45624f; }
.dsv-rendered-pane--old-strong {
  background: #fef2f2;
  color: #7f1d1d;
  border-left: 2px solid #f87171;
}
.dsv-rendered-pane--new-strong {
  background: #f0fdf4;
  color: #14532d;
  border-left: 2px solid #4ade80;
}
.dsv-rendered-pane--placeholder {
  background: #fafafa;
}

/* Cells */
.dsv-cell {
  padding: 0.375rem 0.5rem;
  min-height: 1.75rem;
  overflow: hidden;
}
.dsv-cell--full {
  min-height: 22rem;
}
.dsv-cell + .dsv-cell {
  border-left: 1px solid #fde68a;
}

/* Alternating row borders: pair every two cells */
.dsv-cell:nth-child(2n-1) {
  border-top: 1px solid transparent;
}
.dsv-cell:nth-child(2n) {
  border-top: 1px solid transparent;
}
.dsv-cell:not(:first-child):not(:nth-child(2)):nth-child(2n-1) {
  border-top-color: #f3f4f6;
}
.dsv-cell:not(:first-child):not(:nth-child(2)):nth-child(2n) {
  border-top-color: #f3f4f6;
}

.dsv-cell--editor {
  background: #f0fdf4;
  border-left: 2px solid #4ade80 !important;
  padding: 0;
}
.dsv-cell--clickable {
  cursor: text;
}

.dsv-editor {
  width: 100%;
  height: 100%;
  min-height: 22rem;
  border: 0;
  resize: none;
  background: transparent;
  color: #14532d;
  padding: 0.75rem 0.85rem;
  font-size: 0.75rem;
  line-height: 1.6;
  font-family: ui-monospace, Menlo, monospace;
  outline: none;
}
.dsv-pre {
  margin: 0;
  min-height: 1.6em;
  white-space: break-spaces;
  overflow-wrap: anywhere;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 0.72rem;
  line-height: 1.6;
}
</style>
