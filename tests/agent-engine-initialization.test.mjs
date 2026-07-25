import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise
let localeModulePromise

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
            export function isAIMessage() { return false }
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
          'export function createDeepAgent() { return { streamEvents() {} } }',
        ],
        [
          /^langchain$/,
          'langchain',
          'export function modelCallLimitMiddleware() { return {} } export function toolCallLimitMiddleware() { return {} }',
        ],
        [
          /src\/types\/ai$/,
          'ai-types',
          'export function isAiProviderUsable() { return false } export function resolveApiKeyReference() { return null }',
        ],
        [
          /src\/ai\/model\/model-budget$/,
          'model-budget',
          'export const HARD_REQUEST_CEILING_TOKENS = 200000; export function getModelBudgetInfo() { return { triggerTokens: 200000 } }',
        ],
        [
          /src\/ai\/model\/token-estimation$/,
          'token-estimation',
          'export function estimateTextTokens(text) { return String(text ?? "").length }',
        ],
        [
          /providers\/ModelFactory$/,
          'model-factory',
          'export function createChatModel() { return { invoke: async () => ({ content: "" }), profile: {} } }',
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
          'export class RendererEventBridge { constructor() {} sendRunError() {} sendRunDone() {} sendStreamChunk() {} sendRunInterrupted() {} sendContextCompressed() {} sendRunModelFallback() {} sendFilesystemAutoReject() {} }',
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
          'export class ThreadRuntimeStore { getInterrupted() { return null } clearInterrupted() {} buildConfigurable() { return {} } buildContext() { return {} } getCurrentTurnId() { return null } getContext() { return null } getLastSummarizationCutoff() { return undefined } setLastSummarizationCutoff() {} }',
        ],
        [
          /scaffold\/filesystem\/AgentFilesystem$/,
          'agent-filesystem',
          'export const FILE_WRITE_INTERRUPT_ON_NAMES = []; export function buildAgentFilesystem() { return { tools: [], middleware: [], tempDirs: [] } }',
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
          'export const AiConfigStore = { loadSettings() { return { providerConfigs: [] } } }; export function resolveAiApiKeyEnvVar() { return null }',
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
          'export class EditDomainStrategy { constructor() {} getMemoryDir() { return "edit" } }',
        ],
        [
          /domain\/creative\/CreativeDomainStrategy$/,
          'creative-domain-strategy',
          'export class CreativeDomainStrategy { constructor() {} getMemoryDir() { return "creative" } }',
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

describe('AgentEngine initialization', () => {
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
