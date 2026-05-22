<template>
  <div class="text-xs leading-[1.55]">
    <!-- GitHub-style per-side header -->
    <div class="grid grid-cols-2 border-b border-base-300 bg-base-200">
      <div class="flex items-center justify-between gap-2 border-r border-base-300 px-2.5 py-1.5 text-2xs text-base-content/70">
        <span class="inline-flex items-center rounded bg-error/50 px-1.5 py-px font-mono font-semibold text-error-content">
          {{ t('agentPanel.diffSplit.removals', { count: removedLines }) }}
        </span>
        <span class="tabular-nums">{{ t('agentPanel.diffSplit.lines', { count: oldLineCount }) }}</span>
      </div>
      <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 text-2xs text-base-content/70">
        <span class="inline-flex items-center rounded bg-success/50 px-1.5 py-px font-mono font-semibold text-success-content">
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
      <div class="min-h-32 overflow-hidden bg-error/50 px-2 py-1.5 text-error-content">
        <pre class="m-0 whitespace-break-spaces wrap-break-word font-mono text-xs leading-relaxed">{{ oldContent }}</pre>
      </div>
      <div class="min-h-32 overflow-hidden border-l-2 border-success-content/15 bg-success/50">
        <textarea
          ref="editorRef"
          :value="editableContent"
          class="block h-auto min-h-full w-full resize-none border-0 bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-success-content outline-none"
          @input="onEditorInput"
          @blur="deactivateEditing"
        />
      </div>
    </div>

    <!-- Rendered diff: diffWords on full content -->
    <div v-else class="grid max-h-88 grid-cols-2 overflow-auto font-mono">
      <div class="whitespace-pre-wrap px-2.5 py-1.5 wrap-anywhere text-base-content">
        <span
          v-for="(seg, i) in leftSegments"
          :key="i"
          :class="seg.kind === 'removed' ? 'rounded-sm bg-error/50 text-error-content' : ''"
        >{{ seg.value }}</span>
      </div>
      <div
        class="whitespace-pre-wrap border-l border-base-300 px-2.5 py-1.5 wrap-anywhere text-base-content"
        :class="editableRight ? 'cursor-text' : ''"
        @click="activateEditing"
      >
        <span
          v-for="(seg, i) in rightSegments"
          :key="i"
          :class="seg.kind === 'added' ? 'rounded-sm bg-success/70 text-success-content' : ''"
        >{{ seg.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffWords, diffLines } from 'diff'

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

const editableContent = computed(() => props.modelValue ?? props.newContent ?? '')

const oldLineCount = computed(() => effectiveOldContent.value.split('\n').length)
const newLineCount = computed(() => effectiveNewContent.value.split('\n').length)

const lineDiff = computed(() => diffLines(effectiveOldContent.value, effectiveNewContent.value))
const addedLines = computed(() => lineDiff.value.filter(c => c.added).reduce((s, c) => s + (c.count ?? 0), 0))
const removedLines = computed(() => lineDiff.value.filter(c => c.removed).reduce((s, c) => s + (c.count ?? 0), 0))

const wordDiff = computed(() => diffWords(effectiveOldContent.value, effectiveNewContent.value))

const leftSegments = computed(() =>
  wordDiff.value
    .filter(p => !p.added)
    .map(p => ({ value: p.value, kind: p.removed ? 'removed' : 'keep' }))
)

const rightSegments = computed(() =>
  wordDiff.value
    .filter(p => !p.removed)
    .map(p => ({ value: p.value, kind: p.added ? 'added' : 'keep' }))
)

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

function stripBlockMarkers(text: string): string {
  return text.replace(/^\{b:\d+\}\n?/gm, '')
}
</script>
