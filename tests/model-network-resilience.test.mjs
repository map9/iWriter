import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { getRetryable, stampRetryable } from '@langchain/core/errors'

let resilienceModulePromise
let deepSeekModulePromise

async function loadBundled(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

function loadResilienceModule() {
  resilienceModulePromise ??= loadBundled('electron/ai/scaffold/middleware/ModelNetworkResilience.ts')
  return resilienceModulePromise
}

function loadDeepSeekModule() {
  deepSeekModulePromise ??= loadBundled('electron/ai/providers/ChatDeepSeek.ts')
  return deepSeekModulePromise
}

describe('model network resilience', () => {
  it('uses LangChain model retry and disables provider-level nested retries', async () => {
    const { createModelNetworkRetryMiddleware } = await loadResilienceModule()
    const middleware = createModelNetworkRetryMiddleware({
      maxRetries: 2,
      initialDelayMs: 0,
      jitter: false,
    })
    let attempts = 0

    const result = await middleware.wrapModelCall(
      { modelSettings: { temperature: 0 } },
      async request => {
        attempts += 1
        assert.equal(request.modelSettings.maxRetries, 0)
        if (attempts < 3) throw stampRetryable(new Error('temporary network failure'), true)
        return { content: 'ok' }
      },
    )

    assert.equal(attempts, 3)
    assert.equal(result.content, 'ok')
  })

  it('finds a non-retryable mark through middleware cause wrappers', async () => {
    const { createModelNetworkRetryMiddleware } = await loadResilienceModule()
    const middleware = createModelNetworkRetryMiddleware({
      maxRetries: 3,
      initialDelayMs: 0,
      jitter: false,
    })
    const root = stampRetryable(new Error('invalid API key'), false)
    const wrapped = new Error('invalid API key', { cause: root })
    let attempts = 0

    await assert.rejects(
      middleware.wrapModelCall({}, async () => {
        attempts += 1
        throw wrapped
      }),
      /invalid API key/,
    )
    assert.equal(attempts, 1)
  })

  it('ignores ad-hoc retryable properties without the official LangChain mark', async () => {
    const { createModelNetworkRetryMiddleware } = await loadResilienceModule()
    const middleware = createModelNetworkRetryMiddleware({
      maxRetries: 1,
      initialDelayMs: 0,
      jitter: false,
    })
    let attempts = 0

    const result = await middleware.wrapModelCall({}, async () => {
      attempts += 1
      if (attempts === 1) {
        throw Object.assign(new Error('unclassified provider failure'), { retryable: false })
      }
      return { content: 'ok' }
    })

    assert.equal(attempts, 2)
    assert.equal(result.content, 'ok')
  })

  it('turns exhausted network and rate-limit errors into concise chat messages', async () => {
    const { toUserFacingModelError } = await loadResilienceModule()

    const connection = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    assert.equal(
      toUserFacingModelError(new Error('middleware failed', { cause: connection })),
      '网络连接不稳定，自动重试后仍未恢复。请检查网络连接，然后重试。',
    )

    const limited = Object.assign(new Error('Too many requests'), { status: 429 })
    assert.equal(
      toUserFacingModelError(limited),
      '模型服务当前繁忙或已达到频率限制，自动重试后仍未恢复。请稍后重试。',
    )

    assert.equal(toUserFacingModelError(new Error('unknown failure')), 'unknown failure')
  })

  it('marks custom DeepSeek transport errors with LangChain retry metadata', async () => {
    const { ChatDeepSeek } = await loadDeepSeekModule()
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new TypeError('fetch failed') }

    try {
      const model = new ChatDeepSeek({
        model: 'deepseek-chat',
        apiKey: 'test-key',
        streaming: false,
      })
      await assert.rejects(model.invoke('hello'), error => {
        assert.equal(getRetryable(error), true)
        return true
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('does not retry a DeepSeek stream after partial content reached the chat', async () => {
    const { ChatDeepSeek } = await loadDeepSeekModule()
    const originalFetch = globalThis.fetch
    const encoder = new TextEncoder()
    let pullCount = 0
    globalThis.fetch = async () => new Response(new ReadableStream({
      pull(controller) {
        if (pullCount++ === 0) {
          controller.enqueue(encoder.encode(
            'data: {"id":"response-1","choices":[{"delta":{"content":"partial"}}]}\n\n',
          ))
          return
        }
        controller.error(Object.assign(new TypeError('terminated'), {
          cause: Object.assign(new Error('socket timed out'), { code: 'ETIMEDOUT' }),
        }))
      },
    }), { status: 200 })

    let visibleText = ''
    let streamError
    try {
      const model = new ChatDeepSeek({
        model: 'deepseek-chat',
        apiKey: 'test-key',
        streaming: true,
      })
      const stream = await model.stream('hello')
      try {
        for await (const chunk of stream) visibleText += chunk.text
      } catch (error) {
        streamError = error
      }
    } finally {
      globalThis.fetch = originalFetch
    }

    assert.equal(visibleText, 'partial')
    assert.equal(getRetryable(streamError), false)
  })
})
