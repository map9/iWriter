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

function looksLikeMarkdown(text: string): boolean {
  return MD_PATTERN.test(text)
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

/* Inline code */
.mcv-md :deep(code) {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: var(--mcv-code, 0.7rem);
  background: rgba(0, 0, 0, 0.06);
  border-radius: 0.2rem;
  padding: 0.1em 0.35em;
}

/* Code blocks */
.mcv-md :deep(pre) {
  margin: 0.4em 0;
  border-radius: 0.3rem;
  background: rgba(0, 0, 0, 0.05);
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
  border-left: 3px solid #d1d5db;
  opacity: 0.75;
}
.mcv-md :deep(blockquote p) {
  margin: 0;
}

/* Horizontal rule */
.mcv-md :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 0.5em 0;
}

/* Links */
.mcv-md :deep(a) {
  color: #3b82f6;
  text-decoration: none;
}
.mcv-md :deep(a:hover) {
  text-decoration: underline;
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
  border: 1px solid #e5e7eb;
  padding: 0.2rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
.mcv-md :deep(th) {
  background: rgba(0, 0, 0, 0.03);
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