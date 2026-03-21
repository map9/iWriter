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
      <div class="dsv-header dsv-header--right">修改后</div>
    </div>

    <!-- Diff rows -->
    <div class="dsv-body">
      <template v-for="(row, i) in rows" :key="i">
        <!-- Unchanged: show same content in both columns -->
        <template v-if="row.type === 'unchanged'">
          <div class="dsv-cell dsv-cell--unchanged" v-html="renderMd(row.left)" />
          <div class="dsv-cell dsv-cell--unchanged" v-html="renderMd(row.left)" />
        </template>
        <!-- Changed pair: removed on left, added on right -->
        <template v-else-if="row.type === 'changed'">
          <div class="dsv-cell dsv-cell--removed" v-html="renderMd(row.left)" />
          <div class="dsv-cell dsv-cell--added" v-html="renderMd(row.right)" />
        </template>
        <!-- Only removed (no corresponding add) -->
        <template v-else-if="row.type === 'removed-only'">
          <div class="dsv-cell dsv-cell--removed" v-html="renderMd(row.left)" />
          <div class="dsv-cell dsv-cell--placeholder" />
        </template>
        <!-- Only added (no corresponding remove) -->
        <template v-else-if="row.type === 'added-only'">
          <div class="dsv-cell dsv-cell--placeholder" />
          <div class="dsv-cell dsv-cell--added" v-html="renderMd(row.right)" />
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { diffLines } from 'diff'
import { marked } from 'marked'

const props = defineProps<{
  oldContent: string
  newContent: string
}>()

interface DiffRow {
  type: 'unchanged' | 'changed' | 'removed-only' | 'added-only'
  left: string
  right: string
}

const diffChunks = computed(() => diffLines(props.oldContent ?? '', props.newContent ?? ''))

const rows = computed<DiffRow[]>(() => {
  const chunks = diffChunks.value
  const result: DiffRow[] = []
  let i = 0
  while (i < chunks.length) {
    const chunk = chunks[i]!
    if (!chunk.added && !chunk.removed) {
      result.push({ type: 'unchanged', left: chunk.value, right: chunk.value })
      i++
    } else if (chunk.removed) {
      const next = chunks[i + 1]
      if (next?.added) {
        result.push({ type: 'changed', left: chunk.value, right: next.value })
        i += 2
      } else {
        result.push({ type: 'removed-only', left: chunk.value, right: '' })
        i++
      }
    } else {
      // added only
      result.push({ type: 'added-only', left: '', right: chunk.value })
      i++
    }
  }
  return result
})

const addedLines = computed(() =>
  diffChunks.value.filter(c => c.added).reduce((s, c) => s + (c.count ?? 0), 0)
)

const removedLines = computed(() =>
  diffChunks.value.filter(c => c.removed).reduce((s, c) => s + (c.count ?? 0), 0)
)

function renderMd(text: string): string {
  if (!text) return ''
  try {
    return marked.parse(text, { async: false }) as string
  } catch {
    return `<pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
  }
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
  max-height: 14rem;
  overflow-y: auto;
}

/* Cells */
.dsv-cell {
  padding: 0.375rem 0.5rem;
  word-break: break-word;
  min-height: 1.75rem;
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

.dsv-cell--unchanged  { background: #fff; color: #374151; }
.dsv-cell--removed    { background: #fef2f2; border-left: 2px solid #f87171 !important; color: #7f1d1d; }
.dsv-cell--added      { background: #f0fdf4; border-left: 2px solid #4ade80 !important; color: #14532d; }
.dsv-cell--placeholder { background: #f9fafb; }

/* Markdown styles inside cells */
.dsv-cell :deep(p)          { margin: 0 0 0.3em; }
.dsv-cell :deep(p:last-child) { margin-bottom: 0; }
.dsv-cell :deep(h1),
.dsv-cell :deep(h2),
.dsv-cell :deep(h3),
.dsv-cell :deep(h4),
.dsv-cell :deep(h5),
.dsv-cell :deep(h6) {
  font-weight: 600;
  line-height: 1.3;
  margin: 0.4em 0 0.15em;
}
.dsv-cell :deep(h1):first-child,
.dsv-cell :deep(h2):first-child,
.dsv-cell :deep(h3):first-child { margin-top: 0; }
.dsv-cell :deep(h1) { font-size: 0.875rem; }
.dsv-cell :deep(h2) { font-size: 0.8125rem; }
.dsv-cell :deep(h3),
.dsv-cell :deep(h4),
.dsv-cell :deep(h5),
.dsv-cell :deep(h6) { font-size: 0.75rem; }
.dsv-cell :deep(ul),
.dsv-cell :deep(ol) { padding-left: 1.2rem; margin: 0.2em 0; }
.dsv-cell :deep(ul)    { list-style-type: disc; }
.dsv-cell :deep(ol)    { list-style-type: decimal; }
.dsv-cell :deep(li)    { display: list-item; margin: 0.1em 0; }
.dsv-cell :deep(code)  {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 0.7rem;
  background: rgba(0,0,0,0.06);
  border-radius: 0.2rem;
  padding: 0.1em 0.3em;
}
.dsv-cell :deep(pre)   {
  margin: 0.3em 0;
  border-radius: 0.25rem;
  background: rgba(0,0,0,0.05);
  padding: 0.4rem 0.6rem;
  overflow-x: auto;
  white-space: pre-wrap;
}
.dsv-cell :deep(pre code) { background: none; padding: 0; }
.dsv-cell :deep(strong) { font-weight: 600; }
.dsv-cell :deep(em)     { font-style: italic; }
.dsv-cell :deep(blockquote) {
  margin: 0.25em 0;
  padding: 0 0 0 0.5rem;
  border-left: 3px solid #d1d5db;
  opacity: 0.75;
}
</style>
