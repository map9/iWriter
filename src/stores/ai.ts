import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AiThread,
  AiProviderConfig,
  AiSettings,
  BlockEditProposal,
  FileCreateProposal,
  EditProposal,
  AiToolCall,
  AiToolResult,
  ThreadMessage,
  SendContext,
} from '@/types/ai'
import type { LMContentBlock } from '@/ai/providers/types'
import { PROVIDER_PRESETS, type ProviderPreset } from '@/ai/providers/provider-presets'
import { ThreadStore } from '@/ai/thread/ThreadStore'
import { createThread, appendMessage, createMessage } from '@/ai/thread/Thread'
import { getSystemPrompt, buildEditorStateBlock, getToolsForProfile } from '@/ai/thread/ContextBuilder'
import { providerRegistry } from '@/ai/providers/ProviderRegistry'
import { AgentRunner } from '@/ai/agent/AgentRunner'
import { createToolRegistry } from '@/ai/tools/registry'
import { applyBlockEditProposal } from '@/ai/edit-agent/BlockEditApplier'
import { buildSnapshot } from '@/ai/thread/ContextBuilder'
import { useAppStore } from '@/stores/app'
import type { Editor } from '@tiptap/core'
import type { AgentSession } from '@/ai/providers/types'
import { notify } from '@/utils/notifications'
import { nanoid } from 'nanoid'
import { pathUtils } from '@/utils/pathUtils'

/** File extension → MIME type map for binary attachments. */
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

export const useAiStore = defineStore('ai', () => {
  const appStore = useAppStore()

  // ── Settings & Provider Config ────────────────────────────────────────────
  const _initialSettings = ThreadStore.loadSettings()
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
    ThreadStore.saveSettings(_initialSettings)
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
    ThreadStore.saveSettings(settings.value)
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
    // Clear mode on the active thread so stale values from the previous provider
    // are not carried over to the new one. (Model is provider-level, not thread-level.)
    const thread = activeThread.value
    if (thread?.thinkMode) {
      updateThread({ ...thread, thinkMode: undefined })
    }
  }

  /** Persist selected model to provider config (model is provider-level, not thread-level) */
  function setCurrentModelId(modelId: string) {
    const config = activeProviderConfig.value
    if (config) {
      updateProviderConfig(config.id, { defaultModelId: modelId })
    }
  }

  /** Persist selected mode (agent mode / think mode) to provider config and current thread */
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
  const threads = ref<AiThread[]>(ThreadStore.loadThreads())
  const activeThreadId = ref<string | null>(threads.value[0]?.id ?? null)

  const activeThread = computed<AiThread | null>(() => {
    return threads.value.find(t => t.id === activeThreadId.value) ?? null
  })

  /** Remove threads that have no messages (empty sessions). */
  function _purgeEmptyThreads() {
    const empty = threads.value.filter(t => t.messages.length === 0)
    if (!empty.length) return
    for (const t of empty) ThreadStore.deleteThread(t.id)
    threads.value = threads.value.filter(t => t.messages.length > 0)
    // If active thread was purged, fall back to the first remaining one
    if (!threads.value.find(t => t.id === activeThreadId.value)) {
      activeThreadId.value = threads.value[0]?.id ?? null
    }
  }

  function createNewThread(): AiThread {
    // Clean up empty sessions before creating a new one
    _purgeEmptyThreads()
    const config = activeProviderConfig.value
    const thread = createThread(
      config?.id ?? '',
      config?.defaultModelId ?? '',
      settings.value.defaultProfile
    )
    threads.value.unshift(thread)
    activeThreadId.value = thread.id
    ThreadStore.saveThread(thread)
    return thread
  }

  function selectThread(id: string) {
    activeThreadId.value = id
  }

  function deleteThread(id: string) {
    threads.value = threads.value.filter(t => t.id !== id)
    ThreadStore.deleteThread(id)
    if (activeThreadId.value === id) {
      activeThreadId.value = threads.value[0]?.id ?? null
    }
  }

  function clearAllThreads() {
    threads.value = []
    activeThreadId.value = null
    ThreadStore.clearThreads()
  }

  function updateThread(thread: AiThread) {
    const idx = threads.value.findIndex(t => t.id === thread.id)
    if (idx >= 0) {
      threads.value[idx] = thread
    }
    ThreadStore.saveThread(thread)
  }

  // ── Streaming State ───────────────────────────────────────────────────────
  const isStreaming = ref(false)
  const streamingText = ref('')
  const streamingThinkingText = ref('')
  const streamingToolName = ref<string | null>(null)
  const pendingEditProposals = ref<EditProposal[]>([])

  /** The session used by the current streaming request (for cancel). */
  const _currentSession = ref<AgentSession | null>(null)

  // ── Tools Infrastructure ──────────────────────────────────────────────────
  // The snapshot is rebuilt each sendMessage call; the getter reads the latest one
  let _currentSnapshot: ReturnType<typeof buildSnapshot> | null = null
  const toolRegistry = createToolRegistry(
    () => _currentSnapshot,
    () => settings.value,
    () => appStore.currentFolder ?? null,
    () => appStore.activeTab?.path ?? null
  )

  // ── Send Message ──────────────────────────────────────────────────────────
  async function sendMessage(userText: string, sendContext?: SendContext): Promise<boolean> {
    if (isStreaming.value) return false
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

    // Append user message; clear any previous error flag
    const userMsg = createMessage('user', userText)
    thread = appendMessage(thread, userMsg)
    if (thread.hasError) thread = { ...thread, hasError: false }
    updateThread(thread)

    // Get context from active editor
    const activeTab = appStore.activeTab
    const editorInstance = activeTab?.editorInstance as Editor | undefined
    const currentFilePath = activeTab?.path ?? null

    // Record origin file on first message
    if (thread.originFilePath === undefined) {
      thread = { ...thread, originFilePath: currentFilePath }
      updateThread(thread)
    }

    // Build document view snapshot (used by EditorState block and tool registry)
    _currentSnapshot = editorInstance ? buildSnapshot(editorInstance, undefined, currentFilePath ?? undefined) : null

    // Collect other open tabs (exclude the active one)
    const openTabs = appStore.tabs
      .filter(t => t.id !== activeTab?.id)
      .map(t => ({ path: t.path, name: t.name, isDirty: t.isDirty }))

    // Build inline content blocks for binary attachments (images/PDFs)
    const userContentBlocks: LMContentBlock[] = []
    if (sendContext?.binaryFilePaths?.length) {
      for (const filePath of sendContext.binaryFilePaths) {
        const base64 = await window.electronAPI.readFileBinary(filePath)
        if (!base64) continue
        const ext = pathUtils.extension(filePath)
        const mimeType = EXT_TO_MIME[ext] ?? 'application/octet-stream'
        const fileName = pathUtils.basename(filePath) || filePath
        userContentBlocks.push({ type: 'inline_binary', base64, mimeType, fileName })
      }
    }

    const systemPrompt = getSystemPrompt(thread.profile)

    // Build EditorState delta block and prepend to user message
    const editorStateResult = buildEditorStateBlock(thread, _currentSnapshot, {
      filePath:            currentFilePath,
      isDirty:             activeTab?.isDirty ?? false,
      folderPath:          appStore.currentFolder ?? null,
      openTabs,
      textFilePaths:       sendContext?.textFilePaths ?? [],
      attachedDirectories: sendContext?.directories ?? [],
    })
    // Apply delta tracking updates to thread (stored without EditorState XML)
    if (Object.keys(editorStateResult.threadUpdate).length > 0) {
      thread = { ...thread, ...editorStateResult.threadUpdate }
      updateThread(thread)
    }
    // Build the thread sent to the LLM: last user message has EditorState prepended
    const llmThread = editorStateResult.xml
      ? {
          ...thread,
          messages: thread.messages.map((m, i) =>
            i === thread.messages.length - 1
              ? { ...m, content: `${editorStateResult.xml}\n\n${m.content}` }
              : m
          ),
        }
      : thread

    const tools = getToolsForProfile(thread.profile, window.electronAPI?.platform)

    // ── Create session ───────────────────────────────────────────────────────
    const llmModel = activeProviderConfig.value.defaultModelId
    const session = providerRegistry.createSession(activeProviderConfig.value, llmModel)

    if (!session) {
      notify.error('无法创建 AI 会话：Provider 配置无效')
      return false
    }

    _currentSession.value = session

    // Start streaming
    isStreaming.value = true
    streamingText.value = ''
    streamingThinkingText.value = ''
    streamingToolName.value = null
    pendingEditProposals.value = []

    const runner = new AgentRunner(
      session,
      toolRegistry,
      () => _currentSnapshot,
      () => appStore.activeTab?.path ?? null
    )

    runner.run(llmThread, systemPrompt, tools, {
      onText: delta => {
        streamingText.value += delta
      },
      onThinkingText: delta => {
        streamingThinkingText.value += delta
      },
      onToolCallStart: (name, _id) => {
        streamingToolName.value = name
      },
      onToolCallResult: (_tc: AiToolCall, result: AiToolResult) => {
        streamingToolName.value = null
        if (result.isError) {
          notify.warning(`工具调用失败: ${result.content}`)
        }
      },
      onEditProposal: (proposal: EditProposal) => {
        pendingEditProposals.value = [...pendingEditProposals.value, proposal]
      },
      onRoundComplete: (roundMsg) => {
        // Persist intermediate round (read tools) as its own message bubble
        const roundContent = streamingText.value
        streamingText.value = ''
        streamingToolName.value = null
        const storedMsg: ThreadMessage = {
          ...roundMsg,
          content: roundContent || roundMsg.content,
        }
        let t = activeThread.value
        if (t) {
          t = appendMessage(t, storedMsg)
          updateThread(t)
        }
      },
      onDone: assistantMessage => {
        isStreaming.value = false
        streamingToolName.value = null
        streamingThinkingText.value = ''
        _currentSession.value = null
        toolRegistry.disposeAll()
        // Block proposals are now in the stored message — clear from streaming list
        pendingEditProposals.value = []

        // Save final assistant message to thread
        const finalText = streamingText.value
        streamingText.value = ''

        const finalMsg: ThreadMessage = {
          ...assistantMessage,
          content: finalText || assistantMessage.content,
        }

        let updatedThread = activeThread.value
        if (updatedThread) {
          updatedThread = appendMessage(updatedThread, finalMsg)
          updateThread(updatedThread)
        }
      },
      onError: error => {
        isStreaming.value = false
        streamingText.value = ''
        streamingThinkingText.value = ''
        streamingToolName.value = null
        _currentSession.value = null
        toolRegistry.disposeAll()
        notify.error(`AI 错误: ${error}`)
        // Append error as a message bubble in the chat, and mark thread as failed
        let errThread = activeThread.value
        if (errThread) {
          const errMsg: ThreadMessage = {
            id: `msg-${nanoid(8)}`,
            role: 'assistant',
            content: error,
            isError: true,
            timestamp: Date.now(),
          }
          errThread = appendMessage({ ...errThread, hasError: true }, errMsg)
          updateThread(errThread)
        }
      },
    }, undefined, userContentBlocks.length > 0 ? userContentBlocks : undefined)

    return true
  }

  // ── Edit Proposal Actions ─────────────────────────────────────────────────

  /**
   * Reject all currently pending proposals (called when user sends a new message).
   * - Proposals in thread messages are marked 'rejected' in place.
   * - Pending ACP fs resolvers are resolved with false.
   * - pendingEditProposals list is cleared.
   */
  function _rejectAllPendingProposals() {
    if (
      pendingEditProposals.value.length === 0 &&
      !activeThread.value?.messages.some(m => m.editProposals?.some(p => p.status === 'pending'))
    ) return

    // Reject in-thread proposals (block / create_file)
    const thread = activeThread.value
    if (thread?.messages.some(m => m.editProposals?.some(p => p.status === 'pending'))) {
      const updatedMessages = thread.messages.map(msg => {
        if (!msg.editProposals?.some(p => p.status === 'pending')) return msg
        return {
          ...msg,
          editProposals: msg.editProposals.map(p =>
            p.status === 'pending' ? { ...p, status: 'rejected' as const } : p
          ),
        }
      })
      updateThread({ ...thread, messages: updatedMessages })
    }

    pendingEditProposals.value = []
  }

  /**
   * Immutably update a proposal's status inside the stored thread messages.
   * Using spread-based immutable update ensures Vue 3 detects the change and
   * recomputes `pendingProposals` in AgentMessageBubble.
   */
  function _updateProposalInThread(proposalId: string, status: 'applied' | 'rejected') {
    const thread = activeThread.value
    if (!thread) return
    const updatedMessages = thread.messages.map(msg => {
      const targetProposal = msg.editProposals?.find(p => p.id === proposalId)
      if (!targetProposal) return msg
      // Sync the corresponding toolCall status so ToolCallView reflects the result
      const toolCallStatus: 'completed' | 'failed' = status === 'applied' ? 'completed' : 'failed'
      // Also update the toolResult content so subsequent LLM turns see the correct outcome.
      // Without this, the LLM's conversation history always shows "waiting for user approval"
      // even after the edit was applied, leading to incorrect reasoning in follow-up turns.
      const resultText = status === 'applied'
        ? 'Edit was approved by the user and applied successfully.'
        : 'Edit was rejected by the user and not applied.'
      return {
        ...msg,
        editProposals: msg.editProposals!.map(p =>
          p.id === proposalId ? { ...p, status } : p
        ),
        toolCalls: msg.toolCalls?.map(tc =>
          tc.id === targetProposal.toolCallId ? { ...tc, status: toolCallStatus } : tc
        ),
        toolResults: msg.toolResults?.map(tr =>
          tr.toolCallId === targetProposal.toolCallId ? { ...tr, content: resultText } : tr
        ),
      } as ThreadMessage
    })
    updateThread({ ...thread, messages: updatedMessages })
  }

  /**
   * Find a proposal by ID — first in pendingEditProposals (active ACP file proposals
   * or block proposals during streaming), then in stored thread messages (block
   * proposals after onDone has committed them to the thread).
   */
  function _findProposal(proposalId: string): EditProposal | undefined {
    const fromPending = pendingEditProposals.value.find(p => p.id === proposalId)
    if (fromPending) return fromPending
    for (const msg of activeThread.value?.messages ?? []) {
      const found = msg.editProposals?.find(p => p.id === proposalId)
      if (found) return found
    }
    return undefined
  }

  async function approveEditProposal(proposalId: string) {
    const proposal = _findProposal(proposalId)
    if (!proposal) return

    if (proposal.kind === 'create_file') {
      const p = proposal as FileCreateProposal
      // 1. Create a new in-memory tab with the desired filename
      const { DocumentType } = await import('@/types/document-type')
      appStore.createTab(p.filename, undefined, DocumentType.MARKDOWN_EDITOR)

      // 2. Wait for MarkdownEditorPage to mount and set editorInstance
      const getEditor = (): Editor | undefined =>
        appStore.activeTab?.editorInstance as Editor | undefined

      // Poll nextTick until editorInstance is ready (typically 1-2 frames after mount)
      const { nextTick } = await import('vue')
      for (let i = 0; i < 20; i++) {
        await nextTick()
        if (getEditor()) break
      }

      // 3. Inject content via the existing insert_block(0) path
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
          _updateProposalInThread(proposalId, 'applied')
          notify.success(`文档"${p.filename}"已创建`)
        } else {
          notify.error(`内容注入失败: ${result.error}`)
        }
      } else {
        notify.error('编辑器未就绪，请手动粘贴内容')
      }
      pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
      return
    }

    // BlockEditProposal — file-based path (proposal.filePath targets a file on disk)
    const blockProposal = proposal as BlockEditProposal
    if (blockProposal.filePath) {
      // If filePath == active editor file, nodeId was resolved against the active editor's
      // blockMap — use the active editor path so unsaved changes are handled correctly.
      const currentFilePath = appStore.activeTab?.path
      const isActiveFile = !!currentFilePath && pathUtils.normalize(currentFilePath) === pathUtils.normalize(blockProposal.filePath)

      if (!isActiveFile) {
        const { UnifiedDocumentAccess } = await import('@/ai/edit-agent/UnifiedDocumentAccess')
        // Always create a fresh handle so we apply to the latest on-disk state
        const handle = await UnifiedDocumentAccess.createFreshFromFile(blockProposal.filePath)
        if ('error' in handle) {
          notify.error(`文件编辑失败: ${handle.error}`)
          return
        }
        const result = await handle.applyBlockProposal(blockProposal)
        handle.dispose()
        if (result.success) {
          _updateProposalInThread(proposalId, 'applied')
          notify.success('文件编辑已应用')
        } else {
          notify.error(`文件编辑失败: ${result.error}`)
        }
        return
      }
      // isActiveFile → fall through to active editor path below
    }

    // BlockEditProposal — active editor path
    const editor = appStore.activeTab?.editorInstance as Editor | undefined
    if (!editor) {
      notify.error('没有活动的编辑器文档')
      return
    }

    // Route through UnifiedDocumentAccess.fromEditor so nodeIds are resolved from the
    // current editor state. This handles the case where the proposal was built while the
    // file was not open (isNonActiveFile path) and the file was opened before approval.
    const { UnifiedDocumentAccess } = await import('@/ai/edit-agent/UnifiedDocumentAccess')
    const handle = UnifiedDocumentAccess.fromEditor(editor, appStore.activeTab?.path ?? undefined)
    const result = await handle.applyBlockProposal(proposal as BlockEditProposal)
    if (result.success) {
      _updateProposalInThread(proposalId, 'applied')
      // Rebuild snapshot after mutation so subsequent tool calls see the updated doc
      _currentSnapshot = buildSnapshot(editor)
      notify.success('编辑已应用')
    } else {
      notify.error(`应用编辑失败: ${result.error}`)
    }
  }

  function rejectEditProposal(proposalId: string) {
    const proposal = _findProposal(proposalId)
    if (!proposal) return

    if (proposal.kind === 'create_file') {
      pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
      _updateProposalInThread(proposalId, 'rejected')
      return
    }

    // BlockEditProposal: immutable update so Vue detects the status change
    _updateProposalInThread(proposalId, 'rejected')
  }

  /** All pending proposals: from thread messages + any still in pendingEditProposals */
  const allPendingProposals = computed<EditProposal[]>(() => {
    const fromThread: EditProposal[] = []
    for (const msg of activeThread.value?.messages ?? []) {
      for (const p of msg.editProposals ?? []) {
        if (p.status === 'pending') fromThread.push(p)
      }
    }
    return [...fromThread, ...pendingEditProposals.value]
  })

  async function approveAllProposals() {
    const ids = allPendingProposals.value
      .filter(p => p.kind === 'block' || p.kind === 'create_file')
      .map(p => p.id)
    for (const id of ids) await approveEditProposal(id)
  }

  function rejectAllProposals() {
    const ids = allPendingProposals.value
      .filter(p => p.kind === 'block' || p.kind === 'create_file')
      .map(p => p.id)
    for (const id of ids) rejectEditProposal(id)
  }

  function cancelStreaming() {
    _currentSession.value?.cancel()
    _currentSession.value = null
    isStreaming.value = false
    streamingThinkingText.value = ''
    streamingText.value = ''
    streamingToolName.value = null
    notify.info('已停止生成')
  }

  // ── Initialization ────────────────────────────────────────────────────────
  function init() {
    // Re-load settings and threads (in case store was accessed before mount)
    settings.value = ThreadStore.loadSettings()
    threads.value = ThreadStore.loadThreads()
    // Remove any empty threads left over from previous sessions
    _purgeEmptyThreads()
    if (!activeThreadId.value && threads.value.length) {
      activeThreadId.value = threads.value[0]!.id
    }
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

    // Streaming state
    isStreaming,
    streamingText,
    streamingThinkingText,
    streamingToolName,
    pendingEditProposals,

    // Actions
    sendMessage,
    approveEditProposal,
    rejectEditProposal,
    allPendingProposals,
    approveAllProposals,
    rejectAllProposals,
    cancelStreaming,
    init,
  }
})
