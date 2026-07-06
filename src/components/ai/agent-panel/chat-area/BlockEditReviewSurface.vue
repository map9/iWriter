<template>
  <ReviewSurfaceShell
    v-if="current"
    :is-batch="navigatorVm.isBatchReview"
    :index="currentIndex"
    :total="proposals.length"
    :is-delete="currentIsDelete"
    :approve-label="navigatorVm.approveButtonLabel"
    :reject-label="navigatorVm.rejectButtonLabel"
    :approve-all-label="navigatorVm.approveAllButtonLabel"
    :reject-all-label="navigatorVm.rejectAllButtonLabel"
    @approve="approve"
    @reject="rejectCurrent"
    @approve-all="$emit('approveAll')"
    @reject-all="$emit('rejectAll')"
    @prev="prev"
    @next="next"
  >
    <template #batch-summary>
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <div class="text-sm font-semibold text-warning-content">{{ t('agentPanel.blockEditReviewSurface.reviewTitle') }}</div>
          <button
            type="button"
            class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-base-300 bg-base-100 text-2xs text-base-content/70"
            :title="navigatorVm.batchHint"
          >?</button>
        </div>
        <div class="mt-1 text-xs text-warning-content">{{ navigatorVm.batchSummaryLine }}</div>
      </div>
    </template>

    <template #header="{ toneTitleClass, toneDescriptionClass }">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-xs font-medium" :class="toneTitleClass">{{ navigatorVm.currentTitle }}</div>
            <span
              v-if="currentIsDelete"
              class="inline-flex items-center rounded-full bg-error/50 px-1.5 py-0.5 text-2xs font-medium text-error-content"
            >
              {{ t('agentPanel.blockEditReviewSurface.highRisk') }}
            </span>
          </div>
          <div class="mt-1 truncate text-sm font-medium text-current" :title="navigatorVm.currentLabel">
            {{ navigatorVm.currentLabel }}
          </div>
        </div>
        <button
          v-if="canLocate"
          class="iw-btn btn-xs"
          :title="t('agentPanel.blockEditReviewSurface.locateHint')"
          @click="scrollToCurrentBlock"
        >{{ t('agentPanel.blockEditReviewSurface.locate') }}</button>
      </div>
      <div v-if="current.description" class="mt-2 text-xs" :class="toneDescriptionClass">
        {{ current.description }}
      </div>
    </template>

    <template #default>
      <div class="min-h-52">
        <template v-if="current.kind === 'create_file'">
          <div class="border-b border-base-300 px-3 py-2 text-xs font-medium text-base-content">
            {{ t('agentPanel.blockEditReviewSurface.newFilePreview') }}
          </div>
          <div class="p-3">
            <div class="mb-1 text-xs text-base-content/70">{{ t('agentPanel.blockEditReviewSurface.fileName', { name: current.filename }) }}</div>
            <div v-if="current.directory" class="mb-2 truncate text-xs text-base-content/50" :title="current.directory + '/' + current.filename">
              {{ t('agentPanel.blockEditReviewSurface.fileTargetPath', { path: current.directory + '/' + current.filename }) }}
            </div>
            <div class="rounded-md border border-base-300 p-2">
              <MarkdownContentView :content="current.content" />
            </div>
          </div>
        </template>

        <template v-else-if="current.type === 'delete'">
          <div class="p-3">
            <div class="mb-2 rounded-md bg-error/50 px-2 py-1.5 text-xs text-error-content">
              {{ t('agentPanel.blockEditReviewSurface.deleteWarning') }}
            </div>
            <div class="mb-1.5 text-xs font-medium text-base-content">{{ t('agentPanel.blockEditReviewSurface.originalToDelete') }}</div>
            <div class="rounded-md border border-error-content/15 bg-error/50 p-2 text-error-content">
              <MarkdownContentView :content="current.oldContent || t('agentPanel.blockEditReviewSurface.emptyContent')" mode="markdown" />
            </div>
          </div>
        </template>

        <template v-else-if="current.type === 'insert'">
          <div class="p-3">
            <div class="mb-2 text-xs font-medium text-base-content">{{ t('agentPanel.blockEditReviewSurface.insertSuggestion') }}</div>
            <div
              class="min-h-32 max-h-88 rounded-field border"
              :class="isInsertEditing
                ? 'border-success-content/15 bg-success/50 text-success-content ring-2 ring-success-content/15'
                : 'border-base-300 text-base-content cursor-text'"
              @click="activateInsertEditing"
            >
              <textarea
                v-if="isInsertEditing"
                ref="insertEditorRef"
                v-model="editedContent"
                class="w-full min-h-32 max-h-88 h-full overflow-y-auto resize-none border-0 bg-transparent px-2 py-1.5 font-mono text-xs leading-relaxed text-current outline-none"
                :placeholder="t('agentPanel.blockEditReviewSurface.insertPlaceholder')"
                @blur="deactivateInsertEditing"
                @input="onEditorInput"
              />
              <pre
                v-else
                class="min-h-32 max-h-88 overflow-y-auto whitespace-pre-wrap warp-break-words px-1 py-1 font-mono text-xs leading-relaxed text-current"
              >{{ editedContent }}</pre>
            </div>
          </div>
        </template>

        <template v-else-if="current.type === 'edit' || current.type === 'replace_range'">
          <DiffSplitView
            :old-content="current.oldContent || ''"
            :new-content="current.newContent || ''"
            editable-right
            v-model="editedContent"
          />
        </template>
      </div>
    </template>

    <template #footer-extra>
      <button
        type="button"
        class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-base-300 bg-base-100 text-2xs text-base-content/70"
        :title="navigatorVm.actionHint"
      >?</button>
    </template>
  </ReviewSurfaceShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BlockEditProposal, EditProposal } from '@/ai/types'
import { buildBlockEditReviewSurfaceViewModel } from '@/ai/review/common/selectors'
import type { ProposalReviewSummary } from '@/ai/store/ai'
import type { Editor } from '@tiptap/core'
import { useAppStore } from '@/stores/app'
import { findNodeById } from '@/ai/document/BlockEditApplier'
import { setRangeHighlights, removeRangeHighlights } from '@/components/common/tiptap/iw-range-highlight'
import { waitForEditorReady } from '@/components/common/tiptap/utils'
import { UNTITLED_PREFIX } from '@/ai/review/common/executor'
import { pathUtils } from '@/utils/pathUtils'
import { notify } from '@/utils/notifications'
import MarkdownContentView from './views/MarkdownContentView.vue'
import DiffSplitView from './views/DiffSplitView.vue'
import ReviewSurfaceShell from './views/ReviewSurfaceShell.vue'

const PROPOSAL_HIGHLIGHT_ID = 'ai-proposal-current-id'
const PROPOSAL_HIGHLIGHT_CLASS = 'range-highlight-proposal'
const { t } = useI18n()

const props = defineProps<{
  proposals: EditProposal[]
  isStreaming?: boolean
  reviewSummary?: ProposalReviewSummary | null
}>()

const emit = defineEmits<{
  approve: [id: string]
  reject: [payload: { id: string; message?: string }]
  editApprove: [payload: { id: string; editedArgs: Record<string, unknown> }]
  approveAll: []
  rejectAll: []
}>()

const currentIndex = ref(0)
const editedContent = ref('')
const isInsertEditing = ref(false)
const insertEditorRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.proposals.length, length => {
  if (currentIndex.value >= length) currentIndex.value = Math.max(0, length - 1)
})

const current = computed(() => props.proposals[currentIndex.value] ?? null)
const currentIsDelete = computed(() => current.value?.kind === 'block' && current.value.type === 'delete')
const hasEditedContent = computed(() =>
  current.value?.kind === 'block'
  && ['edit', 'insert', 'replace_range'].includes(current.value.type)
  && editedContent.value !== (current.value.newContent || '')
)
const navigatorVm = computed(() =>
  buildBlockEditReviewSurfaceViewModel({
    proposals: props.proposals,
    reviewSummary: props.reviewSummary,
    currentIndex: currentIndex.value,
    current: current.value,
    isStreaming: props.isStreaming,
    hasEditedContent: hasEditedContent.value,
  })
)

function syncEditorHeight() {
  const el = insertEditorRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function onEditorInput(_event: Event) {
  syncEditorHeight()
}

function approve() {
  if (!current.value) return
  if (hasEditedContent.value && current.value.kind === 'block') {
    emit('editApprove', {
      id: current.value.id,
      editedArgs: { new_content: editedContent.value },
    })
    return
  }
  emit('approve', current.value.id)
}

function rejectCurrent() {
  if (!current.value) return
  emit('reject', { id: current.value.id, message: t('agentPanel.blockEditReviewSurface.userRejected') })
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

function next() {
  if (currentIndex.value < props.proposals.length - 1) currentIndex.value++
}

/** Whether a proposal can be located at all (independent of where its document currently lives). */
function canLocateProposal(proposal: EditProposal | null | undefined): boolean {
  if (!proposal || proposal.kind !== 'block') return false
  if (proposal.filePath?.startsWith(UNTITLED_PREFIX)) {
    // Unsaved in-memory document: only locatable while its tab still exists.
    const tabId = proposal.filePath.slice(UNTITLED_PREFIX.length)
    return useAppStore().tabs.some(t => t.id === tabId)
  }
  return true
}

const canLocate = computed(() => canLocateProposal(current.value))

/**
 * Resolves the editor instance that holds the proposal's target document.
 * - No filePath -> the active editor.
 * - "untitled:<tabId>" -> the matching unsaved tab.
 * - Real path -> a tab already open for it, otherwise opened from disk (when allowed).
 * When allowDocumentSwitch is false, only returns an editor that is already active —
 * it never switches tabs or opens files (used for passive auto-scroll while paging proposals).
 */
async function resolveTargetEditor(proposal: BlockEditProposal, allowDocumentSwitch: boolean): Promise<Editor | undefined> {
  const appStore = useAppStore()
  const filePath = proposal.filePath

  if (!filePath) {
    return appStore.activeTab?.editorInstance as Editor | undefined
  }

  if (filePath.startsWith(UNTITLED_PREFIX)) {
    const tabId = filePath.slice(UNTITLED_PREFIX.length)
    const tab = appStore.tabs.find(t => t.id === tabId)
    if (!tab) return undefined
    if (tab.id !== appStore.activeTabId) {
      if (!allowDocumentSwitch) return undefined
      appStore.setActiveTab(tab.id)
    }
    return tab.editorInstance as Editor | undefined
  }

  const normalizedTarget = pathUtils.normalize(filePath)
  const isTargetTab = (t: { path?: string | null }) => !!t.path && pathUtils.normalize(t.path) === normalizedTarget
  const matchingTab = appStore.tabs.find(isTargetTab)

  if (matchingTab?.editorInstance) {
    if (matchingTab.id !== appStore.activeTabId) {
      if (!allowDocumentSwitch) return undefined
      appStore.setActiveTab(matchingTab.id)
    }
    return matchingTab.editorInstance as Editor
  }

  if (!allowDocumentSwitch) return undefined

  await appStore.openFile(filePath)
  return (await waitForEditorReady(() => appStore.tabs.find(isTargetTab))) ?? undefined
}

/** Editor that currently carries the proposal highlight, so it can be cleared even after switching documents. */
let highlightedEditor: Editor | undefined

async function scrollToProposal(proposal: EditProposal | null | undefined, allowDocumentSwitch: boolean) {
  if (!proposal || proposal.kind !== 'block') return

  const nodeId =
    proposal.type === 'insert' ? proposal.afterNodeId :
    proposal.type === 'replace_range' ? proposal.startNodeId :
    proposal.nodeId
  if (!nodeId || nodeId === '0') return

  const editor = await resolveTargetEditor(proposal, allowDocumentSwitch)
  if (!editor) {
    if (allowDocumentSwitch) notify.error(t('agentPanel.blockEditReviewSurface.locateFailed'))
    return
  }

  let highlightRange: { from: number; to: number } | null = null
  let scrollTarget = findNodeById(editor.state.doc, nodeId)

  if (proposal.type === 'replace_range' && proposal.startNodeId && proposal.endNodeId) {
    const startFound = findNodeById(editor.state.doc, proposal.startNodeId)
    const endFound = findNodeById(editor.state.doc, proposal.endNodeId)
    if (startFound && endFound) {
      highlightRange = {
        from: Math.min(startFound.from, endFound.from),
        to: Math.max(startFound.to, endFound.to),
      }
      scrollTarget = startFound
    }
  }

  if (!scrollTarget) {
    if (allowDocumentSwitch) notify.error(t('agentPanel.blockEditReviewSurface.locateFailed'))
    return
  }
  if (!highlightRange) highlightRange = { from: scrollTarget.from, to: scrollTarget.to }

  if (highlightedEditor && highlightedEditor !== editor) {
    removeRangeHighlights(highlightedEditor, PROPOSAL_HIGHLIGHT_ID, PROPOSAL_HIGHLIGHT_CLASS)
  }
  highlightedEditor = editor

  setRangeHighlights(editor, [{ id: PROPOSAL_HIGHLIGHT_ID, ...highlightRange }], PROPOSAL_HIGHLIGHT_CLASS)

  const domNode = editor.view.nodeDOM(scrollTarget.from)
  const element = domNode instanceof Element ? domNode : (domNode as Node | null)?.parentElement
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function scrollToCurrentBlock() {
  scrollToProposal(current.value, true)
}

function clearHighlight() {
  if (highlightedEditor) {
    removeRangeHighlights(highlightedEditor, PROPOSAL_HIGHLIGHT_ID, PROPOSAL_HIGHLIGHT_CLASS)
    highlightedEditor = undefined
  }
}

function activateInsertEditing() {
  if (current.value?.kind !== 'block' || current.value.type !== 'insert' || isInsertEditing.value) return
  isInsertEditing.value = true
  nextTick(() => {
    insertEditorRef.value?.focus()
    syncEditorHeight()
  })
}

function deactivateInsertEditing() {
  isInsertEditing.value = false
}

watch(
  current,
  async proposal => {
    isInsertEditing.value = false
    editedContent.value = proposal?.kind === 'block' ? proposal.newContent || '' : ''

    await nextTick()
    scrollToProposal(proposal, false)
  },
  { immediate: true, flush: 'post' }
)

onUnmounted(clearHighlight)
</script>

<style>
.range-highlight-proposal {
  background-color: color-mix(in oklab, var(--color-warning, #fbbf24) 30%, transparent);
  border-radius: var(--radius-box, 0.25rem);
  box-shadow: inset 0 0 0 1px var(--color-warning, #fbbf24);
}
</style>
