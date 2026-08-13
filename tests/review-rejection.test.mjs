import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { resolve } from 'node:path'

const EDIT_REJECTION = 'The user rejected this proposal. Do not retry or automatically propose a replacement. Briefly acknowledge and ask what the user wants changed.'
const EDIT_BATCH_REJECTION = 'The user rejected all proposals in this batch. Do not retry or automatically propose replacements. Briefly acknowledge and ask what the user wants changed.'
const FILESYSTEM_REJECTION = 'The user rejected this file operation. Do not retry automatically. Briefly acknowledge and wait for the user to redirect.'
const FILESYSTEM_BATCH_REJECTION = 'The user rejected all file operations in this batch. Do not retry automatically. Briefly acknowledge and wait for the user to redirect.'

let reviewModulesPromise

async function loadReviewModules() {
  if (!reviewModulesPromise) {
    reviewModulesPromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export { ref } from 'vue'
            export { createEditReviewModule } from './src/ai/state/reviews/editing.ts'
            export { createFilesystemReviewModule } from './src/ai/state/reviews/filesystem.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'review-rejection-test-entry.ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        alias: {
          '@': resolve('src'),
        },
        plugins: [{
          name: 'review-rejection-stubs',
          setup(buildApi) {
            buildApi.onResolve({ filter: /^@\/ai\/review\/common\/executor$/ }, () => ({
              path: 'review-executor',
              namespace: 'test-stub',
            }))
            buildApi.onResolve({ filter: /^@\/ai\/review\/common\/selectors$/ }, () => ({
              path: 'review-selectors',
              namespace: 'test-stub',
            }))
            buildApi.onResolve({ filter: /^@\/ai\/review\/common\/threadSync$/ }, () => ({
              path: 'review-thread-sync',
              namespace: 'test-stub',
            }))
            buildApi.onLoad({ filter: /^review-executor$/, namespace: 'test-stub' }, () => ({
              contents: `
                export async function flushReviewedBatch() {}
                export function normalizeEditedArgsForProposal(_proposal, editedArgs) { return editedArgs }
              `,
              loader: 'js',
            }))
            buildApi.onLoad({ filter: /^review-selectors$/, namespace: 'test-stub' }, () => ({
              contents: `
                export function buildEditRoundResult() { return null }
                export function mergeEditRoundResults() { return null }
                export function buildProposalReviewEntries() { return [] }
                export function buildProposalReviewSummary() { return null }
              `,
              loader: 'js',
            }))
            buildApi.onLoad({ filter: /^review-thread-sync$/, namespace: 'test-stub' }, () => ({
              contents: `
                export function createReviewThreadSync() {
                  return {
                    displayOverrides() { return { byId: {}, bySignature: {} } },
                    updateLocalProposalToolCall() {},
                  }
                }
              `,
              loader: 'js',
            }))
          },
        }],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return reviewModulesPromise
}

function createRuntimeDeps(ref, captureResume) {
  const liveTurnRef = ref(null)
  const ensureLiveTurn = (params = {}) => {
    if (!liveTurnRef.value) {
      liveTurnRef.value = {
        threadId: params.threadId ?? 'thread-1',
        turnId: params.turnId ?? 'turn-1',
        state: params.state ?? 'interrupted',
        startedAt: params.startedAt ?? 1,
        contentBlocks: [],
        reviews: [],
      }
    }
    return liveTurnRef.value
  }

  globalThis.window = {
    electronAPI: {
      aiResume(payload) {
        captureResume(payload)
      },
    },
  }

  return {
    interruptedThreadId: ref(null),
    interruptedTurnId: ref(null),
    threadRunState: ref('idle'),
    currentThreadId: ref(null),
    currentTurnId: ref(null),
    liveTurnRef,
    ensureLiveTurn,
  }
}

function createProposal(id) {
  return {
    id,
    kind: 'create_file',
    status: 'pending',
    filename: `${id}.md`,
    content: '# Draft',
  }
}

function createFilesystemReview(id) {
  return {
    id,
    kind: 'filesystem',
    status: 'pending',
    toolName: 'write_file',
    targetPath: `/workspace/${id}.md`,
  }
}

describe('approval rejection guidance', () => {
  it('asks for direction after one content proposal is rejected', async () => {
    const { createEditReviewModule, ref } = await loadReviewModules()
    const proposals = [createProposal('proposal-1')]
    let resumed
    const runtime = createRuntimeDeps(ref, payload => { resumed = payload })
    const review = createEditReviewModule({
      ...runtime,
      appStore: { createTab() {} },
      activeThread: ref(null),
      pendingEditProposals: ref(proposals),
      normalizeMessagesForDisplay: messages => messages,
      updateThread() {},
    })

    review.handleInterrupt({ threadId: 'thread-1', turnId: 'turn-1', proposals })
    await review.rejectEditProposal('proposal-1')

    assert.equal(resumed.decisions[0].message, EDIT_REJECTION)
  })

  it('asks once for direction after all content proposals are rejected', async () => {
    const { createEditReviewModule, ref } = await loadReviewModules()
    const proposals = [createProposal('proposal-1'), createProposal('proposal-2')]
    let resumed
    const runtime = createRuntimeDeps(ref, payload => { resumed = payload })
    const review = createEditReviewModule({
      ...runtime,
      appStore: { createTab() {} },
      activeThread: ref(null),
      pendingEditProposals: ref(proposals),
      normalizeMessagesForDisplay: messages => messages,
      updateThread() {},
    })

    review.handleInterrupt({ threadId: 'thread-1', turnId: 'turn-1', proposals })
    await review.rejectAllProposals()

    assert.deepEqual(resumed.decisions.map(decision => decision.message), [
      EDIT_BATCH_REJECTION,
      EDIT_BATCH_REJECTION,
    ])
  })

  it('stops after one or all filesystem operations are rejected', async () => {
    const { createFilesystemReviewModule, ref } = await loadReviewModules()
    const reviews = [createFilesystemReview('filesystem-1'), createFilesystemReview('filesystem-2')]
    const domainReviews = reviews.map(payload => ({ kind: 'filesystem', payload }))
    const resumedPayloads = []

    const singleRuntime = createRuntimeDeps(ref, payload => { resumedPayloads.push(payload) })
    const singleReview = createFilesystemReviewModule({
      ...singleRuntime,
      pendingFilesystemReviews: ref([reviews[0]]),
    })
    singleReview.handleInterrupt({ threadId: 'thread-1', turnId: 'turn-1', reviews: [domainReviews[0]] })
    await singleReview.rejectFilesystemReview('filesystem-1')

    const batchRuntime = createRuntimeDeps(ref, payload => { resumedPayloads.push(payload) })
    const batchReview = createFilesystemReviewModule({
      ...batchRuntime,
      pendingFilesystemReviews: ref(reviews),
    })
    batchReview.handleInterrupt({ threadId: 'thread-2', turnId: 'turn-2', reviews: domainReviews })
    await batchReview.rejectAllFilesystemReviews()

    assert.equal(resumedPayloads[0].decisions[0].message, FILESYSTEM_REJECTION)
    assert.deepEqual(resumedPayloads[1].decisions.map(decision => decision.message), [
      FILESYSTEM_BATCH_REJECTION,
      FILESYSTEM_BATCH_REJECTION,
    ])
  })

  it('preserves an explicit rejection reason', async () => {
    const { createEditReviewModule, createFilesystemReviewModule, ref } = await loadReviewModules()
    const resumedPayloads = []

    const proposal = createProposal('proposal-1')
    const editRuntime = createRuntimeDeps(ref, payload => { resumedPayloads.push(payload) })
    const editReview = createEditReviewModule({
      ...editRuntime,
      appStore: { createTab() {} },
      activeThread: ref(null),
      pendingEditProposals: ref([proposal]),
      normalizeMessagesForDisplay: messages => messages,
      updateThread() {},
    })
    editReview.handleInterrupt({ threadId: 'thread-1', turnId: 'turn-1', proposals: [proposal] })
    await editReview.rejectEditProposal('proposal-1', 'Keep the existing chapter structure.')

    const filesystem = createFilesystemReview('filesystem-1')
    const filesystemRuntime = createRuntimeDeps(ref, payload => { resumedPayloads.push(payload) })
    const filesystemReview = createFilesystemReviewModule({
      ...filesystemRuntime,
      pendingFilesystemReviews: ref([filesystem]),
    })
    filesystemReview.handleInterrupt({
      threadId: 'thread-2',
      turnId: 'turn-2',
      reviews: [{ kind: 'filesystem', payload: filesystem }],
    })
    await filesystemReview.rejectFilesystemReview('filesystem-1', 'Do not overwrite this file.')

    assert.equal(resumedPayloads[0].decisions[0].message, 'Keep the existing chapter structure.')
    assert.equal(resumedPayloads[1].decisions[0].message, 'Do not overwrite this file.')
  })

  it('lets the review store provide the rejection guidance', () => {
    const source = readFileSync(
      'src/ai/components/agent-panel/chat-area/BlockEditReviewSurface.vue',
      'utf8',
    )

    assert.doesNotMatch(source, /blockEditReviewSurface\.userRejected/)
    assert.match(source, /emit\('reject', \{ id: current\.value\.id \}\)/)
  })
})
