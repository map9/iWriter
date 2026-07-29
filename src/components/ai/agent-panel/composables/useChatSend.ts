import { watch, nextTick, computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import type { SendContext, ThreadUsage } from '@/ai/types'
import { resolveAgentDomain, resolveAiProviderModelId } from '@/ai/types'
import { pathUtils } from '@/utils/pathUtils'

/** Binary file extensions that are sent as inline multimodal content. */
const BINARY_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
  'pdf',
])

/** Text file extensions that are listed in <attached_files> inside runtime_context. */
const TEXT_EXTS = new Set([
  'md', 'markdown', 'txt', 'iwt',
  'ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'rb', 'go', 'rs', 'java',
  'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'sh', 'bash', 'zsh',
  'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'scss', 'sql',
])

function classifyAttachment(path: string): 'binary' | 'text' | 'directory' {
  const name = pathUtils.basename(path)
  if (!name.includes('.')) return 'directory'
  const ext = pathUtils.extension(path)
  if (BINARY_EXTS.has(ext)) return 'binary'
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'text' // default: treat unknown extensions as text
}

export function useChatSend(contextFiles: Ref<string[]>) {
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
  const compactKeepTokens = ref(0)
  const requestBudgetTokens = ref(0)
  const maxInputTokens = ref<number | null>(null)
  const sessionUsage = computed<ThreadUsage | null>(() => aiStore.activeThread?.usage ?? null)
  const compactProgressRatio = computed(() => {
    if (compactTriggerTokens.value <= 0) return 0
    return Math.max(0, Math.min(1, currentSessionTokens.value / compactTriggerTokens.value))
  })

  async function refreshSessionContextStats() {
    const thread = aiStore.activeThread
    const domain = thread?.domain ?? resolveAgentDomain(aiStore.settings.defaultMode)
    const mode = thread?.mode ?? aiStore.settings.defaultMode
    const provider = aiStore.effectiveProviderConfig
    const providerId = provider?.id
    const modelId = provider ? resolveAiProviderModelId(provider, thread?.modelId) : ''
    if (!providerId || !modelId) {
      showCompact.value = false
      currentSessionTokens.value = 0
      compactTriggerTokens.value = 0
      compactKeepTokens.value = 0
      requestBudgetTokens.value = 0
      maxInputTokens.value = null
      return
    }

    try {
      const result = await window.electronAPI.aiGetSessionContextStats?.({
        threadId: thread?.id,
        domain,
        mode,
        threadRuntime: {
          providerConfigId: providerId,
          modelId,
          thinkingLevel: thread?.thinkingLevel,
        },
      })
      if (!result) return
      showCompact.value = result.visible
      currentSessionTokens.value = result.currentTokens
      compactTriggerTokens.value = result.triggerTokens
      compactKeepTokens.value = result.keepTokens
      requestBudgetTokens.value = result.requestBudgetTokens
      maxInputTokens.value = result.maxInputTokens ?? null
    } catch {
      showCompact.value = false
      currentSessionTokens.value = 0
      compactTriggerTokens.value = 0
      compactKeepTokens.value = 0
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

  async function executeSend() {
    const text = inputText.value.trim()
    if (!text || aiStore.isStreaming) return

    // Classify attached files into text / binary / directory
    const sendContext: SendContext = { textFilePaths: [], binaryFilePaths: [], directories: [] }
    for (const path of contextFiles.value) {
      const kind = classifyAttachment(path)
      if (kind === 'binary') sendContext.binaryFilePaths.push(path)
      else if (kind === 'text') sendContext.textFilePaths.push(path)
      else sendContext.directories.push(path)
    }

    const hasContext = sendContext.textFilePaths.length > 0
                    || sendContext.binaryFilePaths.length > 0
                    || sendContext.directories.length > 0

    const started = await aiStore.sendMessage(text, hasContext ? sendContext : undefined)
    if (started) {
      inputText.value = ''
      contextFiles.value.splice(0)
      nextTick(() => {
        if (inputEl.value) inputEl.value.style.height = 'auto'
      })
    }
  }

  async function sendMessage() {
    const text = inputText.value.trim()
    if (!text || aiStore.isStreaming) return
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
    ],
    () => { void refreshSessionContextStats() },
    { immediate: true }
  )

  return {
    inputText,
    inputEl,
    pendingSend,
    showCompact,
    currentSessionTokens,
    compactTriggerTokens,
    compactKeepTokens,
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
