import { watch, nextTick, computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import type { ContextAttachment, SendContext, ThreadUsage } from '@/ai/types'
import { resolveAgentDomain, resolveAiProviderModelId } from '@/ai/types'
import { agentClient } from '@/ai/client/AgentClient'

export function useChatSend(contextFiles: Ref<ContextAttachment[]>) {
  const aiStore = useAiStore()
  const inputText = computed({
    get: () => aiStore.draftInput,
    set: (value: string) => aiStore.setDraftInput(value),
  })
  const inputEl = ref<HTMLTextAreaElement>()
  const pendingSend = ref(false)
  const showCompact = ref(false)
  const currentSessionTokens = ref(0)
  const compactTriggerTokens = ref(0)
  const requestBudgetTokens = ref(0)
  const maxInputTokens = ref<number | null>(null)
  const sessionUsage = computed<ThreadUsage | null>(() => aiStore.activeThread?.usage ?? null)
  const compactProgressRatio = computed(() => {
    if (compactTriggerTokens.value <= 0) return 0
    return Math.max(0, Math.min(1, currentSessionTokens.value / compactTriggerTokens.value))
  })
  let sessionContextStatsRequestVersion = 0

  async function refreshSessionContextStats() {
    const requestVersion = ++sessionContextStatsRequestVersion
    const thread = aiStore.activeThread
    const domain = thread?.domain ?? resolveAgentDomain(aiStore.settings.defaultMode)
    const mode = thread?.mode ?? aiStore.settings.defaultMode
    const provider = aiStore.effectiveProviderConfig
    const providerId = provider?.id
    const modelId = provider ? resolveAiProviderModelId(provider, thread?.modelId) : ''
    if (!providerId || !modelId) {
      if (requestVersion !== sessionContextStatsRequestVersion) return
      showCompact.value = false
      currentSessionTokens.value = 0
      compactTriggerTokens.value = 0
      requestBudgetTokens.value = 0
      maxInputTokens.value = null
      return
    }

    try {
      const result = await agentClient.getSessionContextStats({
        threadId: thread?.id,
        domain,
        mode,
        threadRuntime: {
          providerConfigId: providerId,
          modelId,
          thinkingLevel: thread?.thinkingLevel,
        },
      })
      if (!result || requestVersion !== sessionContextStatsRequestVersion) return
      showCompact.value = result.visible
      currentSessionTokens.value = result.currentTokens
      compactTriggerTokens.value = result.triggerTokens
      requestBudgetTokens.value = result.requestBudgetTokens
      maxInputTokens.value = result.maxInputTokens ?? null
    } catch {
      if (requestVersion !== sessionContextStatsRequestVersion) return
      showCompact.value = false
      currentSessionTokens.value = 0
      compactTriggerTokens.value = 0
      requestBudgetTokens.value = 0
      maxInputTokens.value = null
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function collectSendContext(): SendContext | undefined {
    const sendContext: SendContext = { filePaths: [], directories: [] }
    for (const attachment of contextFiles.value) {
      if (attachment.kind === 'file') sendContext.filePaths.push(attachment.path)
      else sendContext.directories.push(attachment.path)
    }

    const hasContext = sendContext.filePaths.length > 0 || sendContext.directories.length > 0
    return hasContext ? sendContext : undefined
  }

  function clearComposer() {
    inputText.value = ''
    contextFiles.value.splice(0)
    nextTick(() => {
      if (inputEl.value) inputEl.value.style.height = 'auto'
    })
  }

  async function executeSend() {
    const text = inputText.value.trim()
    if (!text || aiStore.isStreaming || aiStore.isInterrupted) return

    const started = await aiStore.sendMessage(text, collectSendContext())
    if (started) {
      clearComposer()
    }
  }

  async function sendMessage() {
    const text = inputText.value.trim()
    if (!text) return
    if (aiStore.isStreaming || aiStore.isInterrupted) {
      const queued = aiStore.queuePendingCommand(text, collectSendContext())
      if (queued) clearComposer()
      return
    }
    await executeSend()
  }

  function cancelPendingSend() {
    pendingSend.value = false
  }

  watch(
    [
      () => aiStore.activeThread?.id ?? '',
      () => aiStore.activeThread?.providerConfigId ?? aiStore.effectiveProviderConfig?.id ?? '',
      () => aiStore.activeThread?.modelId ?? aiStore.effectiveProviderConfig?.defaultModelId ?? '',
      () => aiStore.activeThread?.thinkingLevel ?? '',
      () => aiStore.activeThread?.domain ?? resolveAgentDomain(aiStore.settings.defaultMode),
      () => aiStore.activeThread?.mode ?? aiStore.settings.defaultMode,
      () => aiStore.activeThread?.updatedAt ?? 0,
      () => aiStore.displayMessages.length,
      () => aiStore.isStreaming,
    ],
    () => { void refreshSessionContextStats() },
    { immediate: true }
  )

  watch(
    () => [
      aiStore.activeThread?.id ?? '',
      aiStore.activeThread?.usage?.main.inputTokens ?? 0,
      aiStore.activeThread?.usage?.latestMainInputTokens ?? 0,
    ] as const,
    ([activeThreadId, accumulatedInputTokens, latestInputTokens], previous) => {
      const [previousThreadId, previousAccumulatedInputTokens] = previous
      const isNewUsageEvent = activeThreadId !== previousThreadId
        || accumulatedInputTokens !== previousAccumulatedInputTokens
      if (!isNewUsageEvent) return
      if (!aiStore.isStreaming || activeThreadId !== aiStore.liveTurnThreadId) return
      if (latestInputTokens <= 0) return
      sessionContextStatsRequestVersion += 1
      currentSessionTokens.value = latestInputTokens
    },
  )

  return {
    inputText,
    inputEl,
    pendingSend,
    showCompact,
    currentSessionTokens,
    compactTriggerTokens,
    requestBudgetTokens,
    compactProgressRatio,
    maxInputTokens,
    sessionUsage,
    handleKeydown,
    executeSend,
    sendMessage,
    cancelPendingSend,
  }
}
