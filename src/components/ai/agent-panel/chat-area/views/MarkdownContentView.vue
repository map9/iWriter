<template>
  <div class="mcv" :class="`mcv--${size ?? 'xs'}`">
    <!-- Plain text mode -->
    <pre v-if="isText" class="mcv-pre">{{ content }}</pre>
    <!-- Markdown rendered mode -->
    <div v-else class="mcv-md" v-html="rendered" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{
  content: string
  /**
   * Rendering mode:
   *   'markdown' — always render as markdown (assistant messages, proposal diffs)
   *   'text'     — always render as monospace plain text (raw output, logs)
   *   'auto'     — detect from content (default); falls back to 'text' for non-markdown content
   */
  mode?: 'markdown' | 'text' | 'auto'
  /**
   * Font size scale:
   *   'xs' — compact, for tool results / proposal diffs (default)
   *   'sm' — comfortable reading, for assistant message bubbles
   */
  size?: 'xs' | 'sm'
}>()

const MD_PATTERN = /^#{1,6}\s|\*\*[^*]+\*\*|^[-*]\s|^>\s|^```|^\d+\.\s|\[.+\]\(.+\)/m
const HTML_PATTERN = /<\/?[a-z][\s\S]*>/i

function looksLikeMarkdown(text: string): boolean {
  return MD_PATTERN.test(text) || HTML_PATTERN.test(text)
}

const isText = computed(() => {
  if (props.mode === 'text')     return true
  if (props.mode === 'markdown') return false
  // auto: detect
  return !looksLikeMarkdown(props.content)
})

const rendered = computed(() => {
  try { return marked.parse(props.content, { async: false }) as string }
  catch { return `<pre>${escapeHtml(props.content)}</pre>` }
})

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
</script>

<style scoped>
/* ── Size tokens ───────────────────────────────────────────────── */
.mcv--xs {
  --mcv-base:  0.75rem;
  --mcv-h1:    0.875rem;
  --mcv-h2:    0.8125rem;
  --mcv-h3:    0.78rem;
  --mcv-h4:    0.75rem;
  --mcv-code:  0.7rem;
}
.mcv--sm {
  --mcv-base:  0.875rem;
  --mcv-h1:    1.0625rem;
  --mcv-h2:    0.9375rem;
  --mcv-h3:    0.875rem;
  --mcv-h4:    0.875rem;
  --mcv-code:  0.8125rem;
}

/* ── Container ─────────────────────────────────────────────────── */
.mcv {
  --mcv-current-10: color-mix(in oklab, currentColor 10%, transparent);
  --mcv-current-30: color-mix(in oklab, currentColor 30%, transparent);
  --mcv-current-50: color-mix(in oklab, currentColor 50%, transparent);
  --mcv-current-70: color-mix(in oklab, currentColor 70%, transparent);
  --mcv-success-bg: color-mix(in oklab, var(--color-success) 30%, transparent);
  --mcv-success-border: color-mix(in oklab, var(--color-success-content) 15%, transparent);
  --mcv-warning-bg: color-mix(in oklab, var(--color-warning) 30%, transparent);
  --mcv-warning-border: color-mix(in oklab, var(--color-warning-content) 15%, transparent);
  color: inherit;
  font-size: var(--mcv-base, 0.75rem);
  line-height: 1.55;
  word-break: break-word;
}

/* ── Plain text mode ───────────────────────────────────────────── */
.mcv-pre {
  margin: 0;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: var(--mcv-code, 0.7rem);
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Markdown mode ─────────────────────────────────────────────── */

/* Paragraphs */
.mcv-md :deep(p) {
  margin: 0 0 0.35em;
}
.mcv-md :deep(p:last-child) {
  margin-bottom: 0;
}

/* Headings */
.mcv-md :deep(h1),
.mcv-md :deep(h2),
.mcv-md :deep(h3),
.mcv-md :deep(h4),
.mcv-md :deep(h5),
.mcv-md :deep(h6) {
  font-weight: 600;
  line-height: 1.3;
  margin: 0.6em 0 0.2em;
}
.mcv-md :deep(h1):first-child,
.mcv-md :deep(h2):first-child,
.mcv-md :deep(h3):first-child {
  margin-top: 0;
}
.mcv-md :deep(h1) { font-size: var(--mcv-h1, 0.875rem); }
.mcv-md :deep(h2) { font-size: var(--mcv-h2, 0.8125rem); }
.mcv-md :deep(h3) { font-size: var(--mcv-h3, 0.78rem); }
.mcv-md :deep(h4),
.mcv-md :deep(h5),
.mcv-md :deep(h6) { font-size: var(--mcv-h4, 0.75rem); }

/* Lists */
.mcv-md :deep(ul),
.mcv-md :deep(ol) {
  padding-left: 1.375rem;
  margin: 0.25em 0;
}
.mcv-md :deep(ul) {
  list-style-type: disc;
}
.mcv-md :deep(ul ul) {
  list-style-type: circle;
}
.mcv-md :deep(ul ul ul) {
  list-style-type: square;
}
.mcv-md :deep(ol) {
  list-style-type: decimal;
}
.mcv-md :deep(ol ol) {
  list-style-type: lower-alpha;
}
.mcv-md :deep(li) {
  display: list-item;
  margin: 0.15em 0;
}
.mcv-md :deep(li > p) {
  margin: 0;
}

/* GFM task lists */
.mcv-md :deep(ul.contains-task-list) {
  list-style: none;
  padding-left: 0;
}
.mcv-md :deep(ul:has(> li > input[type='checkbox'])) {
  list-style: none;
  padding-left: 0;
}
.mcv-md :deep(li.task-list-item) {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0.2em 0;
  list-style: none;
}
.mcv-md :deep(li:has(> input[type='checkbox'])) {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0.2em 0;
  list-style: none;
}
.mcv-md :deep(li.task-list-item input[type='checkbox']) {
  margin: 0.18em 0 0;
  width: 0.85rem;
  height: 0.85rem;
  flex: 0 0 auto;
  accent-color: var(--color-success);
  pointer-events: none;
}
.mcv-md :deep(li > input[type='checkbox']) {
  margin: 0.18em 0 0;
  width: 0.85rem;
  height: 0.85rem;
  flex: 0 0 auto;
  accent-color: var(--color-success);
  pointer-events: none;
}
.mcv-md :deep(li.task-list-item p) {
  margin: 0;
}
.mcv-md :deep(.mcv-todo-status) {
  margin-left: 0.35rem;
  font-size: 0.92em;
  white-space: nowrap;
}
.mcv-md :deep(.mcv-todo-status--progress) {
  color: var(--color-warning-content);
  font-weight: 600;
}

/* Custom todo UI emitted by write_todos formatter */
.mcv-md :deep(ul.mcv-todo-list) {
  list-style: none;
  padding-left: 0;
  margin: 0.25em 0;
}
.mcv-md :deep(li.mcv-todo-item) {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.22em 0;
  list-style: none;
}
.mcv-md :deep(.mcv-todo-box) {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.22rem;
  border: 1px solid var(--mcv-current-30);
  background: var(--mcv-current-10);
  font-size: 0.72rem;
  line-height: 1;
  margin-top: 0.12rem;
}
.mcv-md :deep(.mcv-todo-box--done) {
  border-color: var(--mcv-success-border);
  background: var(--mcv-success-bg);
  color: var(--color-success-content);
}
.mcv-md :deep(.mcv-todo-box--progress) {
  border-color: var(--mcv-warning-border);
  background: var(--mcv-warning-bg);
  color: var(--color-warning-content);
}
.mcv-md :deep(.mcv-todo-box--pending) {
  border-color: var(--mcv-current-30);
  background: var(--mcv-current-10);
  color: transparent;
}
.mcv-md :deep(.mcv-todo-label) {
  flex: 1 1 auto;
}

/* Inline code */
.mcv-md :deep(code) {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: var(--mcv-code, 0.7rem);
  background: var(--mcv-current-10);
  border-radius: 0.2rem;
  padding: 0.1em 0.35em;
}

/* Code blocks */
.mcv-md :deep(pre) {
  margin: 0.4em 0;
  border-radius: 0.3rem;
  background: var(--mcv-current-10);
  padding: 0.5rem 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.mcv-md :deep(pre:first-child) { margin-top: 0; }
.mcv-md :deep(pre:last-child)  { margin-bottom: 0; }
.mcv-md :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: var(--mcv-code, 0.7rem);
  line-height: 1.65;
}

/* Blockquote */
.mcv-md :deep(blockquote) {
  margin: 0.35em 0;
  padding: 0.1em 0 0.1em 0.625rem;
  border-left: 3px solid var(--mcv-current-30);
  color: var(--mcv-current-70);
}
.mcv-md :deep(blockquote p) {
  margin: 0;
}

/* Horizontal rule */
.mcv-md :deep(hr) {
  border: none;
  border-top: 1px solid var(--mcv-current-30);
  margin: 0.5em 0;
}

/* Links */
.mcv-md :deep(a) {
  color: currentColor;
  text-decoration: underline;
  text-decoration-color: var(--mcv-current-50);
  text-underline-offset: 0.12em;
}
.mcv-md :deep(a:hover) {
  text-decoration-color: currentColor;
}

/* Tables */
.mcv-md :deep(table) {
  border-collapse: collapse;
  font-size: var(--mcv-code, 0.7rem);
  margin: 0.4em 0;
  width: 100%;
}
.mcv-md :deep(th),
.mcv-md :deep(td) {
  border: 1px solid var(--mcv-current-30);
  padding: 0.2rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
.mcv-md :deep(th) {
  background: var(--mcv-current-10);
  font-weight: 600;
}

/* Strong / Em */
.mcv-md :deep(strong) {
  font-weight: 600;
}
.mcv-md :deep(em) {
  font-style: italic;
}
</style>
