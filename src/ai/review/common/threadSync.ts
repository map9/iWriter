import { ref, type ComputedRef } from 'vue'
import type { AiThread, AiToolCall, EditProposal, ThreadMessage } from '@shared/ai/contracts'
import { stableStringify, toolCallSignature, type ToolCallStatusOverrides } from '@/ai/message/display-normalizer'

interface ThreadSyncDeps {
  activeThread: ComputedRef<AiThread | null>
  normalizeMessagesForDisplay: (messages: ThreadMessage[]) => ThreadMessage[]
  updateThread: (thread: AiThread) => void
  findProposal: (proposalId: string) => EditProposal | undefined
}

function proposalToolSignature(proposal: EditProposal): string {
  if (proposal.kind === 'create_file') {
    return `create_document:${stableStringify({
      filename: proposal.filename,
      content: proposal.content,
    })}`
  }
  switch (proposal.type) {
    case 'edit':
      return `edit_block:${stableStringify({
        block_id: proposal.displayBlockId,
        file_path: proposal.filePath,
      })}`
    case 'insert':
      return `insert_block:${stableStringify({
        after_block_id: proposal.displayBlockId ?? 0,
        file_path: proposal.filePath,
      })}`
    case 'delete':
      return `delete_block:${stableStringify({
        block_id: proposal.displayBlockId,
        file_path: proposal.filePath,
      })}`
    case 'replace_range':
      return `replace_range:${stableStringify({
        start_block_id: proposal.startDisplayBlockId,
        end_block_id: proposal.endDisplayBlockId,
        file_path: proposal.filePath,
      })}`
  }
}

function proposalMatchesToolCall(proposal: EditProposal, toolCall: AiToolCall): boolean {
  if (toolCall.id === proposal.toolCallId) return true

  const args = toolCall.arguments
  if (proposal.kind === 'create_file') {
    return toolCall.name === 'create_document'
      && String(args.filename ?? '') === String(proposal.filename ?? '')
  }

  const sameFilePath = String(args.file_path ?? '') === proposal.filePath
  switch (proposal.type) {
    case 'edit':
      return toolCall.name === 'edit_block'
        && String(args.block_id ?? '') === String(proposal.displayBlockId ?? '')
        && sameFilePath
    case 'insert':
      return toolCall.name === 'insert_block'
        && String(args.after_block_id ?? 0) === String(proposal.displayBlockId ?? 0)
        && sameFilePath
    case 'delete':
      return toolCall.name === 'delete_block'
        && String(args.block_id ?? '') === String(proposal.displayBlockId ?? '')
        && sameFilePath
    case 'replace_range':
      return toolCall.name === 'replace_range'
        && String(args.start_block_id ?? '') === String(proposal.startDisplayBlockId ?? '')
        && String(args.end_block_id ?? '') === String(proposal.endDisplayBlockId ?? '')
        && sameFilePath
  }
}

export function createReviewThreadSync(deps: ThreadSyncDeps) {
  const reviewedToolCallStatuses = ref<Record<string, AiToolCall['status']>>({})
  const reviewedEditSignatures = ref<Record<string, AiToolCall['status']>>({})

  function displayOverrides(): ToolCallStatusOverrides {
    return {
      byId: reviewedToolCallStatuses.value,
      bySignature: reviewedEditSignatures.value,
    }
  }

  function updateLocalProposalToolCall(
    proposalOrId: EditProposal | string,
    status: AiToolCall['status'],
  ) {
    const proposal = typeof proposalOrId === 'string'
      ? deps.findProposal(proposalOrId)
      : proposalOrId
    if (!proposal) return

    const proposalSignature = proposalToolSignature(proposal)
    const toolCallId = proposal.toolCallId

    if (toolCallId && reviewedToolCallStatuses.value[toolCallId] !== status) {
      reviewedToolCallStatuses.value = {
        ...reviewedToolCallStatuses.value,
        [toolCallId]: status,
      }
    }
    if (reviewedEditSignatures.value[proposalSignature] !== status) {
      reviewedEditSignatures.value = {
        ...reviewedEditSignatures.value,
        [proposalSignature]: status,
      }
    }

    const thread = deps.activeThread.value
    if (!thread?.messages?.length) return
    const hasSourceMessage = !!proposal.sourceMessageId
      && thread.messages.some(message => message.id === proposal.sourceMessageId)

    const messages = thread.messages.map(message => {
      if (hasSourceMessage && message.id !== proposal.sourceMessageId) return message
      if (!message.toolCalls?.length) return message
      return {
        ...message,
        toolCalls: message.toolCalls.map(tc => {
          const isMatch =
            tc.id === toolCallId
            || toolCallSignature(tc) === proposalSignature
            || proposalMatchesToolCall(proposal, tc)
          return isMatch ? { ...tc, status } : tc
        }),
      }
    })
    deps.updateThread({ ...thread, messages: deps.normalizeMessagesForDisplay(messages) })
  }

  return {
    reviewedToolCallStatuses,
    reviewedEditSignatures,
    displayOverrides,
    updateLocalProposalToolCall,
  }
}
