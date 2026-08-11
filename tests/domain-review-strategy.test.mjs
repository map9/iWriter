import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

function domainReviewDependencyStubs() {
  return {
    name: 'domain-review-native-dependency-stubs',
    setup(buildContext) {
      const stubs = [
        [/src\/types\/ai$/, 'ai-types', `
          export const BLOCK_EDIT_TOOLS = new Set([
            'edit_block', 'insert_block', 'delete_block', 'replace_range', 'create_document',
          ])
          export const CREATIVE_REVIEW_TOOLS = new Set(['confirm_writing_plan'])
        `],
        [/buildCreativeCapabilities$/, 'creative-capabilities', 'export const CREATIVE_INTERRUPT_ON_NAMES = new Set(); export function buildCreativeCapabilities() { return {} }'],
        [/buildEditCapabilities$/, 'edit-capabilities', 'export const EDIT_INTERRUPT_ON_NAMES = new Set(); export function buildEditCapabilities() { return {} }'],
        [/src\/ai\/thread\/system-prompts\/creative$/, 'creative-prompt', 'export function buildCreativeSystemPrompt() { return "" }'],
        [/src\/ai\/thread\/system-prompts\/edit$/, 'edit-prompt', 'export function buildEditSystemPrompt() { return "" }'],
        [/ipc\/CreativeReviewAdapter$/, 'creative-review-adapter', `
          export function buildCreativeReviewItemFromAction() { throw new Error('unexpected creative review') }
          export function enrichCreativeGitReviewItem(item) { return item }
        `],
        [/ipc\/FilesystemReviewAdapter$/, 'filesystem-review-adapter', `
          export function isFilesystemWriteTool() { return false }
          export function buildFilesystemReviewItemFromAction() { throw new Error('unexpected filesystem review') }
        `],
        [/document\/virtualId$/, 'virtual-id', 'export function parseUntitledTabId() { return null }'],
        [/scaffold\/approval\/WritingSessionRegistry$/, 'writing-session-registry', `
          export function isBlockEditToolName(name) {
            return new Set(['edit_block', 'insert_block', 'delete_block', 'replace_range']).has(name)
          }
        `],
        [/scaffold\/skills\/SkillsMount$/, 'skills-mount', 'export function withProjectSkills(paths) { return paths }'],
        [/scaffold\/summarization\/SummarizationFramework$/, 'summarization', 'export const CREATIVE_SUMMARIZATION_PROFILE = {}; export const EDITING_SUMMARIZATION_PROFILE = {}'],
        [/ipc\/MessageAdapter$/, 'message-adapter', `
          export function buildProposalFromAction(name, args, _snapshot, toolCallId, sourceMessageId, sourceTurnId) {
            if (name !== 'create_document') throw new Error('unexpected test tool')
            return {
              id: 'proposal-create-document',
              kind: 'create_file',
              status: 'pending',
              sourceMessageId,
              sourceTurnId,
              filename: args.filename,
              content: args.content,
              toolCallId,
              description: args.reason,
              directory: args.directory,
            }
          }
        `],
      ]

      for (const [filter, path, contents] of stubs) {
        buildContext.onResolve({ filter }, () => ({
          path,
          namespace: 'domain-review-stub',
        }))
        buildContext.onLoad({ filter: new RegExp(`^${path}$`), namespace: 'domain-review-stub' }, () => ({
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
        stdin: {
          contents: `
            export { CreativeDomainStrategy } from './electron/ai/domain/creative/CreativeDomainStrategy.ts'
            export { EditDomainStrategy } from './electron/ai/domain/edit/EditDomainStrategy.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'domain-review-strategy-entry.ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        plugins: [domainReviewDependencyStubs()],
      })
      const code = result.outputFiles[0].text
      try {
        return await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error))
      }
    })()
  }
  return modulePromise
}

function createDocumentAction() {
  return {
    name: 'create_document',
    args: {
      filename: 'ch002.md',
      directory: '/project/manuscript',
      content: '# Chapter 2',
      reason: 'Draft the approved chapter',
    },
  }
}

function interruptContext(action) {
  return {
    threadId: 'thread-create-document',
    turnId: 'turn-create-document',
    actionRequests: [action],
    partialMessage: {
      id: 'assistant-create-document',
      toolCalls: [{ id: 'call-create-document', name: action.name, arguments: action.args }],
    },
  }
}

function assertCreateFileReview(review) {
  assert.equal(review.kind, 'edit')
  assert.deepEqual(review.payload, {
    id: 'proposal-create-document',
    kind: 'create_file',
    status: 'pending',
    sourceMessageId: 'assistant-create-document',
    sourceTurnId: 'turn-create-document',
    filename: 'ch002.md',
    content: '# Chapter 2',
    toolCallId: 'call-create-document',
    description: 'Draft the approved chapter',
    directory: '/project/manuscript',
  })
}

async function buildReviewsOrFail(strategy, context) {
  try {
    return await strategy.buildReviewItems(context)
  } catch (error) {
    assert.fail(error instanceof Error ? error.message : String(error))
  }
}

describe('domain review strategies — create_document', () => {
  it('builds a Creative create-file review without requiring file_path', async () => {
    const { CreativeDomainStrategy } = await loadModule()
    const strategy = new CreativeDomainStrategy(
      { requestSnapshot: async () => null },
      {},
      '/tmp/ai',
      { getContext: () => ({ workspacePath: '/project' }) },
      {},
      () => {},
    )

    const [review] = await buildReviewsOrFail(strategy, interruptContext(createDocumentAction()))

    assertCreateFileReview(review)
  })

  it('builds an Edit create-file review without requiring file_path', async () => {
    const { EditDomainStrategy } = await loadModule()
    const strategy = new EditDomainStrategy(
      { requestSnapshot: async () => null },
      {},
      '/tmp/ai',
    )

    const [review] = await buildReviewsOrFail(strategy, interruptContext(createDocumentAction()))

    assertCreateFileReview(review)
  })
})
