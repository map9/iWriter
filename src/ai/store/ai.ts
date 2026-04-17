import { defineStore } from 'pinia'
import { ref, computed, toRaw, nextTick } from 'vue'
import type {
  AiThread,
  AiProviderConfig,
  AiSettings,
  AiAgentDomain,
  AiAgentMode,
  BlockEditProposal,
  FileCreateProposal,
  EditProposal,
  ThreadMessage,
  SendContext,
  AiToolCall,
  MessageContentBlock,
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
  stableStringify,
  type ToolCallStatusOverrides,
} from '@/ai/message/display-normalizer'
import { applyBlockEditProposal } from '@/ai/edit-agent/BlockEditApplier'
import { UnifiedDocumentAccess } from '@/ai/edit-agent/UnifiedDocumentAccess'
import { buildSnapshot, buildEditorStateBlock } from '@/ai/thread/ContextBuilder'
import { useAppStore } from '@/stores/app'
import type { Editor } from '@tiptap/core'
import { notify } from '@/utils/notifications'
import { nanoid } from 'nanoid'
import { pathUtils } from '@/utils/pathUtils'
import { DocumentType } from '@/types/document-type'
import type {
  StreamChunkEvent,
  RunInterruptedEvent,
  RunDoneEvent,
  RunErrorEvent,
  ResumeDecision,
} from '@/ai/ipc'

export interface AiDisplayMessageEntry {
  key: string
  message: ThreadMessage
  isPreview?: boolean
}

export interface AiDisplayThread {
  persistedMessages: ThreadMessage[]
  messages: AiDisplayMessageEntry[]
}

export interface ProposalReviewEntry {
  proposal: EditProposal
  state: 'approved' | 'edited' | 'rework' | 'paused' | 'ended' | 'rejected'
  label: string
  tone: 'green' | 'blue' | 'amber' | 'gray'
}

export interface ProposalReviewSummary {
  total: number
  resolved: number
  pending: number
  approved: number
  edited: number
  rework: number
  paused: number
  ended: number
  rejected: number
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

  // ── Thread Run State Machine ───────────────────────────────────────────────
  // Three states:
  //   idle:        no active run
  //   streaming:   actively streaming from agent
  //   interrupted: paused at HITL, waiting for user decisions
  type ThreadRunState = 'idle' | 'streaming' | 'interrupted'
  const _threadRunState = ref<ThreadRunState>('idle')

  /** True while the agent is actively streaming. Computed for backward compat with components. */
  const isStreaming = computed(() => _threadRunState.value === 'streaming')
  /** True while the agent is paused at a HITL interrupt, waiting for user decisions. */
  const isInterrupted = computed(() => _threadRunState.value === 'interrupted')

  // ── Streaming Display State ────────────────────────────────────────────────
  type StreamingBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_call'; toolCall: AiToolCall }

  type LiveTurnState = 'streaming' | 'interrupted' | 'resuming'
  interface LiveTurn {
    threadId: string
    turnId: string | null
    state: LiveTurnState
    startedAt: number
    text: string
    currentText: string
    blocks: StreamingBlock[]
    thinkingText: string
    toolName: string | null
    proposals: EditProposal[]
  }

  const _liveTurn = ref<LiveTurn | null>(null)
  const isResumingReviewedEdits = ref(false)
  const reviewedToolCallStatuses = ref<Record<string, AiToolCall['status']>>({})
  const reviewedEditSignatures = ref<Record<string, AiToolCall['status']>>({})

  /** Thread ID of the currently active (streaming or interrupted) run. */
  const _currentThreadId = ref<string | null>(null)
  /** Stable turn identity for the currently active run. */
  const _currentTurnId = ref<string | null>(null)

  // ── HITL Interrupt State ───────────────────────────────────────────────────

  /** ThreadId currently in 'interrupted' state. */
  const _interruptedThreadId = ref<string | null>(null)
  /** TurnId currently in 'interrupted' state. */
  const _interruptedTurnId = ref<string | null>(null)

  const streamingText = computed(() => _liveTurn.value?.text ?? '')
  const streamingCurrentText = computed(() => _liveTurn.value?.currentText ?? '')
  const streamingBlocks = computed(() => _liveTurn.value?.blocks ?? [])
  const streamingThinkingText = computed(() => _liveTurn.value?.thinkingText ?? '')
  const streamingToolName = computed(() => _liveTurn.value?.toolName ?? null)
  const pendingEditProposals = computed(() => _liveTurn.value?.proposals ?? [])
  const liveTurnState = computed<LiveTurnState | null>(() => _liveTurn.value?.state ?? null)
  const liveTurnThreadId = computed(() => _liveTurn.value?.threadId ?? null)
  const liveTurnTurnId = computed(() => _liveTurn.value?.turnId ?? null)
  const liveTurnStartedAt = computed(() => _liveTurn.value?.startedAt ?? null)

  function _startLiveTurn(params: {
    threadId: string
    turnId: string | null
    state: LiveTurnState
    startedAt?: number
  }) {
    _liveTurn.value = {
      threadId: params.threadId,
      turnId: params.turnId,
      state: params.state,
      startedAt: params.startedAt ?? Date.now(),
      text: '',
      currentText: '',
      blocks: [],
      thinkingText: '',
      toolName: null,
      proposals: [],
    }
  }

  function _ensureLiveTurn(params?: {
    threadId?: string | null
    turnId?: string | null
    state?: LiveTurnState
    startedAt?: number
  }): LiveTurn | null {
    if (!_liveTurn.value) {
      const threadId = params?.threadId ?? _currentThreadId.value ?? _interruptedThreadId.value
      if (!threadId) return null
      _startLiveTurn({
        threadId,
        turnId: params?.turnId ?? _currentTurnId.value ?? _interruptedTurnId.value ?? null,
        state: params?.state ?? (_threadRunState.value === 'interrupted' ? 'interrupted' : 'streaming'),
        startedAt: params?.startedAt,
      })
    } else if (params) {
      _liveTurn.value = {
        ..._liveTurn.value,
        threadId: params.threadId ?? _liveTurn.value.threadId,
        turnId: params.turnId ?? _liveTurn.value.turnId,
        state: params.state ?? _liveTurn.value.state,
      }
    }
    return _liveTurn.value
  }

  function _clearLiveTurn() {
    _liveTurn.value = null
  }

  /**
   * Number of actionRequests in the current interrupt batch.
   * Decisions are keyed by 0-based index (matches actionRequests order).
   * This aligns with LangGraph's HITLResponse.decisions[] contract.
   */
  const _interruptActionCount = ref<number>(0)

  /**
   * Per-action decision records keyed by 0-based index.
   * Flushed once all actions are resolved (see _maybeFlushResume).
   */
  const _decisionRecord = new Map<number, {
    type: 'approved' | 'edited' | 'rejected'
    editedArgs?: Record<string, unknown>
    message?: string
  }>()

  /**
   * Stable index map: proposalId → 0-based index in the original interrupt batch.
   * Populated at interrupt time and cleared after flush/cancel.
   * Guards against index shifts caused by removing proposals from pendingEditProposals.
   */
  const _proposalIndexMap = new Map<string, number>()
  const _proposalBatch = new Map<number, EditProposal>()

  /**
   * Set to true by onAiRunError for the current run; cleared when a new run starts.
   * Used by onAiRunDone to skip the checkpointer reload when the run already errored
   * (onAiRunError already added the error message to the thread).
   */
  let _currentRunHasError = false

  function _displayOverrides(): ToolCallStatusOverrides {
    return {
      byId: reviewedToolCallStatuses.value,
      bySignature: reviewedEditSignatures.value,
    }
  }

  function _proposalToolSignature(proposal: EditProposal): string {
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

  function _proposalMatchesToolCall(proposal: EditProposal, toolCall: AiToolCall): boolean {
    if (toolCall.id === proposal.toolCallId) return true

    const args = toolCall.arguments

    if (proposal.kind === 'create_file') {
      return toolCall.name === 'create_document'
        && String(args.filename ?? '') === String(proposal.filename ?? '')
    }

    const sameFilePath = String(args.file_path ?? '') === String(proposal.filePath ?? '')

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

  function _normalizeMessagesForDisplay(messages: ThreadMessage[]): ThreadMessage[] {
    return normalizeThreadMessagesForDisplay(messages, _displayOverrides())
  }

  function _normalizeMessageForDisplay(message: ThreadMessage): ThreadMessage {
    return normalizeThreadMessageForDisplay(message, _displayOverrides())
  }

  function _updateLocalProposalToolCall(
    proposalOrId: EditProposal | string,
    status: AiToolCall['status'],
  ) {
    const proposal = typeof proposalOrId === 'string'
      ? _findProposal(proposalOrId)
      : proposalOrId
    if (!proposal) return
    const proposalSignature = _proposalToolSignature(proposal)
    const toolCallId = proposal.toolCallId
    if (toolCallId) {
      reviewedToolCallStatuses.value = {
        ...reviewedToolCallStatuses.value,
        [toolCallId]: status,
      }
    }
    reviewedEditSignatures.value = {
      ...reviewedEditSignatures.value,
      [_proposalToolSignature(proposal)]: status,
    }

    const thread = activeThread.value
    if (!thread?.messages?.length) return
    const hasSourceMessage = !!proposal.sourceMessageId
      && thread.messages.some(message => message.id === proposal.sourceMessageId)

    const messages = thread.messages.map(message => {
      if (hasSourceMessage && message.id !== proposal.sourceMessageId) return message
      if (!message.toolCalls?.length) return message
      return {
        ...message,
        toolCalls: message.toolCalls.map(tc =>
          {
            const isMatch =
              tc.id === toolCallId
              || `${tc.name}:${stableStringify(tc.arguments)}` === proposalSignature
              || _proposalMatchesToolCall(proposal, tc)
            return isMatch ? { ...tc, status } : tc
          }
        ),
      }
    })
    updateThread({ ...thread, messages: _normalizeMessagesForDisplay(messages) })
  }

  function _buildProposalFailureMessage(
    proposal: BlockEditProposal,
    error: string,
  ): string {
    const target = proposal.filePath
      ? `file "${proposal.filePath}"`
      : 'the active document'

    switch (proposal.type) {
      case 'edit':
      case 'delete':
        return `Edit failed on ${target} for block_id=${proposal.displayBlockId ?? 'unknown'}: ${error} Re-read the latest document content with get_blocks or get_section before deciding whether to retry.`
      case 'insert':
        return `Insert failed on ${target} after block_id=${proposal.displayBlockId ?? 0}: ${error} Re-read the latest document content with get_blocks or get_section before deciding whether to retry.`
      case 'replace_range':
        return `Replace failed on ${target} for block_ids=${proposal.startDisplayBlockId ?? 'unknown'}-${proposal.endDisplayBlockId ?? 'unknown'}: ${error} Re-read the latest document content with get_blocks or get_section before deciding whether to retry.`
      default:
        return `Edit failed on ${target}: ${error} Re-read the latest document content before deciding whether to retry.`
    }
  }

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
    _currentRunHasError = false
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
      _currentThreadId.value = null
      _currentTurnId.value = null
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

  // ── Edit Proposal Actions ─────────────────────────────────────────────────

  async function _applyBlockProposalToTarget(proposal: BlockEditProposal) {
    if (proposal.filePath) {
      if (!pathUtils.isAbsolutePath(proposal.filePath)) {
        return {
          success: false as const,
          error: `file_path 必须是绝对路径，当前收到: ${proposal.filePath}`,
        }
      }

      const fileExists = await window.electronAPI.pathExists(proposal.filePath)
      if (!fileExists) {
        return {
          success: false as const,
          error: `目标文件不存在: ${proposal.filePath}`,
        }
      }

      const currentFilePath = appStore.activeTab?.path
      const isActiveFile = !!currentFilePath &&
        pathUtils.normalize(currentFilePath) === pathUtils.normalize(proposal.filePath)

      if (!isActiveFile) {
        const handle = await UnifiedDocumentAccess.createFreshFromFile(proposal.filePath)
        if ('error' in handle) {
          return { success: false as const, error: handle.error }
        }
        const result = await handle.applyBlockProposal(proposal)
        handle.dispose()
        return result.success
          ? { success: true as const }
          : { success: false as const, error: result.error }
      }
    }

    const editor = appStore.activeTab?.editorInstance as Editor | undefined
    if (!editor) {
      return { success: false as const, error: '没有活动的编辑器文档' }
    }

    const handle = UnifiedDocumentAccess.fromEditor(editor, appStore.activeTab?.path ?? undefined)
    const result = await handle.applyBlockProposal(proposal)
    return result.success
      ? { success: true as const }
      : { success: false as const, error: result.error }
  }

  /**
   * Reject all currently pending proposals.
   * Sends a single batch rejection to the backend if currently interrupted.
   * Called when the user sends a new message or explicitly cancels.
   */
  function _rejectAllPendingProposals() {
    if (!pendingEditProposals.value.length && !_interruptActionCount.value) return

    // Send batch rejection to backend (index-based, matches actionRequests order)
    const threadId = _interruptedThreadId.value
    if (threadId && _interruptActionCount.value > 0) {
      const decisions: ResumeDecision[] = Array.from(
        { length: _interruptActionCount.value },
        () => ({ type: 'rejected' as const, message: 'User sent a new message' })
      )
      window.electronAPI.aiResume?.({ threadId, decisions })
    }

    _threadRunState.value = 'idle'
    _interruptedThreadId.value = null
    _interruptedTurnId.value = null
    _interruptActionCount.value = 0
    isResumingReviewedEdits.value = false
    _decisionRecord.clear()
    _proposalIndexMap.clear()
    _proposalBatch.clear()
    if (_liveTurn.value) {
      _liveTurn.value = { ..._liveTurn.value, proposals: [] }
    }
  }

  /**
   * Find a proposal by ID — searches pendingEditProposals.
   * (thread.messages no longer carry editProposals as they come from the checkpointer)
   */
  function _findProposal(proposalId: string): EditProposal | undefined {
    const pendingProposal = pendingEditProposals.value.find(p => p.id === proposalId)
    if (pendingProposal) return pendingProposal
    for (const proposal of _proposalBatch.values()) {
      if (proposal.id === proposalId) return proposal
    }
    return undefined
  }

  function _removePendingProposal(proposalId: string) {
    const liveTurn = _ensureLiveTurn()
    if (liveTurn) {
      liveTurn.proposals = liveTurn.proposals.filter(p => p.id !== proposalId)
      _liveTurn.value = { ...liveTurn }
    }
  }

  function _normalizeEditedArgsForProposal(
    proposal: BlockEditProposal,
    editedArgs: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (proposal.type) {
      case 'edit':
        return {
          block_id: proposal.displayBlockId,
          new_content: editedArgs.new_content ?? proposal.newContent ?? '',
          expected_current_content: proposal.expectedCurrentContent,
          reason: proposal.description,
          file_path: proposal.filePath,
          ...editedArgs,
        }
      case 'insert':
        return {
          after_block_id: proposal.displayBlockId ?? 0,
          new_blocks: editedArgs.new_blocks ?? editedArgs.new_content ?? proposal.newContent ?? '',
          expected_anchor_content: proposal.expectedAnchorContent,
          reason: proposal.description,
          file_path: proposal.filePath,
          ...editedArgs,
        }
      case 'replace_range':
        return {
          start_block_id: proposal.startDisplayBlockId,
          end_block_id: proposal.endDisplayBlockId,
          new_content: editedArgs.new_content ?? proposal.newContent ?? '',
          expected_old_content: proposal.expectedOldContent,
          reason: proposal.description,
          file_path: proposal.filePath,
          ...editedArgs,
        }
      case 'delete':
        return {
          block_id: proposal.displayBlockId,
          expected_current_content: proposal.expectedCurrentContent,
          reason: proposal.description,
          file_path: proposal.filePath,
          ...editedArgs,
        }
    }
  }

  function _proposalSortKey(proposal: EditProposal): { fileKey: string; position: number; priority: number } {
    if (proposal.kind === 'create_file') {
      return { fileKey: `create:${proposal.filename}`, position: Number.NEGATIVE_INFINITY, priority: 99 }
    }
    const position = proposal.type === 'replace_range'
      ? (proposal.startDisplayBlockId ?? -1)
      : (proposal.displayBlockId ?? -1)
    const priority = proposal.type === 'delete'
      ? 0
      : proposal.type === 'replace_range'
        ? 1
        : proposal.type === 'edit'
          ? 2
          : 3
    return { fileKey: proposal.filePath ?? '__active__', position, priority }
  }

  function _sortedDecisionIndexes(): number[] {
    return Array.from(_decisionRecord.entries())
      .filter(([, record]) => record.type === 'approved' || record.type === 'edited')
      .map(([index]) => index)
      .sort((a, b) => {
        const proposalA = _proposalBatch.get(a)
        const proposalB = _proposalBatch.get(b)
        if (!proposalA || !proposalB) return a - b
        const keyA = _proposalSortKey(proposalA)
        const keyB = _proposalSortKey(proposalB)
        if (keyA.fileKey !== keyB.fileKey) return keyA.fileKey.localeCompare(keyB.fileKey)
        if (keyA.position !== keyB.position) return keyB.position - keyA.position
        if (keyA.priority !== keyB.priority) return keyA.priority - keyB.priority
        return a - b
      })
  }

  async function _applyRecordedDecision(index: number): Promise<void> {
    const decision = _decisionRecord.get(index)
    const proposal = _proposalBatch.get(index)
    if (!decision || !proposal || decision.type === 'rejected') return

    if (proposal.kind === 'create_file') {
      const p = proposal as FileCreateProposal
      appStore.createTab(p.filename, undefined, DocumentType.MARKDOWN_EDITOR)

      const getEditor = (): Editor | undefined =>
        appStore.activeTab?.editorInstance as Editor | undefined

      for (let i = 0; i < 20; i++) {
        await nextTick()
        if (getEditor()) break
      }

      const editor = getEditor()
      if (!editor) {
        _updateLocalProposalToolCall(proposal, 'failed')
        _decisionRecord.set(index, {
          type: 'rejected',
          message: 'Document creation failed: editor not ready.',
        })
        return
      }

      const insertProposal: BlockEditProposal = {
        id: proposal.id,
        kind: 'block',
        type: 'insert',
        status: 'pending',
        afterNodeId: '0',
        newContent: p.content,
      }
      const result = await applyBlockEditProposal(editor, insertProposal)
      if (!result.success) {
        _updateLocalProposalToolCall(proposal, 'failed')
        _decisionRecord.set(index, {
          type: 'rejected',
          message: `Document creation failed: ${result.error}`,
        })
        return
      }

      _updateLocalProposalToolCall(proposal, 'completed')
      return
    }

    const blockProposal = { ...proposal } as BlockEditProposal
    if (decision.type === 'edited' && decision.editedArgs) {
      const normalizedEditedArgs = _normalizeEditedArgsForProposal(blockProposal, decision.editedArgs)
      decision.editedArgs = normalizedEditedArgs
      if (typeof normalizedEditedArgs.new_content === 'string') {
        blockProposal.newContent = normalizedEditedArgs.new_content
      }
      if (typeof normalizedEditedArgs.new_blocks === 'string') {
        blockProposal.newContent = normalizedEditedArgs.new_blocks
      }
    }

    const result = await _applyBlockProposalToTarget(blockProposal)
    if (!result.success) {
      _updateLocalProposalToolCall(proposal, 'failed')
      _decisionRecord.set(index, {
        type: 'rejected',
        message: _buildProposalFailureMessage(blockProposal, result.error ?? 'Unknown apply error.'),
      })
      return
    }

    _updateLocalProposalToolCall(proposal, 'completed')
  }

  async function _flushReviewedBatch() {
    for (const index of _sortedDecisionIndexes()) {
      await _applyRecordedDecision(index)
    }
  }

  /**
   * Check if all actions in the current interrupt batch are resolved.
   * If so, build the ordered decisions array and send a single ai:resume call.
   * decisions[i] corresponds to actionRequests[i] — no proposalId needed.
   */
  async function _maybeFlushResume() {
    const threadId = _interruptedThreadId.value
    const count = _interruptActionCount.value
    if (!threadId || count === 0) return

    // Check if every action index has a decision record
    if (_decisionRecord.size < count) return

    await _flushReviewedBatch()

    // Build ordered decisions array by index (aligns with LangGraph HITLResponse.decisions[])
    const decisions: ResumeDecision[] = Array.from({ length: count }, (_, i) => {
      const rec = _decisionRecord.get(i)!
      return {
        type: rec.type,
        editedArgs: rec.editedArgs,
        message: rec.type === 'rejected' ? (rec.message ?? 'User rejected.') : undefined,
      }
    })

    _threadRunState.value = 'streaming'
    isResumingReviewedEdits.value = true
    _currentThreadId.value = threadId
    _currentTurnId.value = _interruptedTurnId.value
    _ensureLiveTurn({
      threadId,
      turnId: _interruptedTurnId.value,
      state: 'resuming',
      startedAt: _liveTurn.value?.startedAt,
    })
    _interruptedThreadId.value = null
    _interruptedTurnId.value = null
    _interruptActionCount.value = 0
    _decisionRecord.clear()
    _proposalIndexMap.clear()
    _proposalBatch.clear()

    window.electronAPI.aiResume?.({ threadId, decisions })

    const liveTurn = _ensureLiveTurn({ threadId, state: 'resuming' })
    if (liveTurn) {
      liveTurn.proposals = []
      _liveTurn.value = { ...liveTurn }
    }
  }

  async function approveEditProposal(proposalId: string) {
    const proposal = _findProposal(proposalId)
    if (!proposal) return
    // Resolve 0-based index via stable map (findIndex would shift after prior removals)
    const proposalIndex = _proposalIndexMap.get(proposalId) ?? -1
    if (proposalIndex >= 0) {
      _decisionRecord.set(proposalIndex, { type: 'approved' })
    }
    _removePendingProposal(proposalId)
    await _maybeFlushResume()
  }

  /**
   * Edit decision: apply user-modified content to the editor, then resume with edited args.
   * The editedArgs must be the full modified tool arguments (e.g. { block_id, new_content }).
   */
  async function editAndApproveProposal(
    proposalId: string,
    editedArgs: Record<string, unknown>,
  ) {
    const proposal = _findProposal(proposalId)
    if (!proposal || proposal.kind !== 'block') return
    const proposalIndex = _proposalIndexMap.get(proposalId) ?? -1
    const normalizedEditedArgs = _normalizeEditedArgsForProposal(proposal, editedArgs)

    // Build a modified proposal from editedArgs and apply it
    const blockProposal = { ...proposal } as BlockEditProposal
    if (typeof normalizedEditedArgs.new_content === 'string') {
      blockProposal.newContent = normalizedEditedArgs.new_content
    }
    if (typeof normalizedEditedArgs.new_blocks === 'string') {
      blockProposal.newContent = normalizedEditedArgs.new_blocks
    }

    // Update the displayed proposal content in pending list
    {
      const liveTurn = _ensureLiveTurn()
      if (liveTurn) {
        liveTurn.proposals = liveTurn.proposals.map(p =>
          p.id === proposalId ? { ...blockProposal, wasEdited: true } : p
        )
        _liveTurn.value = { ...liveTurn }
      }
    }

    if (proposalIndex >= 0) _decisionRecord.set(proposalIndex, { type: 'edited', editedArgs: normalizedEditedArgs })
    _removePendingProposal(proposalId)
    await _maybeFlushResume()
  }

  async function rejectEditProposal(proposalId: string, message?: string) {
    const proposalIndex = _proposalIndexMap.get(proposalId) ?? -1
    if (proposalIndex >= 0) {
      _decisionRecord.set(proposalIndex, { type: 'rejected', message })
    }
    _updateLocalProposalToolCall(proposalId, 'rejected')
    _removePendingProposal(proposalId)
    await _maybeFlushResume()
  }

  async function requestProposalRework(proposalId: string, reason: string) {
    const currentIndex = _proposalIndexMap.get(proposalId) ?? -1
    if (currentIndex >= 0) {
      _decisionRecord.set(currentIndex, {
        type: 'rejected',
        message: `User requested a revision for this edit. Follow this feedback and propose an updated change: ${reason}`,
      })
    }
    _updateLocalProposalToolCall(proposalId, 'rejected')

    for (const proposal of pendingEditProposals.value) {
      if (proposal.id === proposalId) continue
      const index = _proposalIndexMap.get(proposal.id) ?? -1
      if (index >= 0 && !_decisionRecord.has(index)) {
        _decisionRecord.set(index, {
          type: 'rejected',
          message: 'Stop the current edit batch after addressing the user feedback and propose the next revision in a new round.',
        })
      }
      _updateLocalProposalToolCall(proposal.id, 'rejected')
    }

    const liveTurn = _ensureLiveTurn()
    if (liveTurn) {
      liveTurn.proposals = []
      _liveTurn.value = { ...liveTurn }
    }

    await _maybeFlushResume()
  }

  async function endReviewRound(fromProposalId?: string) {
    const endMessage = 'The user ended this review round. Do not make further edits in this batch. Briefly summarize the outcome and finish.'
    for (const proposal of pendingEditProposals.value) {
      const index = _proposalIndexMap.get(proposal.id) ?? -1
      if (index >= 0 && !_decisionRecord.has(index)) {
        _decisionRecord.set(index, { type: 'rejected', message: endMessage })
      }
      _updateLocalProposalToolCall(proposal.id, 'rejected')
    }

    if (fromProposalId && !pendingEditProposals.value.some(proposal => proposal.id === fromProposalId)) {
      const index = _proposalIndexMap.get(fromProposalId) ?? -1
      if (index >= 0 && !_decisionRecord.has(index)) {
        _decisionRecord.set(index, { type: 'rejected', message: endMessage })
      }
    }

    const liveTurn = _ensureLiveTurn()
    if (liveTurn) {
      liveTurn.proposals = []
      _liveTurn.value = { ...liveTurn }
    }

    await _maybeFlushResume()
  }

  /** All currently pending proposals (source of truth is pendingEditProposals) */
  const allPendingProposals = computed<EditProposal[]>(() => pendingEditProposals.value)

  function _reviewEntryForDecision(
    proposal: EditProposal,
    decision: { type: 'approved' | 'edited' | 'rejected'; editedArgs?: Record<string, unknown>; message?: string },
  ): ProposalReviewEntry {
    if (decision.type === 'approved') {
      return { proposal, state: 'approved', label: '已确认应用', tone: 'green' }
    }
    if (decision.type === 'edited') {
      return { proposal, state: 'edited', label: '已确认编辑后应用', tone: 'blue' }
    }

    const message = decision.message ?? ''
    if (message.includes('requested a revision')) {
      return { proposal, state: 'rework', label: '已退回重做', tone: 'amber' }
    }
    if (message.includes('Stop the current edit batch')) {
      return { proposal, state: 'paused', label: '后续已暂停', tone: 'gray' }
    }
    if (message.includes('ended this review round')) {
      return { proposal, state: 'ended', label: '本轮已结束', tone: 'gray' }
    }
    return { proposal, state: 'rejected', label: '已跳过', tone: 'gray' }
  }

  const reviewedBatchEntries = computed<ProposalReviewEntry[]>(() => {
    return Array.from(_decisionRecord.entries())
      .sort((a, b) => a[0] - b[0])
      .flatMap(([index, decision]) => {
        const proposal = _proposalBatch.get(index)
        if (!proposal) return []
        return [_reviewEntryForDecision(proposal, decision)]
      })
  })

  const reviewBatchSummary = computed<ProposalReviewSummary | null>(() => {
    const total = _proposalBatch.size
    if (!total) return null

    const summary: ProposalReviewSummary = {
      total,
      resolved: _decisionRecord.size,
      pending: total - _decisionRecord.size,
      approved: 0,
      edited: 0,
      rework: 0,
      paused: 0,
      ended: 0,
      rejected: 0,
    }

    for (const entry of reviewedBatchEntries.value) {
      summary[entry.state] += 1
    }

    return summary
  })

  const streamingPreviewMessage = computed<ThreadMessage | null>(() => {
    const liveTurn = _liveTurn.value
    if (!liveTurn) return null
    const contentBlocks: MessageContentBlock[] = []
    const toolCalls: AiToolCall[] = []
    let content = ''

    for (const block of liveTurn.blocks) {
      if (block.type === 'text' && block.text) {
        contentBlocks.push({ type: 'text', text: block.text })
        content += block.text
        continue
      }
      if (block.type === 'tool_call') {
        if (isResumingReviewedEdits.value && block.toolCall.kind === 'edit') {
          continue
        }
        contentBlocks.push({ type: 'tool_call', toolCallId: block.toolCall.id })
        toolCalls.push(block.toolCall)
      }
    }

    if (liveTurn.currentText) {
      contentBlocks.push({ type: 'text', text: liveTurn.currentText })
      content += liveTurn.currentText
    }

    if (!contentBlocks.length && !liveTurn.thinkingText) {
      return null
    }

    return _normalizeMessageForDisplay({
      id: 'streaming-preview',
      role: 'assistant',
      turnId: liveTurn.turnId ?? undefined,
      content,
      timestamp: Date.now(),
      thinkingContent: liveTurn.thinkingText || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      contentBlocks: contentBlocks.length ? contentBlocks : undefined,
    })
  })

  const persistedMessages = computed<ThreadMessage[]>(() => activeThread.value?.messages ?? [])

  const displayThread = computed<AiDisplayThread>(() => {
    const entries: AiDisplayMessageEntry[] = persistedMessages.value.map(message => ({
      key: message.id,
      message,
    }))

    if (_threadRunState.value === 'streaming' && streamingPreviewMessage.value) {
      entries.push({
        key: `preview:${streamingPreviewMessage.value.id}:${streamingPreviewMessage.value.turnId ?? 'live'}`,
        message: streamingPreviewMessage.value,
        isPreview: true,
      })
    }

    return {
      persistedMessages: persistedMessages.value,
      messages: entries,
    }
  })

  const displayMessages = computed<AiDisplayMessageEntry[]>(() => displayThread.value.messages)

  const persistedAssistantMessageIds = computed<string[]>(() =>
    persistedMessages.value
      .filter(message => message.role === 'assistant')
      .map(message => message.id)
  )

  const latestPersistedAssistantMessageId = computed<string | null>(() => {
    const ids = persistedAssistantMessageIds.value
    return ids.length ? ids[ids.length - 1]! : null
  })

  async function approveAllProposals() {
    const ids = [...pendingEditProposals.value].map(p => p.id)
    for (const id of ids) await approveEditProposal(id)
  }

  async function rejectAllProposals() {
    await endReviewRound()
  }

  function cancelStreaming() {
    const tid = _currentThreadId.value ?? _interruptedThreadId.value
    if (tid) {
      window.electronAPI.aiCancel?.(tid)
    }
    _threadRunState.value = 'idle'
    _currentThreadId.value = null
    _currentTurnId.value = null
    _interruptedThreadId.value = null
    _interruptedTurnId.value = null
    _interruptActionCount.value = 0
    isResumingReviewedEdits.value = false
    _decisionRecord.clear()
    _proposalIndexMap.clear()
    _proposalBatch.clear()
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

    // Stream chunks: text, thinking, tool call start/end
    window.electronAPI.onAiStreamChunk?.((chunk: StreamChunkEvent) => {
      const liveTurn = _ensureLiveTurn({ state: _threadRunState.value === 'interrupted' ? 'interrupted' : 'streaming' })
      if (!liveTurn) return

      if (chunk.type === 'text' && chunk.delta) {
        liveTurn.text += chunk.delta
        liveTurn.currentText += chunk.delta
        _liveTurn.value = { ...liveTurn }
      } else if (chunk.type === 'thinking' && chunk.delta) {
        liveTurn.thinkingText += chunk.delta
        _liveTurn.value = { ...liveTurn }
      } else if (chunk.type === 'tool_call_start' && chunk.toolCall) {
        if (liveTurn.currentText) {
          liveTurn.blocks = [...liveTurn.blocks, { type: 'text', text: liveTurn.currentText }]
          liveTurn.currentText = ''
        }
        const enriched: AiToolCall = {
          ...chunk.toolCall,
          kind: inferToolKind(chunk.toolCall.name),
        }
        liveTurn.blocks = [...liveTurn.blocks, { type: 'tool_call', toolCall: enriched }]
        liveTurn.toolName = chunk.toolName ?? null
        _liveTurn.value = { ...liveTurn }
      } else if (chunk.type === 'tool_call_end' && chunk.toolCallId && chunk.toolCall) {
        liveTurn.blocks = liveTurn.blocks.map(b =>
          b.type === 'tool_call' && b.toolCall.id === chunk.toolCallId
            ? { type: 'tool_call', toolCall: { ...b.toolCall, status: chunk.toolCall!.status, result: chunk.toolCall!.result, isError: chunk.toolCall!.isError } }
            : b
        )
        liveTurn.toolName = null
        _liveTurn.value = { ...liveTurn }
      }
    })

    // New atomic interrupt event — replaces the old two-event sequence
    window.electronAPI.onAiRunInterrupted?.((e: RunInterruptedEvent) => {
      _threadRunState.value = 'interrupted'
      _interruptedThreadId.value = e.threadId
      _interruptedTurnId.value = e.turnId ?? _currentTurnId.value
      _interruptActionCount.value = e.proposals.length
      isResumingReviewedEdits.value = false
      _decisionRecord.clear()
      _proposalIndexMap.clear()
      _proposalBatch.clear()

      _startLiveTurn({
        threadId: e.threadId,
        turnId: e.turnId ?? _currentTurnId.value,
        state: 'interrupted',
        startedAt: _liveTurn.value?.turnId === (e.turnId ?? _currentTurnId.value)
          ? _liveTurn.value.startedAt
          : undefined,
      })

      // Register proposals as pending (replace, not append — HITL is serial)
      if (_liveTurn.value) {
        _liveTurn.value = {
          ..._liveTurn.value,
          proposals: e.proposals,
        }
      }
      // Build stable index map so approve/reject can find the original index
      // even after earlier proposals have been removed from pendingEditProposals.
      e.proposals.forEach((p, i) => {
        _proposalIndexMap.set(p.id, i)
        _proposalBatch.set(i, p)
      })

      // Preserve partialMessage locally before checkpointer reload —
      // at interrupt time the checkpointer may not yet have committed the
      // in-progress assistant message, so we keep the local copy.
      const t = activeThread.value
      if (t && t.id === e.threadId) {
        let updated = t
        if (e.partialMessage) {
          const alreadyPresent = (updated.messages ?? []).some(m => m.id === e.partialMessage!.id)
          if (!alreadyPresent) {
            updated = appendMessage(updated, _normalizeMessageForDisplay(e.partialMessage))
          }
        }
        updateThread({ ...updated, messagesLoaded: false })

        // Sync from checkpointer in background; skip replacement if it returns empty
        // (means the checkpoint hasn't been committed yet — keep local state).
        window.electronAPI.aiGetThreadMessages?.(e.threadId)
          .then(messages => {
            if (!messages?.length) return
            const current = activeThread.value
            if (current && current.id !== e.threadId) return
            // Guard: checkpoint reload must not reduce local message count.
            // A stale async reload (from an earlier interrupt) could wipe partialMessages
            // appended by a later interrupt. Messages only grow within a run.
            if (messages.length < (current?.messages?.length ?? 0)) return
            const normalizedMessages = _normalizeMessagesForDisplay(messages)
            if (e.turnId) {
              for (let i = normalizedMessages.length - 1; i >= 0; i--) {
                const message = normalizedMessages[i]
                if (message?.role === 'assistant') {
                  normalizedMessages[i] = { ...message, turnId: message.turnId ?? e.turnId }
                  break
                }
              }
            }
            updateThread({ ...current!, messages: normalizedMessages, messagesLoaded: true })
          })
          .catch(() => {/* ignore */ })
      }
    })

    // Run completed (always a full completion — no more isPartial)
    window.electronAPI.onAiRunDone?.((e: RunDoneEvent) => {
      _threadRunState.value = 'idle'
      _clearLiveTurn()
      _currentThreadId.value = null
      _currentTurnId.value = null
      _interruptedThreadId.value = null
      _interruptedTurnId.value = null
      _interruptActionCount.value = 0
      isResumingReviewedEdits.value = false
      _decisionRecord.clear()
      _proposalIndexMap.clear()
      _proposalBatch.clear()

      // Reload messages from checkpointer (single source of truth).
      // Skip reload if onAiRunError already handled this run's error —
      // the checkpointer won't have the error message and would overwrite it.
      const t = activeThread.value
      if (t && t.id === e.threadId && !_currentRunHasError) {
        window.electronAPI.aiGetThreadMessages?.(e.threadId)
          .then(messages => {
            if (!messages?.length) return  // guard: keep local messages if checkpointer returns empty
            const current = activeThread.value
            if (current && current.id === e.threadId) {
              updateThread({ ...current, messages: _normalizeMessagesForDisplay(messages), messagesLoaded: true })
            }
          })
          .catch(() => {/* ignore */ })
      }
    })

    window.electronAPI.onAiRunError?.((e: RunErrorEvent) => {
      _currentRunHasError = true
      _threadRunState.value = 'idle'
      _clearLiveTurn()
      _currentThreadId.value = null
      _currentTurnId.value = null
      _interruptedThreadId.value = null
      _interruptedTurnId.value = null
      _interruptActionCount.value = 0
      isResumingReviewedEdits.value = false
      _decisionRecord.clear()
      _proposalIndexMap.clear()
      _proposalBatch.clear()

      notify.error(`AI 错误: ${e.error}`)

      const errThread = activeThread.value
      if (errThread && errThread.id === e.threadId) {
        const errMsg: ThreadMessage = {
          id: `msg-${nanoid(8)}`,
          role: 'assistant',
          turnId: e.turnId,
          content: e.error,
          isError: true,
          timestamp: Date.now(),
        }
        updateThread(appendMessage({ ...errThread, hasError: true }, errMsg))
      }
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
    allPendingProposals,
    approveAllProposals,
    rejectAllProposals,
    endReviewRound,
    cancelStreaming,
    setDraftInput,
    init,
    teardown,
  }
})
