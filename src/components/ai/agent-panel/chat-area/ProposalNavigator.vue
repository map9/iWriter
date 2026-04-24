<template>
  <div class="overflow-hidden rounded-box border bg-base-100" :class="containerClass">
    <div
      v-if="navigatorVm.isBatchReview"
      class="space-y-2 border-b border-warning/30 bg-warning/10 px-3 py-2.5"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-sm font-semibold text-warning-content">{{ t('agentPanel.proposalNavigator.reviewTitle') }}</div>
            <button
              type="button"
              class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-base-300 bg-base-100 text-2xs text-base-content/70"
              :title="navigatorVm.batchHint"
            >?</button>
          </div>
          <div class="mt-1 text-xs text-warning-content">{{ navigatorVm.batchSummaryLine }}</div>
        </div>
        <div class="flex shrink-0 flex-wrap gap-1.5">
          <button
            class="iw-btn btn-xs btn-warning"
            @click="handlePrimaryBatchAction"
          >{{ navigatorVm.primaryBatchActionLabel }}</button>
          <button
            class="iw-btn btn-xs btn-ghost"
            :title="t('agentPanel.proposalNavigator.endRoundHint')"
            @click="$emit('endRound')"
          >{{ t('agentPanel.proposalNavigator.endRound') }}</button>
        </div>
      </div>
    </div>

    <section v-if="current" class="min-w-0 bg-base-100">
      <div class="border-b border-base-300 px-3 py-2.5" :class="tonePanelClass">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <div class="text-xs font-medium" :class="toneTitleClass">{{ navigatorVm.currentTitle }}</div>
              <span
                v-if="currentIsDelete"
                class="inline-flex items-center rounded-full bg-error/20 px-1.5 py-0.5 text-2xs font-medium text-error-content"
              >
                高风险
              </span>
            </div>
            <div class="mt-1 truncate text-sm font-medium text-base-content" :title="navigatorVm.currentLabel">
              {{ navigatorVm.currentLabel }}
            </div>
          </div>
          <button
            class="iw-btn btn-xs"
            :title="t('agentPanel.proposalNavigator.locateHint')"
            @click="scrollToCurrentBlock"
          >{{ t('agentPanel.proposalNavigator.locate') }}</button>
        </div>
        <div v-if="current.description" class="mt-2 text-xs" :class="toneDescriptionClass">
          {{ current.description }}
        </div>
      </div>

      <div class="min-h-52">
        <template v-if="current.kind === 'create_file'">
          <div class="border-b border-base-300 px-3 py-2 text-xs font-medium text-base-content">
            {{ t('agentPanel.proposalNavigator.newFilePreview') }}
          </div>
          <div class="p-3">
            <div class="mb-2 text-xs text-base-content/70">{{ t('agentPanel.proposalNavigator.fileName', { name: current.filename }) }}</div>
            <div class="rounded-md border p-2" :class="tonePanelClass">
              <MarkdownContentView :content="current.content" />
            </div>
          </div>
        </template>

        <template v-else-if="current.type === 'delete'">
          <div class="p-3">
            <div class="mb-2 rounded-md bg-error/15 px-2 py-1.5 text-xs text-error-content">
              {{ t('agentPanel.proposalNavigator.deleteWarning') }}
            </div>
            <div class="mb-1.5 text-xs font-medium text-base-content">{{ t('agentPanel.proposalNavigator.originalToDelete') }}</div>
            <div class="rounded-md border border-error/30 bg-error/10 p-2">
              <MarkdownContentView :content="current.oldContent || t('agentPanel.proposalNavigator.emptyContent')" mode="markdown" />
            </div>
          </div>
        </template>

        <template v-else-if="current.type === 'insert'">
          <div class="p-3">
            <div class="mb-2 text-xs font-medium text-base-content">{{ t('agentPanel.proposalNavigator.insertSuggestion') }}</div>
            <div
            class="min-h-32 max-h-88 rounded-field border"
              :class="[tonePanelClass, isInsertEditing ? toneRingClass : 'cursor-text']"
              @click="activateInsertEditing"
            >
              <textarea
                v-if="isInsertEditing"
                ref="insertEditorRef"
                v-model="editedContent"
                class="w-full min-h-32 max-h-88 h-full overflow-y-auto resize-none border-0 bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-base-content outline-none"
                :placeholder="t('agentPanel.proposalNavigator.insertPlaceholder')"
                @blur="deactivateInsertEditing"
                @input="onEditorInput"
              />
              <pre
                v-else
                class="min-h-32 max-h-88 overflow-y-auto whitespace-pre-wrap warp-break-words px-1 py-1 font-mono text-xs leading-relaxed text-base-content"
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

      <div class="border-t border-base-300 px-3 py-2.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <button class="iw-btn btn-xs" :class="currentIsDelete ? 'btn-error' : 'btn-warning'" @click="approve">
            {{ navigatorVm.approveButtonLabel }}
          </button>
          <button class="iw-btn btn-xs btn-ghost" @click="skipCurrent">{{ navigatorVm.skipButtonLabel }}</button>
          <button class="iw-btn btn-xs btn-warning" @click="openReworkComposer">{{ navigatorVm.reworkButtonLabel }}</button>
          <button
            type="button"
            class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-base-300 bg-base-100 text-2xs text-base-content/70"
            :title="navigatorVm.actionHint"
          >?</button>
          <button
            v-if="navigatorVm.isBatchReview"
            class="iw-btn btn-xs btn-ghost"
            :disabled="currentIndex === 0"
            @click="prev"
          >←</button>
          <button
            v-if="navigatorVm.isBatchReview"
            class="iw-btn btn-xs btn-ghost"
            :disabled="currentIndex >= proposals.length - 1"
            @click="next"
          >→</button>
        </div>

        <div v-if="showReworkComposer" class="mt-3 rounded-md border p-3" :class="tonePanelClass">
          <div class="text-xs font-medium" :class="toneTitleClass">{{ t('agentPanel.proposalNavigator.reworkTitle') }}</div>
          <div class="mt-1 text-xs" :class="toneDescriptionClass">
            {{ t('agentPanel.proposalNavigator.reworkHint') }}
          </div>
          <textarea
            v-model="reworkReason"
            rows="3"
            class="mt-2 w-full resize-none rounded-field border border-base-300 bg-base-100 px-2 py-1 text-sm outline-none focus:border-primary"
            :placeholder="t('agentPanel.proposalNavigator.reworkPlaceholder')"
          />
          <div class="mt-2 flex gap-1.5">
            <button
              class="iw-btn btn-xs btn-warning"
              :disabled="!reworkReason.trim()"
              @click="submitRework"
            >{{ t('agentPanel.proposalNavigator.submitFeedback') }}</button>
            <button class="iw-btn btn-xs btn-ghost" @click="cancelReworkComposer">{{ t('agentPanel.common.cancel') }}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditProposal } from '@/ai/types'
import { buildProposalNavigatorViewModel } from '@/ai/review/selectors'
import type { ProposalReviewSummary } from '@/ai/store/ai'
import type { Editor } from '@tiptap/core'
import { useAppStore } from '@/stores/app'
import { findNodeById } from '@/ai/edit-agent/BlockEditApplier'
import { setRangeHighlights, removeRangeHighlights } from '@/components/common/tiptap/iw-range-highlight'
import MarkdownContentView from './views/MarkdownContentView.vue'
import DiffSplitView from './views/DiffSplitView.vue'

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
  skipRemaining: []
  rework: [payload: { id: string; reason: string }]
  endRound: [payload?: { id?: string }]
}>()

const currentIndex = ref(0)
const editedContent = ref('')
const isInsertEditing = ref(false)
const insertEditorRef = ref<HTMLTextAreaElement | null>(null)
const showReworkComposer = ref(false)
const reworkReason = ref('')

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
  buildProposalNavigatorViewModel({
    proposals: props.proposals,
    reviewSummary: props.reviewSummary,
    currentIndex: currentIndex.value,
    current: current.value,
    isStreaming: props.isStreaming,
    hasEditedContent: hasEditedContent.value,
  })
)

const containerClass = computed(() =>
  !navigatorVm.value.isBatchReview && currentIsDelete.value ? 'border-error/30' : 'border-warning/30'
)
const tonePanelClass = computed(() => currentIsDelete.value ? 'border-error/30 bg-error/10' : 'border-warning/30 bg-warning/10')
const toneTitleClass = computed(() => currentIsDelete.value ? 'text-error-content' : 'text-warning-content')
const toneDescriptionClass = computed(() => currentIsDelete.value ? 'text-error-content/80' : 'text-base-content/70')
const toneRingClass = computed(() => currentIsDelete.value ? 'ring-2 ring-error/30' : 'ring-2 ring-warning/30')

function syncEditorHeight() {
  const el = insertEditorRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function onEditorInput(event: Event) {
  syncEditorHeight()
}

function handlePrimaryBatchAction() {
  if (navigatorVm.value.hasReviewProgress) emit('skipRemaining')
  else emit('approveAll')
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

function skipCurrent() {
  if (!current.value) return
  emit('reject', { id: current.value.id, message: t('agentPanel.proposalNavigator.userSkipped') })
}

function openReworkComposer() {
  showReworkComposer.value = true
}

function cancelReworkComposer() {
  showReworkComposer.value = false
  reworkReason.value = ''
}

function submitRework() {
  if (!current.value || !reworkReason.value.trim()) return
  emit('rework', { id: current.value.id, reason: reworkReason.value.trim() })
  cancelReworkComposer()
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

function next() {
  if (currentIndex.value < props.proposals.length - 1) currentIndex.value++
}

function scrollToProposal(proposal: EditProposal | null | undefined) {
  if (!proposal || proposal.kind !== 'block') return

  const nodeId =
    proposal.type === 'insert' ? proposal.afterNodeId :
    proposal.type === 'replace_range' ? proposal.startNodeId :
    proposal.nodeId
  if (!nodeId || nodeId === '0') return

  const appStore = useAppStore()
  const editor = appStore.activeTab?.editorInstance as Editor | undefined
  if (!editor) return

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

  if (!scrollTarget) return
  if (!highlightRange) highlightRange = { from: scrollTarget.from, to: scrollTarget.to }

  setRangeHighlights(editor, [{ id: PROPOSAL_HIGHLIGHT_ID, ...highlightRange }], PROPOSAL_HIGHLIGHT_CLASS)

  const domNode = editor.view.nodeDOM(scrollTarget.from)
  const element = domNode instanceof Element ? domNode : (domNode as Node | null)?.parentElement
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function scrollToCurrentBlock() {
  scrollToProposal(current.value)
}

function clearHighlight() {
  const appStore = useAppStore()
  const editor = appStore.activeTab?.editorInstance as Editor | undefined
  if (editor) removeRangeHighlights(editor, PROPOSAL_HIGHLIGHT_ID, PROPOSAL_HIGHLIGHT_CLASS)
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
    showReworkComposer.value = false
    reworkReason.value = ''
    editedContent.value = proposal?.kind === 'block' ? proposal.newContent || '' : ''

    await nextTick()
    scrollToProposal(proposal)
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
