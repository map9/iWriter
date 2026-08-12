import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type {
  AiThread,
  AiProviderConfig,
  AiSettings,
  AiThinkingLevel,
  AiAgentDomain,
  AiAgentMode,
  WebSearchProviderConfig,
  ThreadMessage,
  SendContext,
  AiContextCompressionEvent,
} from '@/ai/types'
import {
  normalizeWebSearchProviderConfigs,
  inferToolKind,
  DEFAULT_AI_SETTINGS,
  DEFAULT_THINKING_LEVEL,
  getActiveAiProviderConfig,
  normalizeAgentMode,
  normalizeModeForDomain,
  normalizeThinkingLevel,
  resolveAiProviderModelId,
  resolveAgentDomain,
} from '@/ai/types'
import { getProviderPresetById, getProviderPresets, type ProviderPreset } from '@/ai/model/providers/provider-presets'
import { createThread, appendMessage, createMessage } from '@/ai/thread/Thread'
import {
  normalizeThreadMessageForDisplay,
  normalizeThreadMessagesForDisplay,
} from '@/ai/message/display-normalizer'
import { useAppStore } from '@/stores/app'
import { notify } from '@/utils/notifications'
import { i18n } from '@/i18n'
import { nanoid } from 'nanoid'
import {
  createEditReviewModule,
} from './modules/editReview'
import {
  createCreativeReviewModule,
} from './modules/creativeReview'
import {
  createFilesystemReviewModule,
} from './modules/filesystemReview'
import {
  createRuntimeState,
} from './modules/runtimeState'
import { createRuntimeDisplay } from './modules/runtimeDisplay'
import { createRuntimeEvents } from './modules/runtimeEvents'
import {
  createPendingCommandQueue,
  type PendingCommand,
} from './modules/pendingCommands'

export type {
  ProposalReviewEntry,
  ProposalReviewSummary,
} from '@/ai/review/common/types'

export interface AiDisplayMessageEntry {
  kind: 'message'
  key: string
  message: ThreadMessage
  isPreview?: boolean
}

export interface AiDisplayContextCompressionEntry {
  kind: 'context-compressed'
  key: string
  event: AiContextCompressionEvent
}

export type AiDisplayEntry = AiDisplayMessageEntry | AiDisplayContextCompressionEntry

export interface AiDisplayThread {
  persistedMessages: ThreadMessage[]
  messages: AiDisplayEntry[]
}

// ── Settings localStorage helpers ──────────────────────────────────────────
const _STORAGE_KEY_SETTINGS = 'iwriter-ai-settings'

function resolveDefaultModelProfiles(
  cfg: AiProviderConfig,
  preset?: ProviderPreset,
): AiProviderConfig['modelProfiles'] {
  if (preset?.id === 'openai') return undefined
  return cfg.modelProfiles ?? preset?.modelProfiles
}

function normalizeOpenAiPresetConfig(
  cfg: AiProviderConfig,
  preset: ProviderPreset,
): AiProviderConfig {
  const presetModels = preset.models ?? []
  const isPresetModel = (modelId: string | undefined): boolean => {
    const normalized = modelId?.trim()
    return !!normalized && presetModels.includes(normalized)
  }

  return {
    ...cfg,
    defaultModelId: isPresetModel(cfg.defaultModelId) ? cfg.defaultModelId : preset.defaultModelId,
    models: presetModels,
    modelProfiles: undefined,
    lastSelectedModelId: isPresetModel(cfg.lastSelectedModelId) ? cfg.lastSelectedModelId : undefined,
    fallbackModelId: isPresetModel(cfg.fallbackModelId) ? cfg.fallbackModelId : undefined,
  }
}

function _loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(_STORAGE_KEY_SETTINGS)
    if (!raw) {
      return {
        ...DEFAULT_AI_SETTINGS,
        webSearchProviderConfigs: normalizeWebSearchProviderConfigs(undefined),
      }
    }
    const merged = { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) } as AiSettings
    merged.defaultMode = normalizeAgentMode(merged.defaultMode)
    merged.webSearchProviderConfigs = normalizeWebSearchProviderConfigs(merged.webSearchProviderConfigs)
    merged.activeWebSearchProviderConfigId = merged.activeWebSearchProviderConfigId ?? null
    merged.providerConfigs = (merged.providerConfigs ?? []).map(cfg => {
      const preset = getProviderPresetById(cfg.presetId)
      const normalizedPresetConfig = preset?.id === 'openai'
        ? normalizeOpenAiPresetConfig(cfg, preset)
        : cfg
      return {
        ...normalizedPresetConfig,
        modelProfiles: resolveDefaultModelProfiles(normalizedPresetConfig, preset),
        lastSelectedThinkingLevel: normalizeThinkingLevel(normalizedPresetConfig.lastSelectedThinkingLevel),
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
    _initialSettings.providerConfigs = getProviderPresets()
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
        modelProfiles: p.id === 'openai' ? undefined : p.modelProfiles,
        lastSelectedThinkingLevel: DEFAULT_THINKING_LEVEL,
      }))
    _initialSettings.activeProviderConfigId = _initialSettings.providerConfigs[0]?.id ?? null
    _saveSettingsToStorage(_initialSettings)
  }

  const settings = ref<AiSettings>(_initialSettings)

  const activeProviderConfig = computed<AiProviderConfig | null>(() => {
    return getActiveAiProviderConfig(
      settings.value.providerConfigs,
      settings.value.activeProviderConfigId,
    )
  })

  const effectiveProviderConfig = computed<AiProviderConfig | null>(() => {
    const threadProviderId = activeThread.value?.providerConfigId
    if (threadProviderId) {
      return getActiveAiProviderConfig(
        settings.value.providerConfigs,
        threadProviderId,
        { preferredModelId: activeThread.value?.modelId },
      ) ?? activeProviderConfig.value
    }
    return activeProviderConfig.value
  })

  /** Models available for the current provider (for model picker) */
  const availableModels = computed<string[]>(() => {
    const config = effectiveProviderConfig.value
    if (!config) return []
    if (config.models?.length) return config.models
    const preset = getProviderPresetById(config.presetId)
    const presetModels = preset?.models ?? []
    if (presetModels.length) return presetModels
    return [resolveAiProviderModelId(config)].filter(Boolean)
  })

  function saveSettings() {
    _saveSettingsToStorage(settings.value)
    // Keep main-process AgentEngine in sync whenever settings change
    window.electronAPI?.aiUpdateConfig?.(JSON.parse(JSON.stringify(toRaw(settings.value))))
  }

  function updateWebSearchProviderConfig(id: string, updates: Partial<WebSearchProviderConfig>) {
    const idx = settings.value.webSearchProviderConfigs.findIndex(c => c.id === id)
    if (idx >= 0) {
      settings.value.webSearchProviderConfigs[idx] = {
        ...settings.value.webSearchProviderConfigs[idx]!,
        ...updates,
      }
      saveSettings()
    }
  }

  function setActiveWebSearchProviderConfig(id: string | null) {
    settings.value.activeWebSearchProviderConfigId = id
    saveSettings()
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
        thinkingLevel: normalizeThinkingLevel(nextProvider?.lastSelectedThinkingLevel),
      })
    }
  }

  /** Persist selected model to provider config */
  function setCurrentModelId(modelId: string) {
    const config = effectiveProviderConfig.value
    if (config) {
      updateProviderConfig(config.id, { defaultModelId: modelId, lastSelectedModelId: modelId })
    }
    if (activeThread.value) {
      updateThread({ ...activeThread.value, modelId })
    }
  }

  /** Persist selected thinking level to provider config and current thread */
  function setCurrentThinkingLevel(level: AiThinkingLevel) {
    const normalizedLevel = normalizeThinkingLevel(level)
    const config = effectiveProviderConfig.value
    if (config) {
      updateProviderConfig(config.id, { lastSelectedThinkingLevel: normalizedLevel })
    }
    if (activeThread.value) {
      updateThread({ ...activeThread.value, thinkingLevel: normalizedLevel })
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
  const contextCompressionEventsByThread = ref<Record<string, AiContextCompressionEvent[]>>({})
  const subagentCompressionEventsByThread = ref<
    Record<string, Record<string, AiContextCompressionEvent[]>>
  >({})
  const pendingCommandQueue = createPendingCommandQueue()

  const activeThread = computed<AiThread | null>(() => {
    return threads.value.find(t => t.id === activeThreadId.value) ?? null
  })

  const activeContextCompressionEvents = computed<AiContextCompressionEvent[]>(() => {
    const threadId = activeThreadId.value
    return threadId ? contextCompressionEventsByThread.value[threadId] ?? [] : []
  })

  const activeSubagentCompressionEvents = computed<Record<string, AiContextCompressionEvent[]>>(() => {
    const threadId = activeThreadId.value
    return threadId ? subagentCompressionEventsByThread.value[threadId] ?? {} : {}
  })

  const pendingCommands = computed<PendingCommand[]>(() => {
    const threadId = activeThreadId.value
    return threadId ? pendingCommandQueue.getCommands(threadId) : []
  })

  function upsertCompressionEventList(
    events: AiContextCompressionEvent[],
    event: AiContextCompressionEvent,
  ): AiContextCompressionEvent[] {
    const index = events.findIndex(item => item.id === event.id)
    if (index < 0) return [...events, event]
    const updated = [...events]
    updated[index] = { ...updated[index]!, ...event }
    return updated
  }

  function upsertContextCompressionEvent(event: AiContextCompressionEvent) {
    if (event.subagentId) {
      const threadEvents = subagentCompressionEventsByThread.value[event.threadId] ?? {}
      subagentCompressionEventsByThread.value = {
        ...subagentCompressionEventsByThread.value,
        [event.threadId]: {
          ...threadEvents,
          [event.subagentId]: upsertCompressionEventList(
            threadEvents[event.subagentId] ?? [],
            event,
          ),
        },
      }
      return
    }

    contextCompressionEventsByThread.value = {
      ...contextCompressionEventsByThread.value,
      [event.threadId]: upsertCompressionEventList(
        contextCompressionEventsByThread.value[event.threadId] ?? [],
        event,
      ),
    }
  }

  function clearContextCompressionEvents(threadId: string) {
    if (threadId in contextCompressionEventsByThread.value) {
      const next = { ...contextCompressionEventsByThread.value }
      delete next[threadId]
      contextCompressionEventsByThread.value = next
    }
    if (threadId in subagentCompressionEventsByThread.value) {
      const next = { ...subagentCompressionEventsByThread.value }
      delete next[threadId]
      subagentCompressionEventsByThread.value = next
    }
  }

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
      clearContextCompressionEvents(t.id)
      pendingCommandQueue.clearThread(t.id)
      clearRunOwnershipForThread(t.id)
      window.electronAPI.aiDeleteThread?.(t.id)
    }
    threads.value = threads.value.filter(t => !toRemove.some(r => r.id === t.id))
    if (!threads.value.find(t => t.id === activeThreadId.value)) {
      activeThreadId.value = threads.value[0]?.id ?? null
    }
  }

  function createNewThread(): AiThread | null {
    _purgeEmptyThreads()
    const config = activeProviderConfig.value
    if (!config) {
      notify.error('请先配置可用的 AI Provider（API Key、模型等）')
      return null
    }
    const thread = createThread(
      config.id,
      resolveAiProviderModelId(config),
      settings.value.defaultMode,
      normalizeThinkingLevel(config.lastSelectedThinkingLevel),
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
    runtimeEvents.clearThreadUsage(id)
    clearContextCompressionEvents(id)
    pendingCommandQueue.clearThread(id)
    clearRunOwnershipForThread(id)
    threads.value = threads.value.filter(t => t.id !== id)
    window.electronAPI.aiDeleteThread?.(id)
    if (activeThreadId.value === id) {
      activeThreadId.value = threads.value[0]?.id ?? null
    }
  }

  function clearAllThreads() {
    runtimeEvents.clearAllUsage()
    pendingCommandQueue.clearAll()
    _runOwnershipByTurnId.clear()
    contextCompressionEventsByThread.value = {}
    subagentCompressionEventsByThread.value = {}
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

    const removedTurnIds = new Set(
      persistedMessages.value
        .slice(idx)
        .map(message => message.turnId)
        .filter((turnId): turnId is string => !!turnId),
    )
    if (removedTurnIds.size > 0) {
      const current = contextCompressionEventsByThread.value[thread.id] ?? []
      contextCompressionEventsByThread.value = {
        ...contextCompressionEventsByThread.value,
        [thread.id]: current.filter(event => !event.turnId || !removedTurnIds.has(event.turnId)),
      }
      const subagentEvents = subagentCompressionEventsByThread.value[thread.id] ?? {}
      subagentCompressionEventsByThread.value = {
        ...subagentCompressionEventsByThread.value,
        [thread.id]: Object.fromEntries(
          Object.entries(subagentEvents)
            .map(([subagentId, events]) => [
              subagentId,
              events.filter(event => !event.turnId || !removedTurnIds.has(event.turnId)),
            ])
            .filter(([, events]) => (events as AiContextCompressionEvent[]).length > 0),
        ),
      }
    }

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
    pendingCreativeReviews,
    pendingFilesystemReviews,
    liveTurnState,
    liveTurnThreadId,
    liveTurnTurnId,
    liveTurnStartedAt,
    startLiveTurn: _startLiveTurn,
    ensureLiveTurn: _ensureLiveTurn,
    clearLiveTurn: _clearLiveTurn,
    clearRunPointers: _clearRunPointers,
  } = runtimeState

  let _runTransitionEpoch = 0
  const _runOwnershipByTurnId = new Map<string, { epoch: number; threadId: string }>()
  let _cancelInFlight: Promise<boolean> | null = null
  let _cancelNotificationRequested = false

  function queuePendingCommand(userText: string, sendContext?: SendContext): boolean {
    const threadId = activeThreadId.value
    const text = userText.trim()
    if (!threadId || !text || _threadRunState.value === 'idle') return false
    pendingCommandQueue.enqueue(threadId, text, sendContext)
    return true
  }

  function updatePendingCommand(id: string, text: string): boolean {
    const threadId = activeThreadId.value
    return threadId ? pendingCommandQueue.update(threadId, id, text) : false
  }

  function removePendingCommand(id: string): boolean {
    const threadId = activeThreadId.value
    return threadId ? pendingCommandQueue.remove(threadId, id) !== null : false
  }

  function clearRunOwnershipForThread(threadId: string) {
    for (const [turnId, ownership] of _runOwnershipByTurnId) {
      if (ownership.threadId === threadId) _runOwnershipByTurnId.delete(turnId)
    }
  }

  let _creativeDisplayOverrides: (() => ReturnType<typeof editReview.displayOverrides>) | null = null

  function _mergedOverrides() {
    const e = editReview.displayOverrides()
    const c = _creativeDisplayOverrides?.() ?? {}
    return {
      byId: { ...e.byId, ...(c.byId ?? {}) },
      bySignature: { ...e.bySignature, ...(c.bySignature ?? {}) },
    }
  }

  const _normalizeMessagesForDisplay = (messages: ThreadMessage[]): ThreadMessage[] =>
    normalizeThreadMessagesForDisplay(messages, _mergedOverrides())

  const _normalizeMessageForDisplay = (message: ThreadMessage): ThreadMessage =>
    normalizeThreadMessageForDisplay(message, _mergedOverrides())

  const editReview = createEditReviewModule({
    appStore,
    saveFile: (content: string, absolutePath: string) =>
      window.electronAPI.saveFile?.(content, absolutePath) ?? Promise.resolve(),
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

  const creativeReview = createCreativeReviewModule({
    activeThread,
    pendingCreativeReviews,
    interruptedThreadId: _interruptedThreadId,
    interruptedTurnId: _interruptedTurnId,
    threadRunState: _threadRunState,
    currentThreadId: _currentThreadId,
    currentTurnId: _currentTurnId,
    liveTurnRef: _liveTurn,
    ensureLiveTurn: _ensureLiveTurn,
    updateThread,
    normalizeMessagesForDisplay: _normalizeMessagesForDisplay,
  })
  _creativeDisplayOverrides = creativeReview.displayOverrides

  const filesystemReview = createFilesystemReviewModule({
    pendingFilesystemReviews,
    interruptedThreadId: _interruptedThreadId,
    interruptedTurnId: _interruptedTurnId,
    threadRunState: _threadRunState,
    currentThreadId: _currentThreadId,
    currentTurnId: _currentTurnId,
    liveTurnRef: _liveTurn,
    ensureLiveTurn: _ensureLiveTurn,
  })

  // ── Send Message ──────────────────────────────────────────────────────────
  async function sendMessage(userText: string, sendContext?: SendContext): Promise<boolean> {
    // All non-idle input must pass through the pending-command queue. In
    // particular, never turn a queued instruction into an implicit rejection
    // while the current turn is waiting for approval.
    if (_threadRunState.value !== 'idle') return false

    const runtimeProvider = effectiveProviderConfig.value
    if (!runtimeProvider) {
      notify.error('请先配置可用的 AI Provider（API Key、模型等）')
      return false
    }

    // Auto-reject any proposals still waiting for user approval
    _rejectAllPendingProposals()
    _rejectAllPendingCreativeReviews()
    _rejectAllPendingFilesystemReviews()

    // Ensure there is an active thread
    let thread = activeThread.value
    if (!thread) {
      thread = createNewThread()
      if (!thread) return false
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

    // Start streaming state
    runtimeEvents.resetRunErrorFlag()
    _threadRunState.value = 'streaming'
    const turnId = `turn-${nanoid(8)}`
    const turnEpoch = ++_runTransitionEpoch
    _runOwnershipByTurnId.set(turnId, { epoch: turnEpoch, threadId: thread.id })
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
          providerConfigId: runtimeProvider.id,
          modelId: resolveAiProviderModelId(runtimeProvider, thread.modelId),
          thinkingLevel: normalizeThinkingLevel(
            thread.thinkingLevel
            ?? effectiveProviderConfig.value?.lastSelectedThinkingLevel
            ?? DEFAULT_THINKING_LEVEL,
          ),
        },
        uiLocale: appStore.locale,
        workspacePath: appStore.currentFolder ?? null,
        attachments: {
          filePaths: sendContext?.filePaths ?? [],
          directories: sendContext?.directories ?? [],
        },
      })

      if (
        result
        && _runTransitionEpoch === turnEpoch
        && _currentTurnId.value === turnId
        && _threadRunState.value === 'streaming'
      ) {
        _currentThreadId.value = result.threadId
      }
    } catch (err) {
      const ownership = _runOwnershipByTurnId.get(turnId)
      const stillOwnsRun = ownership?.epoch === turnEpoch && _runTransitionEpoch === turnEpoch
      if (stillOwnsRun) {
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
      if (_runOwnershipByTurnId.get(turnId) === ownership) {
        _runOwnershipByTurnId.delete(turnId)
      }
      return false
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
    getCompletedRoundResult,
    handleInterrupt: _handleEditInterrupt,
    resetReviewState: _resetEditReviewState,
    rejectAllPendingProposals: _rejectAllPendingProposals,
    approveEditProposal,
    editAndApproveProposal,
    rejectEditProposal,
    approveAllProposals,
    rejectAllProposals,
  } = editReview

  const {
    isResumingFilesystemReview,
    handleInterrupt: _handleFilesystemInterrupt,
    resetReviewState: _resetFilesystemReviewState,
    rejectAllPendingReviews: _rejectAllPendingFilesystemReviews,
    approveFilesystemReview,
    rejectFilesystemReview,
    approveAllFilesystemReviews,
    rejectAllFilesystemReviews,
  } = filesystemReview

  const {
    isResumingCreativeReview,
    getCompletedCreativeRoundResult,
    handleInterrupt: _handleCreativeInterrupt,
    resetReviewState: _resetCreativeReviewState,
    rejectAllPendingReviews: _rejectAllPendingCreativeReviews,
    approveCreativeReview,
    editAndApproveCreativeReview,
    rejectCreativeReview,
    respondCreativeReview,
    approveAllCreativeReviews,
    notifyCreativeToolResult: _notifyCreativeToolResult,
    finalizePendingCreativeApply: _finalizePendingCreativeApply,
  } = creativeReview

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
    handleCreativeInterrupt: _handleCreativeInterrupt,
    handleFilesystemInterrupt: _handleFilesystemInterrupt,
    resetEditReviewState: _resetEditReviewState,
    resetCreativeReviewState: _resetCreativeReviewState,
    notifyCreativeToolResult: _notifyCreativeToolResult,
    finalizePendingCreativeApply: _finalizePendingCreativeApply,
    inferToolKind,
    normalizeMessagesForDisplay: _normalizeMessagesForDisplay,
    normalizeMessageForDisplay: _normalizeMessageForDisplay,
    getCompletedRoundResult,
    getCompletedCreativeRoundResult,
    appendMessage,
    getThreadById: (threadId: string) => threads.value.find(t => t.id === threadId) ?? null,
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
    upsertContextCompressionEvent,
  })

  async function dispatchPendingCommands(threadId: string): Promise<boolean> {
    if (_threadRunState.value !== 'idle' || activeThreadId.value !== threadId) return false
    const batch = pendingCommandQueue.createBatch(threadId)
    if (!batch) return false
    const started = await sendMessage(batch.text, batch.sendContext)
    if (started) pendingCommandQueue.removeByIds(threadId, batch.ids)
    return started
  }

  async function handleRunDone(event: Parameters<typeof runtimeEvents.onRunDone>[0]) {
    const turnId = event.turnId ?? _currentTurnId.value
    const ownership = turnId ? _runOwnershipByTurnId.get(turnId) : undefined
    const isCurrent = () => !!ownership
      && ownership.threadId === event.threadId
      && ownership.epoch === _runTransitionEpoch
    const completion = await runtimeEvents.onRunDone(event, isCurrent)
    if (turnId && _runOwnershipByTurnId.get(turnId) === ownership) {
      _runOwnershipByTurnId.delete(turnId)
    }
    if (completion.completedSuccessfully && completion.checkpointRefreshed && completion.stillCurrent) {
      await dispatchPendingCommands(event.threadId)
    } else if (
      completion.completedSuccessfully
      && completion.stillCurrent
      && pendingCommandQueue.getCommands(event.threadId).length > 0
    ) {
      notify.warning(i18n.global.t('agentPanel.pendingCommands.checkpointNotReady'))
    }
  }

  function handleRunInterrupted(event: Parameters<typeof runtimeEvents.onRunInterrupted>[0]) {
    if (event.turnId && !_runOwnershipByTurnId.has(event.turnId)) {
      // A missing owner is valid when an interrupted checkpoint is rehydrated
      // after app startup. While another run is active, it is a stale event.
      if (_threadRunState.value !== 'idle') return
      const epoch = ++_runTransitionEpoch
      _runOwnershipByTurnId.set(event.turnId, { epoch, threadId: event.threadId })
    }
    runtimeEvents.onRunInterrupted(event)
  }

  function handleRunError(event: Parameters<typeof runtimeEvents.onRunError>[0]) {
    const ownership = event.turnId ? _runOwnershipByTurnId.get(event.turnId) : undefined
    if (!ownership || ownership.epoch !== _runTransitionEpoch) return
    runtimeEvents.onRunError(event)
  }

  const persistedMessages = computed<ThreadMessage[]>(() => activeThread.value?.messages ?? [])
  const runtimeDisplay = createRuntimeDisplay({
    liveTurn: _liveTurn,
    threadRunState: _threadRunState,
    activeThreadId,
    persistedMessages,
    contextCompressionEvents: activeContextCompressionEvents,
    subagentCompressionEvents: activeSubagentCompressionEvents,
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

  function cancelCurrentRun(showStoppedNotification: boolean): Promise<boolean> {
    _cancelNotificationRequested ||= showStoppedNotification
    if (_cancelInFlight) return _cancelInFlight

    const tid = _currentThreadId.value ?? _interruptedThreadId.value ?? _liveTurn.value?.threadId
    const turnId = _currentTurnId.value ?? _interruptedTurnId.value ?? _liveTurn.value?.turnId ?? null
    const previousEpoch = _runTransitionEpoch
    const cancellationEpoch = ++_runTransitionEpoch

    const cancellation = (async (): Promise<boolean> => {
      try {
        if (tid) {
          await window.electronAPI.aiCancel?.(tid)
        }
      } catch (error) {
        if (_runTransitionEpoch === cancellationEpoch) {
          _runTransitionEpoch = previousEpoch
        }
        notify.error(`停止生成失败: ${error instanceof Error ? error.message : String(error)}`)
        return false
      }

      if (_runTransitionEpoch === cancellationEpoch) {
        _threadRunState.value = 'idle'
        _clearRunPointers()
        _resetEditReviewState()
        _resetCreativeReviewState()
        _resetFilesystemReviewState()
        _clearLiveTurn()
        if (turnId) _runOwnershipByTurnId.delete(turnId)
        if (_cancelNotificationRequested) notify.info('已停止生成')
      }
      return true
    })()

    _cancelInFlight = cancellation
    void cancellation.finally(() => {
      if (_cancelInFlight === cancellation) {
        _cancelInFlight = null
        _cancelNotificationRequested = false
      }
    })
    return cancellation
  }

  async function cancelStreaming(): Promise<boolean> {
    return cancelCurrentRun(true)
  }

  async function steerPendingCommand(id: string): Promise<boolean> {
    const threadId = activeThreadId.value
    if (!threadId) return false
    const command = pendingCommandQueue.getCommands(threadId).find(item => item.id === id)
    if (!command) return false

    if (_threadRunState.value !== 'idle') {
      const cancelled = await cancelCurrentRun(false)
      if (!cancelled) return false
    }
    if (activeThreadId.value !== threadId) return false

    const started = await sendMessage(command.text, command.sendContext)
    if (started) pendingCommandQueue.remove(threadId, command.id)
    return started
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
    window.electronAPI.onAiRunInterrupted?.(handleRunInterrupted)
    window.electronAPI.onAiRunDone?.(event => { void handleRunDone(event) })
    window.electronAPI.onAiRunError?.(handleRunError)
    window.electronAPI.onAiModelFallback?.((e) => {
      notify.warning(i18n.global.t('notify.ai.modelFallback', { modelId: e.fallbackModelId }))
    })
    window.electronAPI.onAiFilesystemAutoReject?.((e) => {
      notify.warning(i18n.global.t('notify.ai.filesystemAutoReject', { toolName: e.toolName, filePath: e.filePath }))
    })
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
    setCurrentThinkingLevel,
    setCurrentMode,
    saveSettings,
    updateWebSearchProviderConfig,
    setActiveWebSearchProviderConfig,

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
    pendingCreativeReviews,
    pendingFilesystemReviews,
    pendingCommands,
    isResumingReviewedEdits,
    isResumingCreativeReview,
    isResumingFilesystemReview,
    reviewedToolCallStatuses,
    reviewedEditSignatures,
    reviewedBatchEntries,
    reviewBatchSummary,
    getCompletedRoundResult,
    draftInput,

    // Actions
    sendMessage,
    queuePendingCommand,
    updatePendingCommand,
    removePendingCommand,
    steerPendingCommand,
    approveEditProposal,
    editAndApproveProposal,
    rejectEditProposal,
    approveAllProposals,
    rejectAllProposals,
    approveCreativeReview,
    editAndApproveCreativeReview,
    rejectCreativeReview,
    respondCreativeReview,
    approveAllCreativeReviews,
    approveFilesystemReview,
    rejectFilesystemReview,
    approveAllFilesystemReviews,
    rejectAllFilesystemReviews,
    cancelStreaming,
    setDraftInput,
    init,
    teardown,
  }
})
