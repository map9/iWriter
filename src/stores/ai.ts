import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type {
  AiThread,
  AiProviderConfig,
  AiSettings,
  BlockEditProposal,
  FileCreateProposal,
  EditProposal,
  ThreadMessage,
  SendContext,
  AiToolCall,
} from '@/types/ai'
import { inferToolKind, DEFAULT_AI_SETTINGS } from '@/types/ai'
import { PROVIDER_PRESETS, type ProviderPreset } from '@/ai/providers/provider-presets'
import { createThread, appendMessage, createMessage } from '@/ai/thread/Thread'
import { applyBlockEditProposal } from '@/ai/edit-agent/BlockEditApplier'
import { buildSnapshot, buildEditorStateBlock } from '@/ai/thread/ContextBuilder'
import { useAppStore } from '@/stores/app'
import type { Editor } from '@tiptap/core'
import { notify } from '@/utils/notifications'
import { nanoid } from 'nanoid'
import { pathUtils } from '@/utils/pathUtils'
import type {
  StreamChunkEvent,
  RunInterruptedEvent,
  RunDoneEvent,
  RunErrorEvent,
  ResumeDecision,
} from '@/types/ai-ipc'

// ── Settings localStorage helpers ──────────────────────────────────────────
const _STORAGE_KEY_SETTINGS = 'iwriter-ai-settings'
function _loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(_STORAGE_KEY_SETTINGS)
    if (!raw) return { ...DEFAULT_AI_SETTINGS }
    return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) }
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

  /** Models available for the current provider (for model picker) */
  const availableModels = computed<string[]>(() => {
    const config = activeProviderConfig.value
    if (!config) return []
    if (config.models?.length) return config.models
    const preset = PROVIDER_PRESETS.find(p => p.id === config.presetId)
    const presetModels = preset?.models ?? []
    return presetModels.length ? presetModels : [config.defaultModelId].filter(Boolean)
  })

  /** Think modes for the current LLM provider */
  const availableThinkModes = computed<string[]>(() => {
    const config = activeProviderConfig.value
    if (!config) return []
    return config.thinkModes ?? []
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
    const config = activeProviderConfig.value
    if (config) {
      updateProviderConfig(config.id, { defaultModelId: modelId })
    }
    if (activeThread.value) {
      updateThread({ ...activeThread.value, modelId })
    }
  }

  /** Persist selected mode (think mode) to provider config and current thread */
  function setCurrentMode(mode: string) {
    const config = activeProviderConfig.value
    if (config) {
      updateProviderConfig(config.id, { lastSelectedMode: mode })
    }
    if (activeThread.value) {
      updateThread({ ...activeThread.value, thinkMode: mode })
    }
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
      settings.value.defaultProfile
    )
    threads.value.unshift(thread)
    activeThreadId.value = thread.id
    _localOnlyThreadIds.add(thread.id)
    return thread
  }

  async function selectThread(id: string) {
    // Clean up any local-only empty threads before switching
    if (activeThreadId.value !== id) {
      _purgeEmptyThreads()
    }
    activeThreadId.value = id
    const thread = threads.value.find(t => t.id === id)
    if (thread && !thread.messagesLoaded) {
      try {
        const messages = await window.electronAPI.aiGetThreadMessages?.(id)
        if (messages?.length) {
          updateThread({ ...thread, messages, messagesLoaded: true })
        } else {
          // No messages yet (or empty thread) — mark loaded to avoid repeated fetches
          updateThread({ ...thread, messages: messages ?? [], messagesLoaded: true })
        }
      } catch { /* ignore — messages are display-only */ }
    }
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
    const idx = threads.value.findIndex(t => t.id === thread.id)
    if (idx >= 0) {
      threads.value[idx] = thread
    }
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

  const streamingText = ref('')
  const streamingCurrentText = ref('')
  const streamingBlocks = ref<StreamingBlock[]>([])
  const streamingThinkingText = ref('')
  const streamingToolName = ref<string | null>(null)
  const pendingEditProposals = ref<EditProposal[]>([])

  /** Thread ID of the currently active (streaming or interrupted) run. */
  const _currentThreadId = ref<string | null>(null)

  // ── HITL Interrupt State ───────────────────────────────────────────────────

  /** ThreadId currently in 'interrupted' state. */
  const _interruptedThreadId = ref<string | null>(null)

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
  }>()

  /**
   * Stable index map: proposalId → 0-based index in the original interrupt batch.
   * Populated at interrupt time and cleared after flush/cancel.
   * Guards against index shifts caused by removing proposals from pendingEditProposals.
   */
  const _proposalIndexMap = new Map<string, number>()

  /**
   * Set to true by onAiRunError for the current run; cleared when a new run starts.
   * Used by onAiRunDone to skip the checkpointer reload when the run already errored
   * (onAiRunError already added the error message to the thread).
   */
  let _currentRunHasError = false

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
    const snapshot = activeEditor
      ? buildSnapshot(activeEditor, undefined, currentFilePath ?? undefined)
      : null

    const editorStateResult = buildEditorStateBlock(thread, snapshot, {
      filePath: currentFilePath,
      isDirty: activeTab?.isDirty ?? false,
      folderPath: appStore.currentFolder ?? null,
      openTabs,
      textFilePaths: sendContext?.textFilePaths ?? [],
      attachedDirectories: sendContext?.directories ?? [],
    })

    // Persist delta tracking fields back to the thread
    if (Object.keys(editorStateResult.threadUpdate).length > 0) {
      thread = { ...thread, ...editorStateResult.threadUpdate }
      updateThread(thread)
    }

    // Start streaming state
    _currentRunHasError = false
    _threadRunState.value = 'streaming'
    streamingText.value = ''
    streamingCurrentText.value = ''
    streamingBlocks.value = []
    streamingThinkingText.value = ''
    streamingToolName.value = null
    pendingEditProposals.value = []

    try {
      const result = await window.electronAPI.aiSendMessage?.({
        threadId: thread.id,
        userText,
        profile: thread.profile,
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
      const msg = err instanceof Error ? err.message : String(err)
      notify.error(`AI 错误: ${msg}`)
      let errThread = activeThread.value
      if (errThread) {
        const errMsg: ThreadMessage = {
          id: `msg-${nanoid(8)}`,
          role: 'assistant',
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
      const currentFilePath = appStore.activeTab?.path
      const isActiveFile = !!currentFilePath &&
        pathUtils.normalize(currentFilePath) === pathUtils.normalize(proposal.filePath)

      if (!isActiveFile) {
        const { UnifiedDocumentAccess } = await import('@/ai/edit-agent/UnifiedDocumentAccess')
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

    const { UnifiedDocumentAccess } = await import('@/ai/edit-agent/UnifiedDocumentAccess')
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
    _interruptActionCount.value = 0
    _decisionRecord.clear()
    _proposalIndexMap.clear()
    pendingEditProposals.value = []
  }

  /**
   * Find a proposal by ID — searches pendingEditProposals.
   * (thread.messages no longer carry editProposals as they come from the checkpointer)
   */
  function _findProposal(proposalId: string): EditProposal | undefined {
    return pendingEditProposals.value.find(p => p.id === proposalId)
  }

  /**
   * Check if all actions in the current interrupt batch are resolved.
   * If so, build the ordered decisions array and send a single ai:resume call.
   * decisions[i] corresponds to actionRequests[i] — no proposalId needed.
   */
  function _maybeFlushResume() {
    const threadId = _interruptedThreadId.value
    const count = _interruptActionCount.value
    if (!threadId || count === 0) return

    // Check if every action index has a decision record
    if (_decisionRecord.size < count) return

    // Build ordered decisions array by index (aligns with LangGraph HITLResponse.decisions[])
    const decisions: ResumeDecision[] = Array.from({ length: count }, (_, i) => {
      const rec = _decisionRecord.get(i)!
      return {
        type: rec.type,
        editedArgs: rec.editedArgs,
        message: rec.type === 'rejected' ? 'User rejected.' : undefined,
      }
    })

    _threadRunState.value = 'streaming'
    _currentThreadId.value = threadId
    _interruptedThreadId.value = null
    _interruptActionCount.value = 0
    _decisionRecord.clear()
    _proposalIndexMap.clear()

    window.electronAPI.aiResume?.({ threadId, decisions })

    pendingEditProposals.value = []
  }

  async function approveEditProposal(proposalId: string) {
    const proposal = _findProposal(proposalId)
    if (!proposal) return
    // Resolve 0-based index via stable map (findIndex would shift after prior removals)
    const proposalIndex = _proposalIndexMap.get(proposalId) ?? -1

    if (proposal.kind === 'create_file') {
      const p = proposal as FileCreateProposal
      const { DocumentType } = await import('@/types/document-type')
      appStore.createTab(p.filename, undefined, DocumentType.MARKDOWN_EDITOR)

      const getEditor = (): Editor | undefined =>
        appStore.activeTab?.editorInstance as Editor | undefined

      const { nextTick } = await import('vue')
      for (let i = 0; i < 20; i++) {
        await nextTick()
        if (getEditor()) break
      }

      const editor = getEditor()
      if (editor) {
        const insertProposal: BlockEditProposal = {
          id:           proposalId,
          kind:         'block',
          type:         'insert',
          status:       'pending',
          afterNodeId:  '0',
          newContent:   p.content,
        }
        const result = await applyBlockEditProposal(editor, insertProposal)
        if (result.success) {
          if (proposalIndex >= 0) _decisionRecord.set(proposalIndex, { type: 'approved' })
          pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
          notify.success(`文档"${p.filename}"已创建`)
        } else {
          notify.error(`内容注入失败: ${result.error}`)
        }
      } else {
        notify.error('编辑器未就绪，请手动粘贴内容')
      }
      _maybeFlushResume()
      return
    }

    const blockProposal = proposal as BlockEditProposal
    const result = await _applyBlockProposalToTarget(blockProposal)
    if (result.success) {
      if (proposalIndex >= 0) _decisionRecord.set(proposalIndex, { type: 'approved' })
      pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
      notify.success(blockProposal.filePath ? '文件编辑已应用' : '编辑已应用')
    } else {
      notify.error(`${blockProposal.filePath ? '文件编辑失败' : '应用编辑失败'}: ${result.error}`)
      return
    }

    _maybeFlushResume()
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

    // Build a modified proposal from editedArgs and apply it
    const blockProposal = { ...proposal } as BlockEditProposal
    if (typeof editedArgs.new_content === 'string') {
      blockProposal.newContent = editedArgs.new_content
    }
    if (typeof editedArgs.new_blocks === 'string') {
      blockProposal.newContent = editedArgs.new_blocks
    }

    // Update the displayed proposal content in pending list
    pendingEditProposals.value = pendingEditProposals.value.map(p =>
      p.id === proposalId ? { ...blockProposal, wasEdited: true } : p
    )

    const result = await _applyBlockProposalToTarget(blockProposal)
    if (result.success) {
      if (proposalIndex >= 0) _decisionRecord.set(proposalIndex, { type: 'edited', editedArgs })
      pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
      notify.success(blockProposal.filePath ? '文件编辑（已修改）已应用' : '编辑（已修改）已应用')
    } else {
      notify.error(`${blockProposal.filePath ? '文件编辑失败' : '应用编辑失败'}: ${result.error}`)
      return
    }

    _maybeFlushResume()
  }

  function rejectEditProposal(proposalId: string) {
    // Record the rejection decision for this specific proposal, then let
    // _maybeFlushResume decide whether all decisions are collected (consistent
    // with the approve path). The system prompt instructs the LLM not to retry
    // rejected proposals, preventing the infinite-loop concern that motivated
    // the previous aiCancel approach.
    const proposalIndex = _proposalIndexMap.get(proposalId) ?? -1
    if (proposalIndex >= 0) {
      _decisionRecord.set(proposalIndex, { type: 'rejected' })
    }
    pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)

    // If some proposals in the same batch were already approved, inform the user
    // that those applied edits are preserved even though this one was skipped.
    const hasApproved = Array.from(_decisionRecord.values()).some(
      r => r.type === 'approved' || r.type === 'edited'
    )
    if (hasApproved) {
      notify.info('已跳过此修改，已应用的修改保留在文档中')
    }

    _maybeFlushResume()
  }

  /** All currently pending proposals (source of truth is pendingEditProposals) */
  const allPendingProposals = computed<EditProposal[]>(() => pendingEditProposals.value)

  async function approveAllProposals() {
    const ids = [...pendingEditProposals.value].map(p => p.id)
    for (const id of ids) await approveEditProposal(id)
  }

  function rejectAllProposals() {
    // Record rejected decisions for all remaining undecided proposals, then flush.
    for (const proposal of pendingEditProposals.value) {
      const index = _proposalIndexMap.get(proposal.id) ?? -1
      if (index >= 0 && !_decisionRecord.has(index)) {
        _decisionRecord.set(index, { type: 'rejected' })
      }
    }
    pendingEditProposals.value = []
    _maybeFlushResume()
  }

  function cancelStreaming() {
    const tid = _currentThreadId.value ?? _interruptedThreadId.value
    if (tid) {
      window.electronAPI.aiCancel?.(tid)
    }
    _threadRunState.value = 'idle'
    _currentThreadId.value = null
    _interruptedThreadId.value = null
    _interruptActionCount.value = 0
    _decisionRecord.clear()
    _proposalIndexMap.clear()
    streamingThinkingText.value = ''
    streamingText.value = ''
    streamingCurrentText.value = ''
    streamingBlocks.value = []
    streamingToolName.value = null
    pendingEditProposals.value = []
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
              updateThread({ ...mainThreads[0]!, messages, messagesLoaded: true })
            }
          } catch { /* ignore */ }
        }
      }
    }).catch(() => {/* ignore — main process may not be ready yet */})

    // Stream chunks: text, thinking, tool call start/end
    window.electronAPI.onAiStreamChunk?.((chunk: StreamChunkEvent) => {
      if (chunk.type === 'text' && chunk.delta) {
        streamingText.value += chunk.delta
        streamingCurrentText.value += chunk.delta
      } else if (chunk.type === 'thinking' && chunk.delta) {
        streamingThinkingText.value += chunk.delta
      } else if (chunk.type === 'tool_call_start' && chunk.toolCall) {
        if (streamingCurrentText.value) {
          streamingBlocks.value = [...streamingBlocks.value, { type: 'text', text: streamingCurrentText.value }]
          streamingCurrentText.value = ''
        }
        const enriched: AiToolCall = {
          ...chunk.toolCall,
          kind: inferToolKind(chunk.toolCall.name),
        }
        streamingBlocks.value = [...streamingBlocks.value, { type: 'tool_call', toolCall: enriched }]
        streamingToolName.value = chunk.toolName ?? null
      } else if (chunk.type === 'tool_call_end' && chunk.toolCallId && chunk.toolCall) {
        streamingBlocks.value = streamingBlocks.value.map(b =>
          b.type === 'tool_call' && b.toolCall.id === chunk.toolCallId
            ? { type: 'tool_call', toolCall: { ...b.toolCall, status: chunk.toolCall!.status, result: chunk.toolCall!.result, isError: chunk.toolCall!.isError } }
            : b
        )
        streamingToolName.value = null
      }
    })

    // New atomic interrupt event — replaces the old two-event sequence
    window.electronAPI.onAiRunInterrupted?.((e: RunInterruptedEvent) => {
      _threadRunState.value = 'interrupted'
      _interruptedThreadId.value = e.threadId
      _interruptActionCount.value = e.proposals.length
      _decisionRecord.clear()
      _proposalIndexMap.clear()

      streamingText.value = ''

      // Clear streaming display state
      streamingToolName.value = null
      streamingThinkingText.value = ''
      streamingBlocks.value = []
      streamingCurrentText.value = ''

      // Register proposals as pending (replace, not append — HITL is serial)
      pendingEditProposals.value = e.proposals
      // Build stable index map so approve/reject can find the original index
      // even after earlier proposals have been removed from pendingEditProposals.
      e.proposals.forEach((p, i) => _proposalIndexMap.set(p.id, i))

      // Preserve partialMessage locally before checkpointer reload —
      // at interrupt time the checkpointer may not yet have committed the
      // in-progress assistant message, so we keep the local copy.
      const t = activeThread.value
      if (t && t.id === e.threadId) {
        let updated = t
        if (e.partialMessage) {
          const alreadyPresent = (updated.messages ?? []).some(m => m.id === e.partialMessage!.id)
          if (!alreadyPresent) {
            updated = appendMessage(updated, e.partialMessage)
          }
        }
        updateThread({ ...updated, messagesLoaded: false })

        // Sync from checkpointer in background; skip replacement if it returns empty
        // (means the checkpoint hasn't been committed yet — keep local state).
        window.electronAPI.aiGetThreadMessages?.(e.threadId)
          .then(messages => {
            if (!messages?.length) return
            const current = activeThread.value
            if (current && current.id === e.threadId) {
              updateThread({ ...current, messages, messagesLoaded: true })
            }
          })
          .catch(() => {/* ignore */ })
      }
    })

    // Run completed (always a full completion — no more isPartial)
    window.electronAPI.onAiRunDone?.((e: RunDoneEvent) => {
      streamingText.value = ''

      _threadRunState.value = 'idle'
      streamingToolName.value = null
      streamingThinkingText.value = ''
      streamingBlocks.value = []
      streamingCurrentText.value = ''
      _currentThreadId.value = null
      _interruptedThreadId.value = null
      _interruptActionCount.value = 0
      _decisionRecord.clear()
      _proposalIndexMap.clear()
      pendingEditProposals.value = []

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
              updateThread({ ...current, messages, messagesLoaded: true })
            }
          })
          .catch(() => {/* ignore */ })
      }
    })

    window.electronAPI.onAiRunError?.((e: RunErrorEvent) => {
      _currentRunHasError = true
      _threadRunState.value = 'idle'
      streamingText.value = ''
      streamingCurrentText.value = ''
      streamingBlocks.value = []
      streamingThinkingText.value = ''
      streamingToolName.value = null
      _currentThreadId.value = null
      _interruptedThreadId.value = null
      _interruptActionCount.value = 0
      _decisionRecord.clear()

      notify.error(`AI 错误: ${e.error}`)

      const errThread = activeThread.value
      if (errThread && errThread.id === e.threadId) {
        const errMsg: ThreadMessage = {
          id: `msg-${nanoid(8)}`,
          role: 'assistant',
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
    availableModels,
    availableThinkModes,
    addProviderConfig,
    updateProviderConfig,
    removeProviderConfig,
    setActiveProvider,
    setCurrentModelId,
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

    // Run state
    isStreaming,
    isInterrupted,

    // Streaming display state
    streamingText,
    streamingCurrentText,
    streamingBlocks,
    streamingThinkingText,
    streamingToolName,
    pendingEditProposals,

    // Actions
    sendMessage,
    approveEditProposal,
    editAndApproveProposal,
    rejectEditProposal,
    allPendingProposals,
    approveAllProposals,
    rejectAllProposals,
    cancelStreaming,
    init,
    teardown,
  }
})
