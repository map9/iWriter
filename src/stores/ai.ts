import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import type {
  AiThread,
  AiProviderConfig,
  AiSettings,
  EditProposal,
  AiToolCall,
  AiToolResult,
  ThreadMessage,
  AcpPermissionRequest,
} from '@/types/ai'
import type { AcpModelInfo, AcpModeInfo } from '@/ai/acp/AcpProtocol'
import { PROVIDER_PRESETS, type ProviderPreset } from '@/ai/providers/provider-presets'
import { ThreadStore } from '@/ai/thread/ThreadStore'
import { createThread, appendMessage, createMessage } from '@/ai/thread/Thread'
import { buildSystemPrompt, getToolsForProfile } from '@/ai/thread/ContextBuilder'
import { providerRegistry } from '@/ai/providers/ProviderRegistry'
import { AcpAgentSession } from '@/ai/acp/AcpAgentSession'
import { AgentRunner } from '@/ai/agent/AgentRunner'
import { PermissionGate } from '@/ai/tools/PermissionGate'
import { FileTools } from '@/ai/tools/FileTools'
import { createToolRegistry } from '@/ai/tools/registry'
import { applyEditProposal } from '@/ai/edit-agent/EditApplier'
import { useAppStore } from '@/stores/app'
import type { Editor } from '@tiptap/core'
import type { AgentSession } from '@/ai/providers/types'
import { notify } from '@/utils/notifications'

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

  function createNewThread(): AiThread {
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
    const configId = config.id
    session.onInit = (models, modes, currentModelId, currentModeId) => updateAcpCapabilities(configId, models, modes, currentModelId, currentModeId)
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
      session.onInit = (models, modes, currentModelId, currentModeId) => updateAcpCapabilities(config.id, models, modes, currentModelId, currentModeId)
      session.onPermissionRequest = (requestId, permission, path, description, options) => {
        acpPermissionPending.value = {
          sessionId: (session as AcpAgentSession).sessionId,
          requestId,
          permission,
          path,
          description,
          options,
        }
      }
      _acpSessionCache.set(config.id, session)
    }
    return session
  }

  // ── Tools Infrastructure ──────────────────────────────────────────────────
  const permissionGate = new PermissionGate(
    () => settings.value,
    () => appStore.currentFolder ?? null
  )

  const fileTools = new FileTools(
    permissionGate,
    () => appStore.currentFolder ?? null
  )

  const toolRegistry = createToolRegistry(fileTools)

  // ── Send Message ──────────────────────────────────────────────────────────
  async function sendMessage(userText: string): Promise<boolean> {
    if (isStreaming.value) return false
    if (!activeProviderConfig.value) {
      notify.error('请先配置 AI Provider（API Key 等）')
      return false
    }

    // Ensure there is an active thread
    let thread = activeThread.value
    if (!thread) {
      thread = createNewThread()
    }

    // Append user message
    const userMsg = createMessage('user', userText)
    thread = appendMessage(thread, userMsg)
    updateThread(thread)

    // Get context from active editor
    const activeTab = appStore.activeTab
    const editorInstance = activeTab?.editorInstance as Editor | undefined
    const documentText = editorInstance?.getText() ?? ''
    const selectionText = editorInstance
      ? (() => {
          const { from, to } = editorInstance.state.selection
          return from !== to ? editorInstance.state.doc.textBetween(from, to) : ''
        })()
      : ''

    const systemPrompt = buildSystemPrompt(thread.profile, {
      documentText,
      selectionText: selectionText || undefined,
      filePath: activeTab?.path ?? null,
      folderPath: appStore.currentFolder ?? null,
    })

    const tools = getToolsForProfile(thread.profile)

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

    const runner = new AgentRunner(session, toolRegistry)

    runner.run(thread, systemPrompt, tools, {
      onText: delta => {
        streamingText.value += delta
      },
      onToolCallStart: name => {
        streamingToolName.value = name
      },
      onToolCallResult: (_tc: AiToolCall, result: AiToolResult) => {
        streamingToolName.value = null
        if (result.isError) {
          notify.warning(`工具调用失败: ${result.content}`)
        }
      },
      onEditProposal: proposal => {
        pendingEditProposals.value = [...pendingEditProposals.value, proposal]
      },
      onDone: assistantMessage => {
        isStreaming.value = false
        streamingToolName.value = null
        _currentSession.value = null

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
      },
    }, streamOptions)

    return true
  }

  // ── Edit Proposal Actions ─────────────────────────────────────────────────
  function approveEditProposal(proposalId: string) {
    const proposal = pendingEditProposals.value.find(p => p.id === proposalId)
    if (!proposal) return

    const editor = appStore.activeTab?.editorInstance as Editor | undefined
    if (!editor) {
      notify.error('没有活动的编辑器文档')
      return
    }

    const result = applyEditProposal(editor, proposal)
    if (result.success) {
      proposal.status = 'applied'
      pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
      notify.success('编辑已应用')
    } else {
      notify.error(`应用编辑失败: ${result.error}`)
    }
  }

  function rejectEditProposal(proposalId: string) {
    const proposal = pendingEditProposals.value.find(p => p.id === proposalId)
    if (proposal) {
      proposal.status = 'rejected'
    }
    pendingEditProposals.value = pendingEditProposals.value.filter(p => p.id !== proposalId)
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
    cancelStreaming,
    init,
  }
})
