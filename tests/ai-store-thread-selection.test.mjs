import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

let modulePromise

const client = {
  getThreads: () => Promise.resolve(globalThis.__iwriterThreadSelectionBackendThreads ?? []),
  getThreadMessages: () => Promise.resolve([]),
  updateConfig: () => Promise.resolve(),
  deleteThread: () => Promise.resolve(),
  clearThreads: () => Promise.resolve(),
  onStreamChunk() {},
  onRunInterrupted() {},
  onRunDone() {},
  onRunError() {},
  onModelFallback() {},
  onFilesystemAutoReject() {},
  removeListeners() {},
}

function stubPlugin() {
  return {
    name: 'ai-store-thread-selection-stubs',
    setup(buildApi) {
      const virtual = (filter, path, contents) => {
        buildApi.onResolve({ filter }, () => ({ path, namespace: 'ai-store-selection-test' }))
        buildApi.onLoad({ filter: new RegExp(`^${path}$`), namespace: 'ai-store-selection-test' }, () => ({
          contents,
          loader: 'js',
          resolveDir: process.cwd(),
        }))
      }

      virtual(/^@shared\/ai\/contracts$/, 'contracts', `
        export const DEFAULT_THINKING_LEVEL = 'medium'
        export function inferToolKind() { return 'other' }
        export function normalizeModeForDomain(mode) { return mode === 'creative' ? 'creative' : 'edit' }
        export function normalizeAgentMode(mode) { return mode === 'creative' ? 'creative' : 'edit' }
        export function normalizeThinkingLevel(level) { return level ?? 'medium' }
        export function resolveAiProviderModelId(config, preferred) { return preferred || config?.defaultModelId || '' }
        export function resolveAgentDomain(mode) { return mode === 'creative' ? 'creative' : 'editing' }
      `)
      virtual(/^@shared\/workspace\/path$/, 'workspace-path', `
        function normalized(path) { return typeof path === 'string' ? path.replaceAll('\\\\', '/').replace(/\\/+$/, '') : null }
        export function normalizeWorkspaceBinding(path) { return normalized(path) }
        export function areWorkspacePathsEqual(left, right) { return normalized(left) === normalized(right) }
      `)
      virtual(/^@\/stores\/app$/, 'app-store', `
        export function useAppStore() { return globalThis.__iwriterThreadSelectionAppStore }
      `)
      virtual(/^@\/utils\/notifications$/, 'notifications', `
        export const notify = { error() {}, warning() {}, info() {} }
      `)
      virtual(/^@\/i18n$/, 'i18n', `
        export const i18n = { global: { t: key => key } }
      `)
      virtual(/^@\/ai\/client\/AgentClient$/, 'agent-client', `
        export const agentClient = globalThis.__iwriterThreadSelectionClient
      `)
      virtual(/^@\/ai\/message\/display-normalizer$/, 'display-normalizer', `
        export function normalizeThreadMessageForDisplay(message) { return message }
        export function normalizeThreadMessagesForDisplay(messages) { return messages }
      `)
      virtual(/^@\/ai\/thread\/Thread$/, 'thread', `
        export function createThread(providerConfigId, modelId, mode, thinkingLevel, workspacePath) {
          const now = Date.now()
          return { id: 'thread-new-' + now, title: 'New conversation', createdAt: now, updatedAt: now, messages: [], messagesLoaded: false, providerConfigId, modelId, domain: mode === 'creative' ? 'creative' : 'editing', mode, thinkingLevel, workspacePath }
        }
        export function appendMessage(thread, message) { return { ...thread, messages: [...(thread.messages ?? []), message] } }
        export function createMessage(role, content) { return { id: 'message', role, content, timestamp: Date.now() } }
      `)
      virtual(/^@\/ai\/thread\/threadPresentation$/, 'thread-presentation', `
        export function isThreadDraft(state) { return state.localOnly && !state.active && !state.interrupted }
      `)
      virtual(/^@\/stores\/workspaceTransition$/, 'workspace-transition', `
        export function isThreadWorkspaceSelectable(left, right) { return (left ?? null) === (right ?? null) }
      `)
      virtual(/^\.\/settings$/, 'settings', `
        import { computed, ref } from 'vue'
        export function createAiSettingsState(deps) {
          const provider = { id: 'provider-1', defaultModelId: 'model-1', lastSelectedThinkingLevel: 'medium' }
          const settings = ref({ defaultMode: 'edit', providerConfigs: [provider], activeProviderConfigId: provider.id })
          return {
            settings,
            isRuntimeSwitching: ref(false),
            activeProviderConfig: computed(() => provider),
            effectiveProviderConfig: computed(() => provider),
            availableModels: computed(() => [provider.defaultModelId]),
            saveSettings() {}, reloadSettings() {}, updateWebSearchProviderConfig() {},
            setActiveWebSearchProviderConfig() {}, addProviderConfig() {}, updateProviderConfig() {},
            removeProviderConfig() {}, setActiveProvider: async () => true,
            setCurrentModelId: async () => true, setCurrentThinkingLevel() {},
            setCurrentMode(mode) {
              const thread = deps.getActiveThread()
              if (thread) deps.updateThread({ ...thread, mode, domain: mode === 'creative' ? 'creative' : 'editing' })
            },
            applyRuntimeSwitchResolution() {},
          }
        }
      `)
      virtual(/^\.\/run$/, 'run-state', `
        import { computed, ref } from 'vue'
        export function createRuntimeState() {
          const threadRunState = ref('idle')
          const liveTurn = ref(null)
          const currentThreadId = ref(null)
          const currentTurnId = ref(null)
          const interruptedThreadId = ref(null)
          const interruptedTurnId = ref(null)
          const pendingEditProposals = ref([])
          const pendingCreativeReviews = ref([])
          const pendingFilesystemReviews = ref([])
          return {
            threadRunState, liveTurn, currentThreadId, currentTurnId, interruptedThreadId, interruptedTurnId,
            isStreaming: computed(() => false), isInterrupted: computed(() => false),
            streamingText: ref(''), streamingCurrentText: ref(''), streamingBlocks: ref([]),
            streamingThinkingText: ref(''), streamingToolName: ref(null),
            pendingEditProposals, pendingCreativeReviews, pendingFilesystemReviews,
            liveTurnState: computed(() => null), liveTurnThreadId: computed(() => null),
            liveTurnTurnId: computed(() => null), liveTurnStartedAt: computed(() => null),
            startLiveTurn() {}, ensureLiveTurn() {}, clearLiveTurn() {}, clearRunPointers() {},
          }
        }
      `)
      const reviewModule = `
        import { computed } from 'vue'
        export function REVIEW_FACTORY() {
          const noop = () => {}
          return {
            displayOverrides: () => ({ byId: {}, bySignature: {} }),
            interruptActionCount: computed(() => 0),
            isResumingReviewedEdits: computed(() => false),
            isResumingCreativeReview: computed(() => false),
            isResumingFilesystemReview: computed(() => false),
            reviewedToolCallStatuses: computed(() => ({})), reviewedEditSignatures: computed(() => new Set()),
            reviewedBatchEntries: computed(() => []), reviewBatchSummary: computed(() => null),
            getCompletedRoundResult: noop, getCompletedCreativeRoundResult: noop,
            handleInterrupt: noop, resetReviewState: noop, rejectAllPendingProposals: noop,
            rejectAllPendingReviews: noop, approveEditProposal: noop, editAndApproveProposal: noop,
            rejectEditProposal: noop, approveAllProposals: noop, rejectAllProposals: noop,
            approveCreativeReview: noop, editAndApproveCreativeReview: noop, rejectCreativeReview: noop,
            respondCreativeReview: noop, approveAllCreativeReviews: noop, notifyCreativeToolResult: noop,
            finalizePendingCreativeApply: noop, approveFilesystemReview: noop, rejectFilesystemReview: noop,
            approveAllFilesystemReviews: noop, rejectAllFilesystemReviews: noop,
          }
        }
      `
      virtual(/^\.\/reviews\/editing$/, 'editing-review', reviewModule.replace('REVIEW_FACTORY', 'createEditReviewModule'))
      virtual(/^\.\/reviews\/creative$/, 'creative-review', reviewModule.replace('REVIEW_FACTORY', 'createCreativeReviewModule'))
      virtual(/^\.\/reviews\/filesystem$/, 'filesystem-review', reviewModule.replace('REVIEW_FACTORY', 'createFilesystemReviewModule'))
      virtual(/^\.\/pendingCommands$/, 'pending-commands', `
        export function createPendingCommandQueue() {
          return { getCommands: () => [], enqueue() {}, update: () => false, remove: () => null, clearThread() {}, clearAll() {}, createBatch: () => null, removeByIds() {} }
        }
      `)
      virtual(/^\.\/runEvents$/, 'run-events', `
        export function createRuntimeEvents() {
          return { clearThreadUsage() {}, clearAllUsage() {}, resetRunErrorFlag() {}, onStreamChunk() {}, onRunInterrupted() {}, onRunError() {}, onRunDone: async () => ({ completedSuccessfully: false, checkpointRefreshed: false, stillCurrent: false }) }
        }
      `)
      virtual(/^@\/ai\/presentation\/conversation\/buildConversationEntries$/, 'conversation', `
        import { ref } from 'vue'
        export function createConversationPresentation() {
          return { streamingPreviewMessage: ref(null), conversation: ref(null), conversationEntries: ref([]), persistedAssistantMessageIds: ref(new Set()), latestPersistedAssistantMessageId: ref(null) }
        }
      `)
    },
  }
}

async function loadModule() {
  if (!modulePromise) {
    globalThis.__iwriterThreadSelectionClient = client
    const result = await build({
      stdin: {
        contents: `
          export { useAiStore } from './src/ai/state/aiStore.ts'
          export { createPinia, setActivePinia } from 'pinia'
          export { nextTick, reactive } from 'vue'
        `,
        resolveDir: process.cwd(),
        sourcefile: 'ai-store-thread-selection-entry.ts',
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      plugins: [stubPlugin()],
      define: {
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      },
    })
    modulePromise = import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  }
  return modulePromise
}

async function withStore(run) {
  const dom = new JSDOM('', { url: 'http://localhost' })
  const previous = new Map(['window', 'localStorage'].map(key => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]))
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: dom.window })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: dom.window.localStorage })
  try {
    const module = await loadModule()
    globalThis.__iwriterThreadSelectionAppStore = module.reactive({
      currentFolder: '/workspace',
      locale: 'zh-CN',
    })
    module.setActivePinia(module.createPinia())
    const store = module.useAiStore()
    await run({ module, store, storage: dom.window.localStorage })
  } finally {
    delete globalThis.__iwriterThreadSelectionAppStore
    delete globalThis.__iwriterThreadSelectionBackendThreads
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

describe('AI store active thread restoration', () => {
  it('persists a newly selected draft for the next app startup', async () => {
    await withStore(async ({ store, storage }) => {
      const draft = store.createNewThread('/workspace')
      const saved = storage.getItem('iwriter-ai-active-thread-selection')
      assert.ok(saved, 'the active draft selection should be persisted')
      const selection = JSON.parse(saved)

      assert.equal(selection.kind, 'draft')
      assert.equal(selection.thread.id, draft.id)
      assert.equal(selection.thread.workspacePath, '/workspace')
      assert.equal('messages' in selection.thread, false)
    })
  })

  it('keeps the saved draft active when backend history loads on startup', async () => {
    await withStore(async ({ module, store, storage }) => {
      storage.setItem('iwriter-ai-active-thread-selection', JSON.stringify({
        version: 1,
        kind: 'draft',
        thread: {
          id: 'thread-draft',
          title: 'New conversation',
          createdAt: 10,
          updatedAt: 10,
          providerConfigId: 'provider-1',
          modelId: 'model-1',
          mode: 'creative',
          thinkingLevel: 'medium',
          workspacePath: '/workspace',
        },
      }))
      globalThis.__iwriterThreadSelectionBackendThreads = [{
        id: 'thread-history',
        title: 'History',
        createdAt: 1,
        updatedAt: 20,
        messages: [],
        messagesLoaded: false,
        providerConfigId: 'provider-1',
        modelId: 'model-1',
        domain: 'editing',
        mode: 'edit',
        thinkingLevel: 'medium',
        workspacePath: '/workspace',
      }]

      store.init()
      await Promise.resolve()
      await Promise.resolve()
      await module.nextTick()

      assert.equal(store.activeThreadId, 'thread-draft')
      assert.equal(store.activeThread?.mode, 'creative')
      assert.equal(store.isActiveThreadDraft, true)
      assert.deepEqual(store.threads.map(thread => thread.id), ['thread-draft', 'thread-history'])
    })
  })
})
