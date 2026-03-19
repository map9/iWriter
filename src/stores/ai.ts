import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import type {
  AiThread,
  AiProviderConfig,
  AiSettings,
  BlockEditProposal,
  FileEditProposal,
  FileCreateProposal,
  EditProposal,
  AiToolCall,
  AiToolResult,
  ThreadMessage,
  AcpPermissionRequest,
  SendContext,
} from '@/types/ai'
import type { LMContentBlock } from '@/ai/providers/types'
import type { AcpModelInfo, AcpModeInfo } from '@/ai/acp/AcpProtocol'
import { PROVIDER_PRESETS, type ProviderPreset } from '@/ai/providers/provider-presets'
import { ThreadStore } from '@/ai/thread/ThreadStore'
import { createThread, appendMessage, createMessage } from '@/ai/thread/Thread'
import { buildSystemPrompt, getToolsForProfile } from '@/ai/thread/ContextBuilder'
import { providerRegistry } from '@/ai/providers/ProviderRegistry'
import { AcpAgentSession } from '@/ai/acp/AcpAgentSession'
import { AgentRunner } from '@/ai/agent/AgentRunner'
import { createToolRegistry } from '@/ai/tools/registry'
import { applyBlockEditProposal } from '@/ai/edit-agent/BlockEditApplier'
import { buildSnapshot } from '@/ai/thread/ContextBuilder'
import { useAppStore } from '@/stores/app'
import type { Editor } from '@tiptap/core'
import type { AgentSession } from '@/ai/providers/types'
import { notify } from '@/utils/notifications'

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
        kind: p.kind,
        type: p.type,
        label: p.label,
        apiKey: '',
        baseUrl: p.baseUrl,
        defaultModelId: p.defaultModelId,
        presetId: p.id,
        models: p.models,
        agentModes: p.agentModes,
        acpCommand: p.acpCommand,
        acpArgs: p.acpArgs,
      }))
    _initialSettings.activeProviderConfigId = _initialSettings.providerConfigs[0]?.id ?? null
    ThreadStore.saveSettings(_initialSettings)
  }
  // Migration: backfill acpArgs/acpCommand for existing configs that were saved without them
  let _migrated = false
  for (const cfg of _initialSettings.providerConfigs) {
    if (cfg.kind === 'agent' && cfg.presetId && !cfg.acpArgs) {
      const preset = PROVIDER_PRESETS.find(p => p.id === cfg.presetId)
      if (preset) {
        if (!cfg.acpCommand) cfg.acpCommand = preset.acpCommand
        cfg.acpArgs = preset.acpArgs
        _migrated = true
      }
    }
  }
  if (_migrated) ThreadStore.saveSettings(_initialSettings)

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
    // For ACP agents: use in-memory capabilities only (not persisted)
    if (config.kind === 'agent') {
      const caps = _acpCapabilities.value[config.id]
      return caps?.models.map((m: AcpModelInfo) => m.id) ?? []
    }
    if (config.models?.length) return config.models
    const preset = PROVIDER_PRESETS.find(p => p.id === config.presetId)
    const presetModels = preset?.models ?? []
    return presetModels.length ? presetModels : [config.defaultModelId].filter(Boolean)
  })

  /** Whether the current provider is an external agent (ACP) */
  const isAgentProvider = computed(() => activeProviderConfig.value?.kind === 'agent')

  /** Agent modes for the current provider (in-memory only, not persisted) */
  const activeAgentModes = computed<AcpModeInfo[]>(() => {
    const config = activeProviderConfig.value
    if (!config || config.kind !== 'agent') return []
    return _acpCapabilities.value[config.id]?.modes ?? []
  })

  /** Think modes for the current LLM provider (empty for agent providers) */
  const availableThinkModes = computed<string[]>(() => {
    const config = activeProviderConfig.value
    if (!config || config.kind === 'agent') return []
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
    // Kill and remove any cached ACP session for this provider
    const cachedSession = _acpSessionCache.get(id)
    if (cachedSession) {
      cachedSession.cancel()
      _acpSessionCache.delete(id)
    }

    const removed = settings.value.providerConfigs.find(c => c.id === id)
    settings.value.providerConfigs = settings.value.providerConfigs.filter(c => c.id !== id)
    if (settings.value.activeProviderConfigId === id) {
      const sameKind = settings.value.providerConfigs.filter(
        c => (c.kind ?? 'llm') === (removed?.kind ?? 'llm')
      )
      settings.value.activeProviderConfigId =
        sameKind[0]?.id ?? settings.value.providerConfigs[0]?.id ?? null
    }
    saveSettings()
  }

  function setActiveProvider(id: string) {
    settings.value.activeProviderConfigId = id
    saveSettings()
    // Clear mode on the active thread so stale values from the previous provider
    // are not carried over to the new one. (Model is provider-level, not thread-level.)
    const thread = activeThread.value
    if (thread && (thread.agentMode || thread.thinkMode)) {
      updateThread({ ...thread, agentMode: undefined, thinkMode: undefined })
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
      if (isAgentProvider.value) {
        updateThread({ ...activeThread.value, agentMode: mode })
      } else {
        updateThread({ ...activeThread.value, thinkMode: mode })
      }
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
  const streamingToolName = ref<string | null>(null)
  const pendingEditProposals = ref<EditProposal[]>([])

  /**
   * Resolvers for pending ACP fs/write_text_file requests.
   * Key = FileEditProposal.id, Value = function(approved) that sends the JSON-RPC response.
   */
  const _pendingAcpFsResolvers = new Map<string, (approved: boolean) => Promise<void>>()

  // ── ACP Agent State ───────────────────────────────────────────────────────
  /** A permission request from the active ACP agent awaiting user decision. */
  const acpPermissionPending = ref<AcpPermissionRequest | null>(null)

  /**
   * Per-provider ACP session cache.
   * ACP agents keep a persistent process alive across multiple messages.
   * Key = providerConfigId, Value = the live AcpAgentSession.
   */
  const _acpSessionCache = new Map<string, AcpAgentSession>()

  /**
   * In-memory capabilities discovered from ACP init_result.
   * NOT persisted to localStorage — must be re-fetched each session.
   * Key = providerConfigId. Uses ref<Record> for guaranteed Vue 3 reactivity.
   */
  const _acpCapabilities = ref<Record<string, {
    models: AcpModelInfo[]
    modes: AcpModeInfo[]
    currentModelId: string | null
    currentModeId: string | null
  }>>({})

  function _deleteAcpCapabilities(configId: string) {
    const next = { ..._acpCapabilities.value }
    delete next[configId]
    _acpCapabilities.value = next
  }

  /** Per-agent initialization status. Key = providerConfigId. */
  const _agentInitStatusMap = reactive(new Map<string, 'idle' | 'initializing' | 'success' | 'failed'>())

  /** Init status for the currently active agent provider. */
  const currentAgentInitStatus = computed<'idle' | 'initializing' | 'success' | 'failed'>(() => {
    const config = activeProviderConfig.value
    if (!config || config.kind !== 'agent') return 'idle'
    return _agentInitStatusMap.get(config.id) ?? 'idle'
  })

  // ── Startup progress (aligned with acp-ui session.ts) ────────────────────
  /** Whether a connection attempt is currently in progress. */
  const isConnecting = ref(false)
  /** Current startup phase label. */
  const startupPhase = ref<string>('starting')
  /** Captured stderr lines from the agent process during startup. */
  const startupLogs = ref<string[]>([])
  /** Elapsed seconds since the connection attempt started. */
  const startupElapsed = ref<number>(0)
  /** Show/hide the startup log details panel. */
  const startupShowDetails = ref(false)

  let _startupTimer: ReturnType<typeof setInterval> | null = null
  /** The session currently being initialised — used by cancelConnection. */
  let _connectingSession: AcpAgentSession | null = null
  /** Provider config ID that is currently connecting — used to cancel it when switching. */
  let _connectingConfigId: string | null = null
  /** Incremented each time a new init is started; stale inits exit early in their finally block. */
  let _initGenCounter = 0

  /** Detect startup phase from a stderr line (ported from acp-ui). */
  function detectStartupPhase(line: string): string | null {
    const lower = line.toLowerCase()
    if (lower.includes('download') || lower.includes('fetch') || lower.includes('get ')) return 'downloading'
    if (lower.includes('install') || lower.includes('added') || lower.includes('packages')) return 'installing'
    if (lower.includes('build') || lower.includes('compil')) return 'building'
    if (lower.includes('start') || lower.includes('spawn')) return 'starting'
    return null
  }

  function _startProgressTracking(session: AcpAgentSession, configId: string) {
    isConnecting.value = true
    startupPhase.value = 'starting'
    startupLogs.value = []
    startupElapsed.value = 0
    startupShowDetails.value = false
    _connectingSession = session
    _connectingConfigId = configId

    _startupTimer = setInterval(() => {
      startupElapsed.value++
    }, 1000)

    window.electronAPI.onAcpStderr?.((data: { sessionId: string; line: string }) => {
      if (data.sessionId !== session.sessionId) return
      startupLogs.value = [...startupLogs.value, data.line]
      const phase = detectStartupPhase(data.line)
      if (phase) startupPhase.value = phase
    })
  }

  function _stopProgressTracking() {
    isConnecting.value = false
    if (_startupTimer !== null) {
      clearInterval(_startupTimer)
      _startupTimer = null
    }
    _connectingSession = null
    _connectingConfigId = null
    window.electronAPI.removeAcpStderrListeners?.()
  }

  /** Get the init status for any provider config by ID. */
  function getAgentInitStatus(configId: string): 'idle' | 'initializing' | 'success' | 'failed' {
    return _agentInitStatusMap.get(configId) ?? 'idle'
  }

  /** Cancel an ongoing connection attempt. */
  function cancelConnection() {
    const prevConfigId = _connectingConfigId
    const prevSession = _connectingSession
    _stopProgressTracking()
    if (prevSession) prevSession.cancel()
    if (prevConfigId) {
      _initializingIds.delete(prevConfigId)
      _agentInitStatusMap.set(prevConfigId, 'idle')
    }
    notify.info('已取消连接')
  }

  /** The session used by the current streaming request (for cancel). */
  const _currentSession = ref<AgentSession | null>(null)

  /** Reply to a pending ACP permission request. */
  function resolveAcpPermission(response: string) {
    const req = acpPermissionPending.value
    if (!req) return
    window.electronAPI.acpPermissionRespond?.({
      sessionId: req.sessionId,
      requestId: req.requestId,
      response,
    })
    acpPermissionPending.value = null
  }

  /**
   * Store ACP agent capabilities in memory (NOT persisted).
   * Also auto-corrects defaultModelId if it's missing or not in the returned models.
   */
  function updateAcpCapabilities(
    configId: string,
    models: AcpModelInfo[],
    modes: AcpModeInfo[],
    currentModelId: string | null,
    currentModeId: string | null
  ) {
    _acpCapabilities.value = {
      ..._acpCapabilities.value,
      [configId]: { models, modes, currentModelId, currentModeId },
    }
    // Sync defaultModelId with the agent's actual current model
    if (models.length) {
      const cfg = settings.value.providerConfigs.find(c => c.id === configId)
      if (cfg) {
        const ids = models.map(m => m.id)
        const preferred = currentModelId && ids.includes(currentModelId) ? currentModelId : ids[0]!
        if (!cfg.defaultModelId || !ids.includes(cfg.defaultModelId)) {
          updateProviderConfig(configId, { defaultModelId: preferred })
        }
      }
    }
  }

  /**
   * Wire all ACP session callbacks: onInit, onPermissionRequest, onFsReadRequest, onFsWriteRequest.
   * Call this every time a new AcpAgentSession is created.
   */
  function setupAcpSessionCallbacks(session: AcpAgentSession, configId: string): void {
    session.onInit = (models, modes, currentModelId, currentModeId) =>
      updateAcpCapabilities(configId, models, modes, currentModelId, currentModeId)

    session.onPermissionRequest = (requestId, permission, path, description, options) => {
      acpPermissionPending.value = {
        sessionId: session.sessionId,
        requestId,
        permission,
        path,
        description,
        options,
      }
    }

    session.onFsReadRequest = async (requestId, filePath) => {
      const activeTab = appStore.activeTab
      const editorInstance = activeTab?.editorInstance as import('@tiptap/core').Editor | undefined

      if (editorInstance && activeTab?.path && filePath === activeTab.path) {
        // Current editor file: return in-memory document view Markdown (latest unsaved state)
        const snapshot = buildSnapshot(editorInstance)
        await session.respondToFsRequest(requestId, { content: snapshot.view.viewMarkdown })
      } else {
        // Other files: read from disk
        try {
          const content = await window.electronAPI.readFile(filePath)
          await session.respondToFsRequest(requestId, { content: content ?? '' })
        } catch {
          await session.respondToFsRequest(requestId, undefined, {
            code: -32001,
            message: `File not found: ${filePath}`,
          })
        }
      }
    }

    session.onFsWriteRequest = async (requestId, filePath, newContent) => {
      const activeTab = appStore.activeTab
      const editorInstance = activeTab?.editorInstance as import('@tiptap/core').Editor | undefined

      if (editorInstance && activeTab?.path && filePath === activeTab.path) {
        // Current editor file: intercept → create FileEditProposal
        const snapshot = buildSnapshot(editorInstance)
        const oldContent = snapshot.view.viewMarkdown

        const proposalId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const proposal: FileEditProposal = {
          id: proposalId,
          kind: 'file',
          status: 'pending',
          description: `Agent wants to update ${filePath.split('/').pop()}`,
          sessionId: session.sessionId,
          filePath,
          oldContent,
          newContent,
        }

        // Store the resolver so approve/reject can respond to the agent
        _pendingAcpFsResolvers.set(proposalId, async (approved) => {
          if (approved) {
            const saved = await window.electronAPI.saveFile(newContent, filePath)
            if (saved) {
              await session.respondToFsRequest(requestId, null)
            } else {
              await session.respondToFsRequest(requestId, undefined, {
                code: -32002,
                message: 'File write failed',
              })
            }
          } else {
            await session.respondToFsRequest(requestId, undefined, {
              code: -32003,
              message: 'User rejected the file write',
            })
          }
        })

        pendingEditProposals.value = [...pendingEditProposals.value, proposal]
      } else {
        // Non-current files: write to disk directly
        try {
          const saved = await window.electronAPI.saveFile(newContent, filePath)
          await session.respondToFsRequest(requestId, saved ? null : undefined,
            saved ? undefined : { code: -32002, message: 'File write failed' })
        } catch {
          await session.respondToFsRequest(requestId, undefined, {
            code: -32002,
            message: 'File write failed',
          })
        }
      }
    }
  }

  /** Provider IDs currently being initialized — prevents concurrent re-entry. */
  const _initializingIds = new Set<string>()

  /**
   * Proactively initialize an ACP agent when it is selected.
   * Cancels any existing session, creates a fresh one, and awaits init_result.
   */
  async function initAgentProvider(config: AiProviderConfig): Promise<void> {
    if (config.kind !== 'agent') return

    // ── Cancel any OTHER provider currently connecting ─────────────────────
    if (_connectingSession && _connectingConfigId !== config.id) {
      const prevConfigId = _connectingConfigId
      const prevSession = _connectingSession
      _stopProgressTracking()               // clears _connectingSession / _connectingConfigId
      if (prevConfigId) {
        _initializingIds.delete(prevConfigId)
        _agentInitStatusMap.set(prevConfigId, 'idle')
      }
      prevSession.cancel()                  // fixed disconnect() resolves its initialize() promise
    }

    // Prevent re-entry for the same provider
    if (_initializingIds.has(config.id)) return
    _initializingIds.add(config.id)

    // Generation stamp — stale completions skip stop/update when superseded
    const myGen = ++_initGenCounter

    // Cancel and evict any existing session for THIS provider
    const existing = _acpSessionCache.get(config.id)
    if (existing) {
      existing.cancel()
      _acpSessionCache.delete(config.id)
    }
    _deleteAcpCapabilities(config.id)
    _agentInitStatusMap.set(config.id, 'initializing')

    const session = new AcpAgentSession(config)
    setupAcpSessionCallbacks(session, config.id)
    _acpSessionCache.set(config.id, session)
    _startProgressTracking(session, config.id)

    try {
      const success = await session.initialize()
      if (myGen !== _initGenCounter) {
        // Superseded by a newer init; mark idle if still stuck in 'initializing'
        if (_agentInitStatusMap.get(config.id) === 'initializing') {
          _agentInitStatusMap.set(config.id, 'idle')
        }
        return
      }
      _agentInitStatusMap.set(config.id, success ? 'success' : 'failed')
      if (!success) {
        notify.error(`${config.label} 初始化失败，请检查命令配置`)
      }
    } finally {
      _initializingIds.delete(config.id)
      if (myGen === _initGenCounter) {
        _stopProgressTracking()
      }
    }
  }

  /**
   * Get or create the ACP session for the given provider config.
   * ACP sessions are reused across messages to maintain the agent's process.
   */
  function getOrCreateAcpSession(config: AiProviderConfig): AcpAgentSession {
    let session = _acpSessionCache.get(config.id)
    if (!session) {
      session = new AcpAgentSession(config)
      setupAcpSessionCallbacks(session, config.id)
      _acpSessionCache.set(config.id, session)
    }
    return session
  }

  // ── Tools Infrastructure ──────────────────────────────────────────────────
  // The snapshot is rebuilt each sendMessage call; the getter reads the latest one
  let _currentSnapshot: ReturnType<typeof buildSnapshot> | null = null
  const toolRegistry = createToolRegistry(
    () => _currentSnapshot,
    () => settings.value,
    () => appStore.currentFolder ?? null
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

    // File-switch detection
    const fileChanged = thread.originFilePath !== undefined
                     && thread.originFilePath !== currentFilePath
    if (thread.originFilePath === undefined) {
      thread = { ...thread, originFilePath: currentFilePath }
      updateThread(thread)
    }

    // Build document view snapshot (used by both system prompt and tool registry)
    _currentSnapshot = editorInstance ? buildSnapshot(editorInstance, undefined, currentFilePath ?? undefined) : null

    const selectionText = editorInstance
      ? (() => {
          const { from, to } = editorInstance.state.selection
          return from !== to ? editorInstance.state.doc.textBetween(from, to) : ''
        })()
      : ''

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
        const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
        const mimeType = EXT_TO_MIME[ext] ?? 'application/octet-stream'
        const fileName = filePath.split('/').pop() ?? filePath
        userContentBlocks.push({ type: 'inline_binary', base64, mimeType, fileName })
      }
    }

    const systemPrompt = buildSystemPrompt(thread.profile, {
      editor:              editorInstance,
      viewSnapshot:        _currentSnapshot ?? undefined,
      selectionText:       selectionText || undefined,
      filePath:            currentFilePath,
      folderPath:          appStore.currentFolder ?? null,
      isDirty:             activeTab?.isDirty ?? false,
      openTabs:            openTabs.length > 0 ? openTabs : undefined,
      fileChanged:         fileChanged,
      previousFilePath:    thread.originFilePath ?? null,
      textFilePaths:       sendContext?.textFilePaths?.length ? sendContext.textFilePaths : undefined,
      attachedDirectories: sendContext?.directories?.length ? sendContext.directories : undefined,
    })

    const tools = getToolsForProfile(thread.profile, window.electronAPI?.platform)

    // ── Create or reuse session ──────────────────────────────────────────────
    let session: AgentSession | null

    if (activeProviderConfig.value.kind === 'agent') {
      // ACP agents: reuse the persistent session process
      const acpSession = getOrCreateAcpSession(activeProviderConfig.value)
      // Always update context (workspace/file may have changed)
      acpSession.setContext({
        workspacePath: appStore.currentFolder ?? null,
        filePath: activeTab?.path ?? null,
      })
      // Pass in-memory document view so the agent sees unsaved changes
      // (critical for .iwt files which are JSON on disk, not Markdown)
      acpSession.setDocumentView(_currentSnapshot?.view.viewMarkdown ?? null)
      session = acpSession
    } else {
      // Native LLM: stateless HTTP call, create fresh session each time
      const llmModel = activeProviderConfig.value.defaultModelId
      session = providerRegistry.createSession(activeProviderConfig.value, llmModel)
    }

    if (!session) {
      notify.error('无法创建 AI 会话：Provider 配置无效')
      return false
    }

    _currentSession.value = session

    // ── Stream options (model/mode for ACP agents) ───────────────────────────
    const streamOptions = activeProviderConfig.value.kind === 'agent'
      ? (() => {
          // Model is provider-level: use defaultModelId, validated against available list
          const rawModel = activeProviderConfig.value.defaultModelId || ''
          const agentModels = availableModels.value
          const model = rawModel && (agentModels.length === 0 || agentModels.includes(rawModel))
            ? rawModel
            : (agentModels[0] ?? undefined)
          return {
            model: model || undefined,
            mode: thread.agentMode || activeProviderConfig.value.lastSelectedMode || undefined,
          }
        })()
      : undefined

    // Start streaming
    isStreaming.value = true
    streamingText.value = ''
    streamingToolName.value = null
    pendingEditProposals.value = []

    const runner = new AgentRunner(session, toolRegistry, () => _currentSnapshot)

    runner.run(thread, systemPrompt, tools, {
      onText: delta => {
        streamingText.value += delta
      },
      onThinkingText: _delta => {
        // thinkingContent is accumulated in AgentRunner and stored in ThreadMessage
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
        _currentSession.value = null
        // Block proposals are now in the stored message — clear from streaming list
        // (keep file proposals which are waiting for ACP resolver)
        pendingEditProposals.value = pendingEditProposals.value.filter(p => p.kind === 'file')

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
        streamingToolName.value = null
        _currentSession.value = null
        notify.error(`AI 错误: ${error}`)
        // Append error as a message bubble in the chat, and mark thread as failed
        let errThread = activeThread.value
        if (errThread) {
          const errMsg: ThreadMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'assistant',
            content: error,
            isError: true,
            timestamp: Date.now(),
          }
          errThread = appendMessage({ ...errThread, hasError: true }, errMsg)
          updateThread(errThread)
        }
      },
    }, streamOptions, userContentBlocks.length > 0 ? userContentBlocks : undefined)

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
    // Reject in-thread proposals (block / create_file)
    const thread = activeThread.value
    if (thread) {
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

    // Resolve any pending ACP fs resolvers as rejected
    for (const [id, resolver] of _pendingAcpFsResolvers) {
      resolver(false)
      _pendingAcpFsResolvers.delete(id)
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
      return {
        ...msg,
        editProposals: msg.editProposals!.map(p =>
          p.id === proposalId ? { ...p, status } : p
        ),
        toolCalls: msg.toolCalls?.map(tc =>
          tc.id === targetProposal.toolCallId ? { ...tc, status: toolCallStatus } : tc
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

    if (proposal.kind === 'file') {
      // FileEditProposal: resolve via the pending ACP fs resolver
      const resolver = _pendingAcpFsResolvers.get(proposalId)
      if (resolver) {
        _pendingAcpFsResolvers.delete(proposalId)
        pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
        await resolver(true)
        notify.success('文件编辑已应用')
      }
      return
    }

    // BlockEditProposal — file-based path (proposal.filePath targets a file on disk)
    const blockProposal = proposal as BlockEditProposal
    if (blockProposal.filePath) {
      const { applyBlockEditToFile } = await import('@/ai/edit-agent/FileBlockEditApplier')
      const result = await applyBlockEditToFile(blockProposal)
      if (result.success) {
        _updateProposalInThread(proposalId, 'applied')
        notify.success('文件编辑已应用')
      } else {
        notify.error(`文件编辑失败: ${result.error}`)
      }
      return
    }

    // BlockEditProposal — active editor path
    const editor = appStore.activeTab?.editorInstance as Editor | undefined
    if (!editor) {
      notify.error('没有活动的编辑器文档')
      return
    }

    const result = await applyBlockEditProposal(editor, proposal as BlockEditProposal)
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

    if (proposal.kind === 'file') {
      // Notify the ACP agent that the write was rejected
      const resolver = _pendingAcpFsResolvers.get(proposalId)
      if (resolver) {
        _pendingAcpFsResolvers.delete(proposalId)
        resolver(false)
      }
      pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
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
    const fromPending = pendingEditProposals.value.filter(p => p.kind !== 'file')
    return [...fromThread, ...fromPending]
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

  // ── Watch: clear cached ACP session when provider switches ────────────────
  // (The old session process stays alive until its provider config is removed.)
  // We do NOT auto-kill on switch — user may switch back and want to resume.

  return {
    // Settings
    settings,
    activeProviderConfig,
    availableModels,
    isAgentProvider,
    activeAgentModes,
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
    streamingToolName,
    pendingEditProposals,

    // ACP agent state
    acpPermissionPending,
    resolveAcpPermission,
    currentAgentInitStatus,
    getAgentInitStatus,
    initAgentProvider,
    // Startup progress (aligned with acp-ui)
    isConnecting,
    startupPhase,
    startupLogs,
    startupElapsed,
    startupShowDetails,
    cancelConnection,

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
