import { watch, nextTick, computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useAiStore } from '@/ai/state/aiStore'
import type {
  ContextAttachment,
  SendContext,
  SessionRuntimeContextStats,
  ThreadRuntimeSelection,
  ThreadUsage,
} from '@shared/ai/contracts'
import { resolveAgentDomain, resolveAiProviderModelId } from '@shared/ai/contracts'
import { agentClient } from '@/ai/client/AgentClient'

export function computeCompactProgress(
  currentTokens: number,
  triggerTokens: number,
): { raw: number; visual: number } {
  if (triggerTokens <= 0) return { raw: 0, visual: 0 }
  const raw = Math.max(0, currentTokens / triggerTokens)
  return { raw, visual: Math.min(1, raw) }
}

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
  const activeContextStats = ref<SessionRuntimeContextStats | null>(null)
  const nextContextStats = ref<SessionRuntimeContextStats | null>(null)
  const pendingRuntime = computed<ThreadRuntimeSelection | null>(
    () => aiStore.activeThread?.pendingRuntime ?? null,
  )
  const sessionUsage = computed<ThreadUsage | null>(() => aiStore.activeThread?.usage ?? null)
  const compactProgress = computed(() => computeCompactProgress(
    currentSessionTokens.value,
    compactTriggerTokens.value,
  ))
  const compactProgressRatioRaw = computed(() => compactProgress.value.raw)
  const compactProgressRatioVisual = computed(() => compactProgress.value.visual)
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
      activeContextStats.value = null
      nextContextStats.value = null
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
      const nextStats: SessionRuntimeContextStats = result.nextRuntime ?? {
        modelId,
        currentTokens: result.currentTokens,
        triggerTokens: result.triggerTokens,
        requestBudgetTokens: result.requestBudgetTokens,
        keepTokens: result.keepTokens,
        maxInputTokens: result.maxInputTokens,
      }
      const activeStats = (aiStore.isStreaming || aiStore.isInterrupted)
        ? result.activeRuntime ?? null
        : null
      nextContextStats.value = nextStats
      activeContextStats.value = activeStats
      const primaryStats = activeStats ?? nextStats
      currentSessionTokens.value = primaryStats.currentTokens
      compactTriggerTokens.value = primaryStats.triggerTokens
      requestBudgetTokens.value = primaryStats.requestBudgetTokens
      maxInputTokens.value = primaryStats.maxInputTokens ?? null
    } catch {
      if (requestVersion !== sessionContextStatsRequestVersion) return
      showCompact.value = false
      currentSessionTokens.value = 0
      compactTriggerTokens.value = 0
      requestBudgetTokens.value = 0
      maxInputTokens.value = null
      activeContextStats.value = null
      nextContextStats.value = null
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
      () => aiStore.isInterrupted,
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
      if (activeContextStats.value) {
        activeContextStats.value = {
          ...activeContextStats.value,
          currentTokens: latestInputTokens,
        }
      }
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
    compactProgressRatio: compactProgressRatioRaw,
    compactProgressRatioRaw,
    compactProgressRatioVisual,
    maxInputTokens,
    activeContextStats,
    nextContextStats,
    pendingRuntime,
    sessionUsage,
    handleKeydown,
    executeSend,
    sendMessage,
    cancelPendingSend,
  }
}
