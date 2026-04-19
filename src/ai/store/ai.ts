import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type {
  AiThread,
  AiProviderConfig,
  AiSettings,
  AiAgentDomain,
  AiAgentMode,
  ThreadMessage,
  SendContext,
} from '@/ai/types'
import {
  inferToolKind,
  DEFAULT_AI_SETTINGS,
  normalizeAgentMode,
  normalizeModeForDomain,
  resolveAgentDomain,
} from '@/ai/types'
import { PROVIDER_PRESETS, type ProviderPreset } from '@/ai/providers/provider-presets'
import { createThread, appendMessage, createMessage } from '@/ai/thread/Thread'
import {
  normalizeThreadMessageForDisplay,
  normalizeThreadMessagesForDisplay,
} from '@/ai/message/display-normalizer'
import { buildSnapshot, buildEditorStateBlock } from '@/ai/thread/ContextBuilder'
import { useAppStore } from '@/stores/app'
import type { Editor } from '@tiptap/core'
import { notify } from '@/utils/notifications'
import { nanoid } from 'nanoid'
import {
  createEditReviewModule,
} from './modules/editReview'
import {
  createRuntimeState,
} from './modules/runtimeState'
import { createRuntimeDisplay } from './modules/runtimeDisplay'
import { createRuntimeEvents } from './modules/runtimeEvents'

export type { ProposalReviewEntry, ProposalReviewSummary } from './modules/editReview'

export interface AiDisplayMessageEntry {
  key: string
  message: ThreadMessage
  isPreview?: boolean
}

export interface AiDisplayThread {
  persistedMessages: ThreadMessage[]
  messages: AiDisplayMessageEntry[]
}

// ── Settings localStorage helpers ──────────────────────────────────────────
const _STORAGE_KEY_SETTINGS = 'iwriter-ai-settings'
function _loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(_STORAGE_KEY_SETTINGS)
    if (!raw) return { ...DEFAULT_AI_SETTINGS }
    const merged = { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) } as AiSettings
    merged.defaultMode = normalizeAgentMode(merged.defaultMode)
    merged.providerConfigs = (merged.providerConfigs ?? []).map(cfg => {
      const preset = PROVIDER_PRESETS.find(p => p.id === cfg.presetId)
      return {
        ...cfg,
        modelProfiles: cfg.modelProfiles ?? preset?.modelProfiles,
      }
    })
    return merged
  } catch {
    return { ...DEFAULT_AI_SETTINGS }
  }
}
function _saveSettingsToStorage(s: AiSettings): void {
  try {
    localStorage.setItem(_STORAGE_KEY_SETTINGS, JSON.stringify(s))
  } catch (err) {
    console.error('[ai store] Failed to save settings:', err)
  }
}

export const useAiStore = defineStore('ai', () => {
  const appStore = useAppStore()

  const isSwitchingThread = ref(false)
  const switchingThreadId = ref<string | null>(null)
  const draftInput = ref('')

  // ── Settings & Provider Config ────────────────────────────────────────────
  const _initialSettings = _loadSettings()
  // Seed all presets on first run
  if (_initialSettings.providerConfigs.length === 0) {
    _initialSettings.providerConfigs = PROVIDER_PRESETS
      .map((p: ProviderPreset) => ({
        id: `preset-${p.id}`,
        enabled: true,
        type: p.type,
        label: p.label,
        apiKey: '',
        baseUrl: p.baseUrl,
        defaultModelId: p.defaultModelId,
        presetId: p.id,
        models: p.models,
        modelProfiles: p.modelProfiles,
      }))
    _initialSettings.activeProviderConfigId = _initialSettings.providerConfigs[0]?.id ?? null
    _saveSettingsToStorage(_initialSettings)
  }

  const settings = ref<AiSettings>(_initialSettings)

  const activeProviderConfig = computed<AiProviderConfig | null>(() => {
    const configs = settings.value.providerConfigs
    if (!configs.length) return null
    if (!settings.value.activeProviderConfigId) return configs[0] ?? null
    return configs.find(c => c.id === settings.value.activeProviderConfigId) ?? configs[0] ?? null
  })

  const effectiveProviderConfig = computed<AiProviderConfig | null>(() => {
    const threadProviderId = activeThread.value?.providerConfigId
    if (threadProviderId) {
      return settings.value.providerConfigs.find(c => c.id === threadProviderId) ?? activeProviderConfig.value
    }
    return activeProviderConfig.value
  })

  /** Models available for the current provider (for model picker) */
  const availableModels = computed<string[]>(() => {
    const config = effectiveProviderConfig.value
    if (!config) return []
    if (config.models?.length) return config.models
    const preset = PROVIDER_PRESETS.find(p => p.id === config.presetId)
    const presetModels = preset?.models ?? []
    return presetModels.length ? presetModels : [config.defaultModelId].filter(Boolean)
  })

  function saveSettings() {
    _saveSettingsToStorage(settings.value)
    // Keep main-process AgentEngine in sync whenever settings change
    window.electronAPI?.aiUpdateConfig?.(JSON.parse(JSON.stringify(toRaw(settings.value))))
  }

  function addProviderConfig(config: AiProviderConfig) {
    settings.value.providerConfigs.push(config)
    if (!settings.value.activeProviderConfigId) {
      settings.value.activeProviderConfigId = config.id
    }
    saveSettings()
  }

  function updateProviderConfig(id: string, updates: Partial<AiProviderConfig>) {
    const idx = settings.value.providerConfigs.findIndex(c => c.id === id)
    if (idx >= 0) {
      settings.value.providerConfigs[idx] = {
        ...settings.value.providerConfigs[idx]!,
        ...updates,
      }
      saveSettings()
    }
  }

  function removeProviderConfig(id: string) {
    settings.value.providerConfigs = settings.value.providerConfigs.filter(c => c.id !== id)
    if (settings.value.activeProviderConfigId === id) {
      settings.value.activeProviderConfigId = settings.value.providerConfigs[0]?.id ?? null
    }
    saveSettings()
  }

  function setActiveProvider(id: string) {
    settings.value.activeProviderConfigId = id
    saveSettings()
    const nextProvider = settings.value.providerConfigs.find(c => c.id === id) ?? null
    const thread = activeThread.value
    if (thread) {
      updateThread({
        ...thread,
        providerConfigId: id,
        modelId: nextProvider?.lastSelectedModelId || nextProvider?.defaultModelId || thread.modelId,
        thinkMode: undefined,
      })
    }
  }

  /** Persist selected model to provider config */
  function setCurrentModelId(modelId: string) {
    const config = effectiveProviderConfig.value
    if (config) {
      updateProviderConfig(config.id, { defaultModelId: modelId })
    }
    if (activeThread.value) {
      updateThread({ ...activeThread.value, modelId })
    }
  }

  /** Persist selected think mode to provider config and current thread */
  function setCurrentThinkMode(mode: string) {
    const config = effectiveProviderConfig.value
    if (config) {
      updateProviderConfig(config.id, { lastSelectedMode: mode })
    }
    if (activeThread.value) {
      updateThread({ ...activeThread.value, thinkMode: mode })
    }
  }

  function setCurrentMode(mode: AiAgentMode) {
    const domain = resolveAgentDomain(mode)
    const normalizedMode = normalizeModeForDomain(mode, domain)
    if (activeThread.value) {
      updateThread({ ...activeThread.value, domain, mode: normalizedMode })
      return
    }
    settings.value.defaultMode = normalizedMode
    saveSettings()
  }

  // ── Threads ───────────────────────────────────────────────────────────────
  const threads = ref<AiThread[]>([])
  const activeThreadId = ref<string | null>(null)

  const activeThread = computed<AiThread | null>(() => {
    return threads.value.find(t => t.id === activeThreadId.value) ?? null
  })

  /**
   * Track threads that were created locally (via createNewThread) but have never
   * had a message sent to the backend. These are safe to discard.
   */
  const _localOnlyThreadIds = new Set<string>()

  /** Remove threads that were created locally but never used (no message sent). */
  function _purgeEmptyThreads() {
    const toRemove = threads.value.filter(t => _localOnlyThreadIds.has(t.id))
    if (!toRemove.length) return
    for (const t of toRemove) {
      _localOnlyThreadIds.delete(t.id)
      window.electronAPI.aiDeleteThread?.(t.id)
    }
    threads.value = threads.value.filter(t => !toRemove.some(r => r.id === t.id))
    if (!threads.value.find(t => t.id === activeThreadId.value)) {
      activeThreadId.value = threads.value[0]?.id ?? null
    }
  }

  function createNewThread(): AiThread {
    _purgeEmptyThreads()
    const config = activeProviderConfig.value
    const thread = createThread(
      config?.id ?? '',
      config?.defaultModelId ?? '',
      settings.value.defaultMode
    )
    threads.value.unshift(thread)
    activeThreadId.value = thread.id
    _localOnlyThreadIds.add(thread.id)
    return thread
  }

  async function selectThread(id: string): Promise<boolean> {
    // Clean up any local-only empty threads before switching
    if (activeThreadId.value !== id) {
      _purgeEmptyThreads()
    }
    const thread = threads.value.find(t => t.id === id)
    if (!thread) return false

    const previousActiveThreadId = activeThreadId.value

    if (thread.messagesLoaded) {
      activeThreadId.value = id
      isSwitchingThread.value = false
      switchingThreadId.value = null
      return true
    }

    isSwitchingThread.value = true
    switchingThreadId.value = id

    try {
      const messages = await window.electronAPI.aiGetThreadMessages?.(id)
      const normalizedThread: AiThread = {
        ...thread,
        messages: messages?.length ? _normalizeMessagesForDisplay(messages) : (messages ?? []),
        messagesLoaded: true,
      }
      updateThread(normalizedThread)
      activeThreadId.value = id
      return true
    } catch (error) {
      activeThreadId.value = previousActiveThreadId
      notify.error(`载入会话失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    } finally {
      if (switchingThreadId.value === id) {
        isSwitchingThread.value = false
        switchingThreadId.value = null
      }
    }
  }

  function setDraftInput(value: string) {
    draftInput.value = value
  }

  function deleteThread(id: string) {
    threads.value = threads.value.filter(t => t.id !== id)
    window.electronAPI.aiDeleteThread?.(id)
    if (activeThreadId.value === id) {
      activeThreadId.value = threads.value[0]?.id ?? null
    }
  }

  function clearAllThreads() {
    threads.value = []
    activeThreadId.value = null
    window.electronAPI.aiClearThreads?.()
  }

  function updateThread(thread: AiThread) {
    const domain: AiAgentDomain = thread.domain ?? resolveAgentDomain(thread.mode)
    const normalizedThread: AiThread = {
      ...thread,
      domain,
      mode: normalizeModeForDomain(thread.mode, domain),
    }
    const idx = threads.value.findIndex(t => t.id === thread.id)
    if (idx >= 0) {
      threads.value[idx] = normalizedThread
    }
  }

  function truncateActiveThreadBeforeMessage(messageId: string): boolean {
    const thread = activeThread.value
    if (!thread) return false

    const idx = persistedMessages.value.findIndex(message => message.id === messageId)
    if (idx < 0) return false

    updateThread({ ...thread, messages: persistedMessages.value.slice(0, idx) })
    return true
  }

  const runtimeState = createRuntimeState()
  const {
    threadRunState: _threadRunState,
    liveTurn: _liveTurn,
    currentThreadId: _currentThreadId,
    currentTurnId: _currentTurnId,
    interruptedThreadId: _interruptedThreadId,
    interruptedTurnId: _interruptedTurnId,
    isStreaming,
    isInterrupted,
    streamingText,
    streamingCurrentText,
    streamingBlocks,
    streamingThinkingText,
    streamingToolName,
    pendingEditProposals,
    liveTurnState,
    liveTurnThreadId,
    liveTurnTurnId,
    liveTurnStartedAt,
    startLiveTurn: _startLiveTurn,
    ensureLiveTurn: _ensureLiveTurn,
    clearLiveTurn: _clearLiveTurn,
    clearRunPointers: _clearRunPointers,
  } = runtimeState

  const _normalizeMessagesForDisplay = (messages: ThreadMessage[]): ThreadMessage[] =>
    normalizeThreadMessagesForDisplay(messages, editReview.displayOverrides())

  const _normalizeMessageForDisplay = (message: ThreadMessage): ThreadMessage =>
    normalizeThreadMessageForDisplay(message, editReview.displayOverrides())

  const editReview = createEditReviewModule({
    appStore,
    activeThread,
    pendingEditProposals,
    interruptedThreadId: _interruptedThreadId,
    interruptedTurnId: _interruptedTurnId,
    threadRunState: _threadRunState,
    currentThreadId: _currentThreadId,
    currentTurnId: _currentTurnId,
    liveTurnRef: _liveTurn,
    ensureLiveTurn: _ensureLiveTurn,
    normalizeMessagesForDisplay: _normalizeMessagesForDisplay,
    updateThread,
  })

  // ── Send Message ──────────────────────────────────────────────────────────
  async function sendMessage(userText: string, sendContext?: SendContext): Promise<boolean> {
    // Block new messages while actively streaming
    if (_threadRunState.value === 'streaming') return false

    if (!activeProviderConfig.value) {
      notify.error('请先配置 AI Provider（API Key 等）')
      return false
    }

    // Auto-reject any proposals still waiting for user approval
    _rejectAllPendingProposals()

    // Ensure there is an active thread
    let thread = activeThread.value
    if (!thread) {
      thread = createNewThread()
    }

    // Append user message locally for immediate display; clear any previous error flag.
    // Note: the authoritative message store is the checkpointer. This local append
    // is overwritten when messages are reloaded from checkpointer after RunDone.
    const userMsg = createMessage('user', userText)
    thread = appendMessage(thread, userMsg)
    if (thread.hasError) thread = { ...thread, hasError: false }
    // messagesLoaded = false so the next selectThread re-fetches from checkpointer
    thread = { ...thread, messagesLoaded: false }
    updateThread(thread)
    // Mark as no longer local-only once a message is being sent
    _localOnlyThreadIds.delete(thread.id)

    // Get context from active editor
    const activeTab = appStore.activeTab
    const currentFilePath = activeTab?.path ?? null

    // Record origin file on first message
    if (thread.originFilePath === undefined) {
      thread = { ...thread, originFilePath: currentFilePath }
      updateThread(thread)
    }

    // Collect open tabs (exclude active one)
    const openTabs = appStore.tabs
      .filter(t => t.id !== activeTab?.id)
      .map(t => ({ path: t.path ?? undefined, name: t.name, isDirty: t.isDirty ?? false }))

    // Build rich <editor_state> XML at send time using the active editor snapshot
    const activeEditor = activeTab?.editorInstance as Editor | null ?? null
    const snapshot = thread.domain === 'editing' && activeEditor
      ? buildSnapshot(activeEditor, undefined, currentFilePath ?? undefined)
      : null

    const editorStateResult = thread.domain === 'editing'
      ? buildEditorStateBlock(thread, snapshot, {
        filePath: currentFilePath,
        isDirty: activeTab?.isDirty ?? false,
        folderPath: appStore.currentFolder ?? null,
        openTabs,
        textFilePaths: sendContext?.textFilePaths ?? [],
        attachedDirectories: sendContext?.directories ?? [],
      })
      : { xml: null, threadUpdate: {} as Partial<AiThread> }

    // Persist delta tracking fields back to the thread
    if (Object.keys(editorStateResult.threadUpdate).length > 0) {
      thread = { ...thread, ...editorStateResult.threadUpdate }
      updateThread(thread)
    }

    // Start streaming state
    runtimeEvents.resetRunErrorFlag()
    _threadRunState.value = 'streaming'
    const turnId = `turn-${nanoid(8)}`
    _currentTurnId.value = turnId
    _startLiveTurn({
      threadId: thread.id,
      turnId,
      state: 'streaming',
    })

    try {
      const result = await window.electronAPI.aiSendMessage?.({
        threadId: thread.id,
        turnId,
        userText,
        domain: thread.domain,
        mode: thread.mode,
        threadRuntime: {
          providerConfigId: thread.providerConfigId || activeProviderConfig.value?.id,
          modelId: thread.modelId || activeProviderConfig.value?.defaultModelId,
          thinkMode: thread.thinkMode,
        },
        editorContext: {
          filePath: currentFilePath,
          isDirty: activeTab?.isDirty ?? false,
          folderPath: appStore.currentFolder ?? null,
          openTabs,
          cursorBlockId: snapshot?.cursorBlockId ?? undefined,
          editorStateXml: editorStateResult.xml ?? null,
        },
        attachments: {
          textFilePaths: sendContext?.textFilePaths ?? [],
          binaryFilePaths: sendContext?.binaryFilePaths ?? [],
          directories: sendContext?.directories ?? [],
        },
      })

      if (result) {
        _currentThreadId.value = result.threadId
      }
    } catch (err) {
      _threadRunState.value = 'idle'
      _clearRunPointers()
      _clearLiveTurn()
      const msg = err instanceof Error ? err.message : String(err)
      notify.error(`AI 错误: ${msg}`)
      let errThread = activeThread.value
      if (errThread) {
        const errMsg: ThreadMessage = {
          id: `msg-${nanoid(8)}`,
          role: 'assistant',
          turnId,
          content: msg,
          isError: true,
          timestamp: Date.now(),
        }
        errThread = appendMessage({ ...errThread, hasError: true }, errMsg)
        updateThread(errThread)
      }
    }

    return true
  }

  const {
    interruptActionCount: _interruptActionCount,
    isResumingReviewedEdits,
    reviewedToolCallStatuses,
    reviewedEditSignatures,
    reviewedBatchEntries,
    reviewBatchSummary,
    handleInterrupt: _handleEditInterrupt,
    resetReviewState: _resetEditReviewState,
    rejectAllPendingProposals: _rejectAllPendingProposals,
    approveEditProposal,
    editAndApproveProposal,
    rejectEditProposal,
    requestProposalRework,
    approveAllProposals,
    rejectAllProposals,
    endReviewRound,
  } = editReview

  const runtimeEvents = createRuntimeEvents({
    activeThread,
    threadRunState: _threadRunState,
    liveTurn: _liveTurn,
    currentThreadId: _currentThreadId,
    currentTurnId: _currentTurnId,
    clearRunPointers: _clearRunPointers,
    startLiveTurn: _startLiveTurn,
    ensureLiveTurn: _ensureLiveTurn,
    clearLiveTurn: _clearLiveTurn,
    handleEditInterrupt: _handleEditInterrupt,
    resetEditReviewState: _resetEditReviewState,
    inferToolKind,
    normalizeMessagesForDisplay: _normalizeMessagesForDisplay,
    normalizeMessageForDisplay: _normalizeMessageForDisplay,
    appendMessage,
    updateThread,
    notifyError: notify.error,
    makeErrorMessage: ({ turnId, content }) => ({
      id: `msg-${nanoid(8)}`,
      role: 'assistant',
      turnId: turnId ?? undefined,
      content,
      isError: true,
      timestamp: Date.now(),
    }),
  })

  const persistedMessages = computed<ThreadMessage[]>(() => activeThread.value?.messages ?? [])
  const runtimeDisplay = createRuntimeDisplay({
    liveTurn: _liveTurn,
    threadRunState: _threadRunState,
    persistedMessages,
    isResumingReviewedEdits,
    normalizeMessageForDisplay: _normalizeMessageForDisplay,
  })
  const {
    streamingPreviewMessage,
    displayThread,
    displayMessages,
    persistedAssistantMessageIds,
    latestPersistedAssistantMessageId,
  } = runtimeDisplay

  function cancelStreaming() {
    const tid = _currentThreadId.value ?? _interruptedThreadId.value
    if (tid) {
      window.electronAPI.aiCancel?.(tid)
    }
    _threadRunState.value = 'idle'
    _clearRunPointers()
    _resetEditReviewState()
    _clearLiveTurn()
    notify.info('已停止生成')
  }

  // ── Initialization ────────────────────────────────────────────────────────
  function init() {
    settings.value = _loadSettings()
    // Push current settings to main process on init (handles first-launch and
    // cases where renderer localStorage has newer values than the main-process store)
    window.electronAPI?.aiUpdateConfig?.(JSON.parse(JSON.stringify(toRaw(settings.value))))

    window.electronAPI.aiGetThreads?.().then(async mainThreads => {
      if (mainThreads?.length) {
        // Merge: preserve any local-only threads not yet in the backend list
        const localOnly = threads.value.filter(t => _localOnlyThreadIds.has(t.id))
        const merged = [
          ...localOnly,
          ...mainThreads.filter(m => !localOnly.some(l => l.id === m.id)),
        ]
        threads.value = merged
        // Keep active thread if still valid, otherwise default to first backend thread
        if (!activeThreadId.value || !merged.some(t => t.id === activeThreadId.value)) {
          const firstId = mainThreads[0]!.id
          activeThreadId.value = firstId
          try {
            const messages = await window.electronAPI.aiGetThreadMessages?.(firstId)
            if (messages?.length) {
              updateThread({ ...mainThreads[0]!, messages: _normalizeMessagesForDisplay(messages), messagesLoaded: true })
            }
          } catch { /* ignore */ }
        }
      }
    }).catch(() => {/* ignore — main process may not be ready yet */})

    window.electronAPI.onAiStreamChunk?.(runtimeEvents.onStreamChunk)
    window.electronAPI.onAiRunInterrupted?.(runtimeEvents.onRunInterrupted)
    window.electronAPI.onAiRunDone?.(runtimeEvents.onRunDone)
    window.electronAPI.onAiRunError?.(runtimeEvents.onRunError)
  }

  function teardown() {
    window.electronAPI.removeAiListeners?.()
  }

  return {
    // Settings
    settings,
    activeProviderConfig,
    effectiveProviderConfig,
    availableModels,
    addProviderConfig,
    updateProviderConfig,
    removeProviderConfig,
    setActiveProvider,
    setCurrentModelId,
    setCurrentThinkMode,
    setCurrentMode,
    saveSettings,

    // Threads
    threads,
    activeThreadId,
    activeThread,
    createNewThread,
    selectThread,
    deleteThread,
    clearAllThreads,
    updateThread,
    truncateActiveThreadBeforeMessage,

    // Run state
    isStreaming,
    isInterrupted,
    isSwitchingThread,
    switchingThreadId,
    interruptedTurnId: computed(() => _interruptedTurnId.value),
    liveTurnState,
    liveTurnThreadId,
    liveTurnTurnId,
    liveTurnStartedAt,

    // Streaming display state
    streamingText,
    streamingCurrentText,
    streamingBlocks,
    streamingThinkingText,
    streamingToolName,
    streamingPreviewMessage,
    persistedMessages,
    displayThread,
    displayMessages,
    persistedAssistantMessageIds,
    latestPersistedAssistantMessageId,
    pendingEditProposals,
    isResumingReviewedEdits,
    reviewedToolCallStatuses,
    reviewedEditSignatures,
    reviewedBatchEntries,
    reviewBatchSummary,
    draftInput,

    // Actions
    sendMessage,
    approveEditProposal,
    editAndApproveProposal,
    rejectEditProposal,
    requestProposalRework,
    approveAllProposals,
    rejectAllProposals,
    endReviewRound,
    cancelStreaming,
    setDraftInput,
    init,
    teardown,
  }
})
