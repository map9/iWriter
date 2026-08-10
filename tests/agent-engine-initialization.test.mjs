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
          'export class Command { constructor(input) { Object.assign(this, input) } }',
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
          /src\/types\/ai$/,
          'ai-types',
          'export function isAiProviderUsable() { return true } export function resolveApiKeyReference() { return null }',
        ],
        [
          /src\/ai\/model\/token-estimation$/,
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
          'export function buildUserMessage() { return "" }',
        ],
        [
          /runtime\/ThreadRuntimeResolver$/,
          'thread-runtime-resolver',
          'export function resolveThreadRuntime() { return { providerConfig: {}, domain: "editing", mode: "ask", modelId: "test", thinkingLevel: "medium" } }',
        ],
        [
          /runtime\/ThreadRuntimeStore$/,
          'thread-runtime-store',
          'export class ThreadRuntimeStore { getInterrupted() { return null } clearInterrupted() {} buildConfigurable() { return {} } buildContext() { return {} } getCurrentTurnId() { return null } getContext() { return null } }',
        ],
        [
          /scaffold\/filesystem\/AgentFilesystem$/,
          'agent-filesystem',
          'export const FILE_WRITE_INTERRUPT_ON_NAMES = []; export function buildAgentFilesystem() { return { backend: {}, tools: [], middlewares: [], interruptOn: {}, tempDirs: [] } }',
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
          'export const AiConfigStore = { loadSettings() { return { providerConfigs: [{}] } } }; export function resolveAiApiKeyEnvVar() { return null }',
        ],
        [
          /src\/ai\/thread\/title$/,
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
          /scaffold\/middleware\/RateLimitRetryMiddleware$/,
          'rate-limit-retry-middleware',
          'export function createRateLimitRetryMiddleware() { return {} }',
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
          'export class CreativeDomainStrategy { constructor() {} getMemoryDir() { return "creative" } getSkillSources() { return [] } buildCapabilities() { return { tools: [], interruptOn: {}, subAgents: [] } } getSystemPrompt() { return "system" } getSummarizationProfile() { return { domain: "creative", domainStateInstructions: ["creative-state"] } } }',
        ],
        [
          /src\/ai\/message\/detectInputLanguage$/,
          'detect-input-language',
          'export function detectInputLanguage() { return "en-US" }',
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
        entryPoints: ['src/ai/model/model-budget.ts'],
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
      visible: true,
      currentTokens: 0,
      triggerTokens: 108800,
      requestBudgetTokens: 128000,
      keepTokens: 12800,
      maxInputTokens: undefined,
    })
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

    const options = globalThis.__iwriterDeepAgentOptions.summarizationMiddlewareOptions
    assert.deepEqual(options.trigger, { type: 'tokens', value: 320000 })
    assert.deepEqual(options.keep, { type: 'tokens', value: 40000 })
    assert.equal(options.trimTokensToSummarize, 320000)
    assert.equal(options.model.runtime.modelId, 'deepseek-v4-pro')
    assert.equal(options.model.runtime.thinkingLevel, 'medium')
    assert.equal(options.model.runtime.disableThinking, true)
    assert.match(options.summaryPrompt, /editing-state/)
    assert.match(options.summaryPrompt, /\{conversation\}/)
    assert.equal(
      globalThis.__iwriterDeepAgentOptions.middleware.some(
        middleware => middleware?.name === 'ContextLedgerMiddleware',
      ),
      false,
    )
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
    const abortController = new AbortController()
    let runtimeCleared = false

    engine.activeRuns.set('thread-steer', abortController)
    engine.activeRunTasks.set('thread-steer', release.promise)
    engine.runtimeStore = {
      clearInterrupted() {},
      getCurrentTurnId() { return 'turn-1' },
      clearCurrentTurnId() { runtimeCleared = true },
    }

    let cancellationSettled = false
    const cancellation = engine.cancel('thread-steer').then(() => {
      cancellationSettled = true
    })
    await new Promise(resolvePromise => setImmediate(resolvePromise))

    assert.equal(abortController.signal.aborted, true)
    assert.equal(cancellationSettled, false)
    assert.equal(runtimeCleared, false)

    release.resolve()
    await cancellation
    assert.equal(runtimeCleared, true)
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
  it('covers every approval-gated filesystem mutation in both locales', async () => {
    const { zh, en } = await loadLocaleMessages()
    const toolNames = ['write_file', 'edit_file', 'rename_file', 'delete_file', 'move_file']

    for (const toolName of toolNames) {
      assert.equal(typeof zh.agentPanel.chatArea.toolNames[toolName], 'string', `missing zh ${toolName}`)
      assert.equal(typeof en.agentPanel.chatArea.toolNames[toolName], 'string', `missing en ${toolName}`)
    }
  })
})
