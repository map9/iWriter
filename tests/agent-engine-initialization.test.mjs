import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise
let localeModulePromise
let budgetModulePromise

function stubPlugin() {
  return {
    name: 'agent-engine-init-stubs',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^electron$/ }, () => ({
        path: 'electron',
        namespace: 'electron-stub',
      }))

      buildContext.onLoad({ filter: /.*/, namespace: 'electron-stub' }, () => ({
        contents: `
          const electron = {
            app: {
              isPackaged: false,
              getPath() { return '/tmp/iwriter-agent-engine-test' },
              getAppPath() { return process.cwd() },
              getVersion() { return '0-test' },
            },
          }
          export const app = electron.app
          export const ipcMain = { handle() {}, removeHandler() {} }
          export default electron
        `,
        loader: 'js',
      }))

      const stubs = [
        [
          /^@langchain\/core\/messages$/,
          'langchain-messages',
          `
            export class HumanMessage { constructor(content) { this.content = content } }
            export class SystemMessage { constructor(content) { this.content = content } }
            export function isAIMessage(message) { return message?._getType?.() === 'ai' }
            export function isToolMessage() { return false }
            export function isHumanMessage() { return false }
          `,
        ],
        [
          /^@langchain\/langgraph$/,
          'langgraph',
          `
            export class Command { constructor(input) { Object.assign(this, input) } }
            export class StreamChannel {
              static local() { return new StreamChannel() }
              push() {}
              close() {}
              fail() {}
            }
          `,
        ],
        [
          /^deepagents$/,
          'deepagents',
          'export function createDeepAgent(options) { globalThis.__iwriterDeepAgentOptions = options; return { streamEvents() {} } }',
        ],
        [
          /^langchain$/,
          'langchain',
          'export function createMiddleware(config) { return config } export function modelCallLimitMiddleware() { return {} } export function toolCallLimitMiddleware() { return {} }',
        ],
        [
          /shared\/ai\/contracts$/,
          'ai-types',
          'export function isAiProviderUsable() { return true } export function resolveApiKeyReference() { return null }',
        ],
        [
          /shared\/ai\/core\/tokenEstimation$/,
          'token-estimation',
          'export function estimateTextTokens(text) { return String(text ?? "").length }',
        ],
        [
          /providers\/ModelFactory$/,
          'model-factory',
          `
            export function createChatModel(config, runtime = {}) {
              const model = {
                invoke: async () => ({ content: "" }),
                profile: config?.type === "deepseek" ? { maxInputTokens: 1000000 } : {},
                runtime,
              }
              globalThis.__iwriterCreatedChatModels ??= []
              globalThis.__iwriterCreatedChatModels.push(model)
              return model
            }
          `,
        ],
        [
          /document\/SnapshotBroker$/,
          'snapshot-broker',
          'export class SnapshotBroker { constructor() {} }',
        ],
        [
          /document\/EditorStateBroker$/,
          'editor-state-broker',
          'export class EditorStateBroker { constructor() {} }',
        ],
        [
          /checkpoint\/CheckpointerFactory$/,
          'checkpointer',
          'export async function getCheckpointer() { return { checkpointer: {}, backend: "memory", db: null } }',
        ],
        [
          /thread\/ThreadListQuery$/,
          'thread-list-query',
          'export class ThreadListQuery { loadMetas() { return [] } } export function metaToAiThread(meta) { return meta }',
        ],
        [
          /ipc\/MessageAdapter$/,
          'message-adapter',
          'export function convertLcMessages() { return [] }',
        ],
        [
          /ipc\/StreamEventAdapter$/,
          'stream-event-adapter',
          'export class StreamEventAdapter { constructor() {} }',
        ],
        [
          /ipc\/RendererEventBridge$/,
          'renderer-event-bridge',
          'export class RendererEventBridge { constructor() {} sendRunError() {} sendRunDone() {} sendStreamChunk() {} sendRunInterrupted() {} sendRunModelFallback() {} sendFilesystemAutoReject() {} }',
        ],
        [
          /ipc\/UserMessageBuilder$/,
          'user-message-builder',
          `
            export function buildUserMessage() {
              if (globalThis.__iwriterBuildUserMessageError) {
                throw globalThis.__iwriterBuildUserMessageError
              }
              return ""
            }
          `,
        ],
        [
          /runtime\/ThreadRuntimeResolver$/,
          'thread-runtime-resolver',
          `
            export function resolveThreadRuntime(settings, request, meta) {
              if (globalThis.__iwriterResolveRuntime) {
                return globalThis.__iwriterResolveRuntime('next', request, meta)
              }
              return { providerConfig: {}, domain: "editing", mode: "ask", modelId: "test", thinkingLevel: "medium" }
            }
            export function resolveResumeThreadRuntime(settings, meta) {
              if (globalThis.__iwriterResolveRuntime) {
                return globalThis.__iwriterResolveRuntime('active', undefined, meta)
              }
              return resolveThreadRuntime(settings, undefined, meta)
            }
          `,
        ],
        [
          /runtime\/ThreadRuntimeStore$/,
          'thread-runtime-store',
          `
            export class ThreadRuntimeStore {
              interrupted = new Map()
              currentTurnIds = new Map()
              contexts = new Map()
              getInterrupted(threadId) { return this.interrupted.get(threadId) ?? null }
              setInterrupted(threadId, value) { this.interrupted.set(threadId, value) }
              clearInterrupted(threadId) { this.interrupted.delete(threadId) }
              setCurrentTurnId(threadId, turnId) { this.currentTurnIds.set(threadId, turnId) }
              getCurrentTurnId(threadId) { return this.currentTurnIds.get(threadId) ?? null }
              clearCurrentTurnId(threadId) { this.currentTurnIds.delete(threadId) }
              setContext(threadId, context) { this.contexts.set(threadId, context) }
              getContext(threadId) { return this.contexts.get(threadId) ?? null }
              buildContext() { return {} }
              deleteThread(threadId) { this.interrupted.delete(threadId); this.currentTurnIds.delete(threadId); this.contexts.delete(threadId) }
              clear() { this.interrupted.clear(); this.currentTurnIds.clear(); this.contexts.clear() }
            }
          `,
        ],
        [
          /scaffold\/filesystem\/AgentFilesystem$/,
          'agent-filesystem',
          'export const FILE_WRITE_INTERRUPT_ON_NAMES = []; export function buildAgentFilesystem(input) { return { backend: {}, tools: [], middlewares: [], interruptOn: {}, tempDirs: [], workspaceSystemPrompt: "Current Workspace: " + JSON.stringify(input.workspacePath) } }',
        ],
        [
          /scaffold\/approval\/FilesystemApprovalPolicy$/,
          'filesystem-approval',
          'export function decideFilesystemWriteApproval() { return { kind: "requires-review" } } export function isFilesystemWriteToolName() { return false }',
        ],
        [
          /scaffold\/approval\/WritingSessionRegistry$/,
          'writing-session-registry',
          'export class WritingSessionRegistry { constructor() {} } export function currentRootToolCallsFromMessages() { return undefined } export function decideWritingSessionApproval() { return { kind: "requires-review" } } export function decideDelegatedWriteGate() { return { kind: "pass" } } export function delegatedActionIndices() { return new Set() } export function isBlockEditToolName() { return false }',
        ],
        [
          /config\/AiConfigStore$/,
          'ai-config-store',
          'export const AiConfigStore = { loadSettings() { return { providerConfigs: [{}] } }, rememberProviderConfig() { return "revision-test" }, loadProviderConfigRevision() { return {} } }; export function resolveAiApiKeyEnvVar() { return null }',
        ],
        [
          /shared\/ai\/core\/threadTitle$/,
          'thread-title',
          'export function generateThreadTitle() { return "New conversation" }',
        ],
        [
          /runtime\/AgentContext$/,
          'agent-context',
          'export const IWriterAgentContextSchema = {}',
        ],
        [
          /scaffold\/middleware\/TaskToolCompatMiddleware$/,
          'task-tool-compat-middleware',
          'export function createTaskToolCompatMiddleware() { return {} }',
        ],
        [
          /scaffold\/middleware\/OrphanToolCallStripperMiddleware$/,
          'orphan-tool-call-stripper-middleware',
          'export function createOrphanToolCallStripperMiddleware() { return {} }',
        ],
        [
          /scaffold\/middleware\/ModelNetworkResilience$/,
          'model-network-resilience',
          'export function createModelNetworkRetryMiddleware() { return { name: "modelRetryMiddleware" } } export function toUserFacingModelError(error) { return error instanceof Error ? error.message : String(error) }',
        ],
        [
          /scaffold\/summarization\/IWriterSummarizationMiddleware$/,
          'iwriter-summarization-middleware',
          'export function createIWriterSummarizationMiddleware(options) { return { name: "SummarizationMiddleware", options } }',
        ],
        [
          /scaffold\/middleware\/HumanRespondMessageMiddleware$/,
          'human-respond-message-middleware',
          'export const RESPOND_MARKER = "__respond__"; export function createHumanRespondMessageMiddleware() { return {} }',
        ],
        [
          /checkpoint\/CheckpointerAdmin$/,
          'checkpointer-admin',
          'export class CheckpointerAdmin { constructor() {} }',
        ],
        [
          /scaffold\/middleware\/middleware-config$/,
          'middleware-config',
          'export const MIDDLEWARE_CONFIG = {}; export function createInstrumentedFallbackMiddleware() { return {} }',
        ],
        [
          /scaffold\/memory\/MemorySources$/,
          'memory-sources',
          'export function buildMemorySources() { return [] } export function createReadonlyMemoryMiddleware() { return {} }',
        ],
        [
          /domain\/edit\/EditDomainStrategy$/,
          'edit-domain-strategy',
          'export class EditDomainStrategy { constructor() {} getMemoryDir() { return "edit" } getSkillSources() { return [] } buildCapabilities() { return { tools: [], interruptOn: {}, subAgents: [] } } getSystemPrompt() { return "system" } getSummarizationProfile() { return { domain: "editing", domainStateInstructions: ["editing-state"] } } }',
        ],
        [
          /domain\/creative\/CreativeDomainStrategy$/,
          'creative-domain-strategy',
          'export class CreativeDomainStrategy { constructor() {} getMemoryDir() { return "creative" } getSkillSources() { return ["/Users/author/.iwriter/skills"] } buildCapabilities() { return { tools: [], interruptOn: {}, subAgents: [{ name: "writer", description: "Writer", systemPrompt: "writer prompt" }] } } getSystemPrompt() { return "system" } getSummarizationProfile() { return { domain: "creative", domainStateInstructions: ["creative-state"] } } }',
        ],
      ]

      for (const [filter, path, contents] of stubs) {
        buildContext.onResolve({ filter }, () => ({ path, namespace: 'agent-engine-stub' }))
        buildContext.onLoad({ filter: new RegExp(`^${path}$`), namespace: 'agent-engine-stub' }, () => ({
          contents,
          loader: 'js',
        }))
      }
    },
  }
}

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/AgentEngine.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        plugins: [stubPlugin()],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return modulePromise
}

async function loadLocaleMessages() {
  if (!localeModulePromise) {
    localeModulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            import zh from './src/i18n/messages/zh-CN.ts'
            import en from './src/i18n/messages/en-US.ts'
            export { zh, en }
          `,
          resolveDir: process.cwd(),
          sourcefile: 'agent-tool-i18n-test-entry.ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return localeModulePromise
}

async function loadBudgetModule() {
  if (!budgetModulePromise) {
    budgetModulePromise = (async () => {
      const result = await build({
        entryPoints: ['shared/ai/core/modelBudget.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return budgetModulePromise
}

describe('AgentEngine initialization', () => {
  it('rehydrates checkpoint interrupts before conversion and preserves the legacy error boundary', async () => {
    const { AgentEngine } = await loadModule()
    const calls = []
    const rawMessages = [{ type: 'ai' }]

    class InitializedAgentEngine extends AgentEngine {
      async initialize() {
        this.threadService = {
          readCheckpointMessages: async () => rawMessages,
          convertMessages: () => {
            calls.push('convert')
            throw new Error('invalid message content')
          },
        }
      }

      async _maybeRehydrateInterrupt(_threadId, messages) {
        assert.equal(messages, rawMessages)
        calls.push('rehydrate')
      }
    }

    const engine = new InitializedAgentEngine(() => null)
    const originalError = console.error
    console.error = () => {}
    try {
      assert.deepEqual(await engine.getThreadMessages('thread-1'), [])
    } finally {
      console.error = originalError
    }
    assert.deepEqual(calls, ['rehydrate', 'convert'])
  })

  it('returns an empty message list when checkpoint interrupt rehydration fails', async () => {
    const { AgentEngine } = await loadModule()
    let converted = false

    class InitializedAgentEngine extends AgentEngine {
      async initialize() {
        this.threadService = {
          readCheckpointMessages: async () => [{ type: 'ai' }],
          convertMessages: () => {
            converted = true
            return [{ role: 'assistant', content: 'unexpected' }]
          },
        }
      }

      async _maybeRehydrateInterrupt() {
        throw new Error('rehydration failed')
      }
    }

    const engine = new InitializedAgentEngine(() => null)
    const originalError = console.error
    console.error = () => {}
    try {
      assert.deepEqual(await engine.getThreadMessages('thread-1'), [])
    } finally {
      console.error = originalError
    }
    assert.equal(converted, false)
  })

  it('keeps a pending interrupt when message construction fails before a new run starts', async () => {
    const { AgentEngine } = await loadModule()
    const pending = { actionRequestCount: 1, actionNames: ['edit_block'] }
    let clearCalls = 0

    class InitializedAgentEngine extends AgentEngine {
      async initialize() {
        this.runtimeStore.setInterrupted('thread-1', pending)
        this.threadService = {
          prepareTurn: () => ({
            threadId: 'thread-1',
            turnId: 'turn-2',
            isNewThread: false,
            runtime: {
              providerConfig: {},
              domain: 'editing',
              mode: 'edit',
              modelId: 'model-1',
              thinkingLevel: 'medium',
            },
            language: 'zh-CN',
          }),
          clearStaleInterrupt: () => {
            clearCalls += 1
            this.runtimeStore.clearInterrupted('thread-1')
          },
        }
      }
    }

    const engine = new InitializedAgentEngine(() => null)
    globalThis.__iwriterBuildUserMessageError = new Error('attachment unavailable')
    try {
      await assert.rejects(
        engine.sendMessage({ threadId: 'thread-1', userText: '继续' }),
        /attachment unavailable/,
      )
    } finally {
      delete globalThis.__iwriterBuildUserMessageError
    }

    assert.equal(clearCalls, 0)
    assert.equal(engine.runtimeStore.getInterrupted('thread-1'), pending)
  })

  it('validates fixed context before creating first-turn thread metadata', async () => {
    const { AgentEngine } = await loadModule()
    let prepareCalls = 0

    class InitializedAgentEngine extends AgentEngine {
      async initialize() {
        this.threadService = {
          getMeta: () => null,
          prepareTurn: () => {
            prepareCalls += 1
            throw new Error('metadata should not be created')
          },
        }
      }

      _assertWithinBudget() {
        throw new Error('fixed context exceeds budget')
      }
    }

    const engine = new InitializedAgentEngine(() => null)
    await assert.rejects(
      engine.sendMessage({
        threadId: 'thread-local-draft',
        userText: '超大输入',
        domain: 'editing',
        mode: 'edit',
        workspacePath: '/workspace',
      }),
      /fixed context exceeds budget/,
    )

    assert.equal(prepareCalls, 0)
  })

  it('uses ThreadService as the public thread-list facade', async () => {
    const { AgentEngine } = await loadModule()

    class InitializedAgentEngine extends AgentEngine {
      async initialize() {
        this.threadService = {
          listThreads: () => [{ id: 'service-thread' }],
        }
        this.threadListQuery = {
          loadMetas: () => [{ id: 'legacy-thread' }],
        }
      }
    }

    const engine = new InitializedAgentEngine(() => null)

    assert.deepEqual(await engine.getThreads(), [{ id: 'service-thread' }])
  })

  it('counts tool-call arguments once when providers expose both content blocks and tool_calls', async () => {
    const { countContextTokensCjkAware } = await loadModule()
    const args = { file_path: '/tmp/example.md' }
    const message = {
      _getType: () => 'ai',
      content: [
        { type: 'text', text: 'ok' },
        { type: 'tool_call', args },
      ],
      tool_calls: [{ id: 'call-1', name: 'read_file', args }],
    }

    assert.equal(
      countContextTokensCjkAware([message], []),
      'ok'.length + JSON.stringify(args).length,
    )
  })

  it('coalesces concurrent first-use initialization', async () => {
    const { AgentEngine } = await loadModule()
    const release = Promise.withResolvers()

    class SlowInitializeAgentEngine extends AgentEngine {
      initCalls = 0

      async initialize() {
        this.initCalls += 1
        await release.promise
        this.checkpointerInstance = { checkpointer: {}, backend: 'memory', db: null }
        this.threadListQuery = { loadMetas: () => [] }
      }
    }

    const engine = new SlowInitializeAgentEngine(() => null)
    const first = engine.getThreads()
    const second = engine.getThreads()

    await new Promise(resolve => setImmediate(resolve))
    assert.equal(engine.initCalls, 1)

    release.resolve()
    assert.deepEqual(await Promise.all([first, second]), [[], []])
  })

  it('exposes compact stats when the model profile has no maxInputTokens', async () => {
    const { AgentEngine } = await loadModule()

    class InitializedAgentEngine extends AgentEngine {
      async initialize() {
        this.checkpointerInstance = { checkpointer: {}, backend: 'memory', db: null }
        this.threadListQuery = { getMeta: () => null }
      }
    }

    const engine = new InitializedAgentEngine(() => null)
    const stats = await engine.getSessionContextStats({
      domain: 'editing',
      mode: 'edit',
    })

    assert.deepEqual(stats, {
      nextRuntime: {
        modelId: 'test',
        currentTokens: 0,
        triggerTokens: 108800,
        requestBudgetTokens: 128000,
        maxInputTokens: undefined,
      },
    })
  })

  it('reports active and next runtime thresholds without mixing their model budgets', async () => {
    const { AgentEngine } = await loadModule()
    const pendingRuntime = {
      providerConfigId: 'provider-pending',
      modelId: 'pending-model',
      thinkingLevel: 'medium',
    }
    const meta = {
      domain: 'editing',
      mode: 'edit',
      providerConfigId: 'provider-next',
      modelId: 'next-model',
      thinkingLevel: 'medium',
      activeRuntime: {
        turnId: 'turn-1',
        providerConfigId: 'provider-active',
        providerConfigRevision: 'revision-1',
        modelId: 'active-model',
        thinkingLevel: 'medium',
        domain: 'editing',
        mode: 'edit',
        workspacePath: '/workspace',
      },
      pendingRuntime,
    }

    class InitializedAgentEngine extends AgentEngine {
      async initialize() {
        this.checkpointerInstance = {
          checkpointer: { get: async () => null },
          backend: 'memory',
          db: null,
        }
        this.threadService = { getMeta: () => meta }
      }
    }

    globalThis.__iwriterResolveRuntime = phase => ({
      providerConfig: {
        id: `provider-${phase}`,
        type: 'openai-compat',
        maxRequestTokens: phase === 'active' ? 100 : 1000,
      },
      domain: 'editing',
      mode: 'edit',
      modelId: `${phase}-model`,
      thinkingLevel: 'medium',
    })
    try {
      const engine = new InitializedAgentEngine(() => null)
      const stats = await engine.getSessionContextStats({
        threadId: 'thread-1',
        domain: 'editing',
        mode: 'edit',
        threadRuntime: {
          providerConfigId: 'provider-next',
          modelId: 'next-model',
          thinkingLevel: 'medium',
        },
      })

      assert.equal(stats.activeRuntime.modelId, 'active-model')
      assert.equal(stats.activeRuntime.triggerTokens, 85)
      assert.equal(stats.nextRuntime.modelId, 'next-model')
      assert.equal(stats.nextRuntime.triggerTokens, 850)
      assert.equal('pendingRuntime' in stats, false)
    } finally {
      delete globalThis.__iwriterResolveRuntime
    }
  })

  it('passes the effective request budget and disables thinking for DeepAgents summarization', async () => {
    const { AgentEngine } = await loadModule()
    const engine = new AgentEngine(() => null)

    engine._getOrCreateAgent(
      'thread-budget',
      {
        id: 'deepseek',
        type: 'deepseek',
        label: 'DeepSeek',
        apiKey: 'test',
        defaultModelId: 'deepseek-v4-pro',
        enabled: true,
      },
      'editing',
      'edit',
      'deepseek-v4-pro',
      'medium',
    )

    const agentOptions = globalThis.__iwriterDeepAgentOptions
    assert.equal(agentOptions.summarizationMiddlewareOptions, undefined)
    const rootSummary = agentOptions.middleware.find(
      middleware => middleware?.name === 'SummarizationMiddleware',
    )
    const options = rootSummary.options
    assert.deepEqual(options.trigger, { type: 'tokens', value: 320000 })
    assert.deepEqual(options.keep, { type: 'tokens', value: 40000 })
    assert.equal(options.trimTokensToSummarize, 320000)
    assert.equal(options.model.runtime.modelId, 'deepseek-v4-pro')
    assert.equal(options.model.runtime.thinkingLevel, 'medium')
    assert.equal(options.model.runtime.disableThinking, true)
    assert.match(options.summaryPrompt, /editing-state/)
    assert.match(options.summaryPrompt, /\{conversation\}/)
    assert.equal(agentOptions.streamTransformers.length, 1)
    assert.equal(agentOptions.middleware.at(-1)?.name, 'modelRetryMiddleware')
    assert.equal(
      globalThis.__iwriterDeepAgentOptions.middleware.some(
        middleware => middleware?.name === 'ContextLedgerMiddleware',
      ),
      false,
    )
  })

  it('adds the dynamic workspace context to declarative subagent prompts', async () => {
    const { AgentEngine } = await loadModule()
    const engine = new AgentEngine(() => null)
    engine.runtimeStore = {
      getContext() {
        return { workspacePath: '/Users/author/Books/novel' }
      },
    }

    engine._getOrCreateAgent(
      'thread-workspace-prompt',
      {
        id: 'deepseek',
        type: 'deepseek',
        label: 'DeepSeek',
        apiKey: 'test',
        defaultModelId: 'deepseek-chat',
        enabled: true,
      },
      'creative',
      'edit',
      'deepseek-chat',
      'medium',
    )

    const [subagent] = globalThis.__iwriterDeepAgentOptions.subagents
    assert.match(subagent.systemPrompt, /Current Workspace: "\/Users\/author\/Books\/novel"/)
    assert.match(subagent.systemPrompt, /writer prompt/)
    assert.equal(subagent.middleware.at(-1)?.name, 'modelRetryMiddleware')
    const rootSummary = globalThis.__iwriterDeepAgentOptions.middleware.find(
      middleware => middleware?.name === 'SummarizationMiddleware',
    )
    const subagentSummary = subagent.middleware.find(
      middleware => middleware?.name === 'SummarizationMiddleware',
    )
    assert.ok(rootSummary)
    assert.ok(subagentSummary)
    assert.notEqual(rootSummary, subagentSummary)
    assert.deepEqual(globalThis.__iwriterDeepAgentOptions.skills, [
      '/Users/author/.iwriter/skills',
    ])
  })

  it('persists initial and resumed runs only when the graph exits', async () => {
    const { AgentEngine } = await loadModule()
    const runConfigs = []

    class RunConfigAgentEngine extends AgentEngine {
      _getOrCreateAgent() {
        return {}
      }

      async _streamLoop(_threadId, _agent, _input, runConfig) {
        runConfigs.push(runConfig)
      }
    }

    const engine = new RunConfigAgentEngine(() => null)
    const provider = {
      id: 'provider',
      type: 'deepseek',
      label: 'DeepSeek',
      apiKey: 'test',
      defaultModelId: 'deepseek-chat',
      enabled: true,
    }

    await engine._runSession(
      'thread-exit-durability',
      provider,
      'editing',
      'edit',
      'deepseek-chat',
      'medium',
      'hello',
      'en-US',
    )
    await engine._continueSession(
      'thread-exit-durability',
      provider,
      'editing',
      'edit',
      'deepseek-chat',
      'medium',
      {},
      'en-US',
    )

    assert.deepEqual(
      runConfigs.map(config => ({ durability: config.durability, phase: config.metadata.phase })),
      [
        { durability: 'exit', phase: 'initial' },
        { durability: 'exit', phase: 'resume' },
      ],
    )
  })

  it('waits for an aborted run to settle before cancellation completes', async () => {
    const { AgentEngine } = await loadModule()
    const engine = new AgentEngine(() => null)
    const release = Promise.withResolvers()

    const abortController = engine.agentRunner.begin('thread-steer')
    engine.agentRunner.track('thread-steer', release.promise)
    engine.runtimeStore.setCurrentTurnId('thread-steer', 'turn-1')

    let cancellationSettled = false
    const cancellation = engine.cancel('thread-steer').then(() => {
      cancellationSettled = true
    })
    await new Promise(resolvePromise => setImmediate(resolvePromise))

    assert.equal(abortController.signal.aborted, true)
    assert.equal(cancellationSettled, false)
    assert.equal(engine.runtimeStore.getCurrentTurnId('thread-steer'), 'turn-1')

    release.resolve()
    await cancellation
    assert.equal(engine.runtimeStore.getCurrentTurnId('thread-steer'), null)
  })

  it('completes active runtime metadata when cancellation finishes', async () => {
    const { AgentEngine } = await loadModule()
    const engine = new AgentEngine(() => null)
    const completed = []
    engine.threadService = {
      cancel: async () => {},
      getMeta: () => null,
      completeTurn: threadId => completed.push(threadId),
    }

    await engine.cancel('thread-cancel')

    assert.deepEqual(completed, ['thread-cancel'])
  })

  it('keeps the interrupt through frozen runtime resolution and terminates on resolution failure', async () => {
    const { AgentEngine } = await loadModule()
    const engine = new AgentEngine(() => null)
    const interrupted = { actionRequestCount: 1, actionNames: ['edit_block'], turnId: 'turn-1' }
    const events = []
    const completed = []
    engine.runtimeStore.setInterrupted('thread-resume', interrupted)
    engine.runtimeStore.setCurrentTurnId('thread-resume', 'turn-1')
    engine.threadService = {
      getMeta: () => ({ activeRuntime: { providerConfigRevision: 'revision-missing' } }),
      touchThread: () => {},
      completeTurn: threadId => completed.push(threadId),
    }
    engine.rendererBridge = {
      sendRunError: event => events.push({ type: 'error', event }),
      sendRunDone: event => events.push({ type: 'done', event }),
    }
    globalThis.__iwriterResolveRuntime = phase => {
      assert.equal(phase, 'active')
      assert.equal(engine.runtimeStore.getInterrupted('thread-resume'), interrupted)
      throw new Error('frozen provider revision unavailable')
    }

    const originalConsoleError = console.error
    console.error = () => {}
    try {
      await engine.resumeRun('thread-resume', [{ type: 'approved' }])
    } finally {
      console.error = originalConsoleError
      delete globalThis.__iwriterResolveRuntime
    }

    assert.equal(engine.runtimeStore.getInterrupted('thread-resume'), null)
    assert.equal(engine.runtimeStore.getCurrentTurnId('thread-resume'), null)
    assert.deepEqual(completed, ['thread-resume'])
    assert.equal(events.length, 2)
    assert.equal(events[0].type, 'error')
    assert.match(events[0].event.error, /frozen provider revision unavailable/)
    assert.equal(events[1].type, 'done')
  })
})

describe('Effective model budget', () => {
  it('limits DeepSeek requests to 400k and starts summarization at 320k', async () => {
    const { resolveEffectiveModelBudget } = await loadBudgetModule()

    assert.deepEqual(
      resolveEffectiveModelBudget(
        { type: 'deepseek' },
        'deepseek-chat',
        { maxInputTokens: 1000000 },
      ),
      {
        maxInputTokens: 1000000,
        requestBudgetTokens: 400000,
        triggerTokens: 320000,
        keepTokens: 40000,
        source: 'builtin-provider',
      },
    )
  })

  it('uses built-in provider policy for existing and newly released OpenAI models', async () => {
    const { resolveEffectiveModelBudget } = await loadBudgetModule()
    const config = { type: 'openai-compat', presetId: 'openai' }

    assert.deepEqual(
      resolveEffectiveModelBudget(config, 'gpt-5.4', { maxInputTokens: 1050000 }),
      {
        maxInputTokens: 1050000,
        requestBudgetTokens: 400000,
        triggerTokens: 340000,
        keepTokens: 40000,
        source: 'builtin-provider',
      },
    )
    assert.equal(
      resolveEffectiveModelBudget(config, 'gpt-new-model', { maxInputTokens: 1000000 })
        .requestBudgetTokens,
      400000,
    )
    assert.equal(
      resolveEffectiveModelBudget(config, 'gpt-even-newer-model').requestBudgetTokens,
      128000,
    )
  })

  it('applies model exceptions and caps overrides at the physical context limit', async () => {
    const { resolveEffectiveModelBudget } = await loadBudgetModule()
    const config = {
      type: 'openai-compat',
      presetId: 'openai',
      modelPolicies: {
        custom: { maxRequestTokens: 50000 },
      },
    }

    assert.equal(
      resolveEffectiveModelBudget(config, 'gpt-5.4-pro', { maxInputTokens: 1050000 })
        .requestBudgetTokens,
      128000,
    )
    assert.deepEqual(
      resolveEffectiveModelBudget(config, 'custom', { maxInputTokens: 16000 }),
      {
        maxInputTokens: 16000,
        requestBudgetTokens: 16000,
        triggerTokens: 13600,
        keepTokens: 1600,
        source: 'model-override',
      },
    )
  })

  it('uses a conservative fallback only for unknown compatible providers', async () => {
    const { resolveEffectiveModelBudget } = await loadBudgetModule()
    const budget = resolveEffectiveModelBudget(
      { type: 'openai-compat', presetId: 'custom', baseUrl: 'https://example.com/v1' },
      'brand-new-model',
      { maxInputTokens: 1000000 },
    )

    assert.equal(budget.requestBudgetTokens, 128000)
    assert.equal(budget.triggerTokens, 108800)
    assert.equal(budget.keepTokens, 12800)
    assert.equal(budget.source, 'unknown-model')
  })
})

describe('Agent tool-name translations', () => {
  it('covers editor-state and approval-gated filesystem tools in both locales', async () => {
    const { zh, en } = await loadLocaleMessages()
    const toolNames = [
      'get_editor_state',
      'git',
      'write_file',
      'edit_file',
      'rename_file',
      'delete',
      'move_file',
    ]

    for (const toolName of toolNames) {
      assert.equal(typeof zh.agentPanel.chatArea.toolNames[toolName], 'string', `missing zh ${toolName}`)
      assert.equal(typeof en.agentPanel.chatArea.toolNames[toolName], 'string', `missing en ${toolName}`)
    }
  })
})
