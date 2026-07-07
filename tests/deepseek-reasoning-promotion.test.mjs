import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise
async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/ipc/MessageAdapter.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return modulePromise
}

const LONG_REASONING = '这是一段完整的审校意见，长度足够触发展示。'.repeat(6)

describe('MessageAdapter — DeepSeek reasoning→content promotion (empty-content instability)', () => {
  it('promotes reasoning to content for a terminal reasoning-only message (no tool calls)', async () => {
    const { convertLcMessages } = await loadModule()
    const [msg] = convertLcMessages([
      { type: 'ai', content: '', additional_kwargs: { reasoning_content: LONG_REASONING }, tool_calls: [] },
    ])
    assert.equal(msg.role, 'assistant')
    assert.equal(msg.content, LONG_REASONING) // answer surfaced as visible content
    assert.equal(msg.thinkingContent, undefined) // moved, not copied — no double render
    assert.deepEqual(msg.contentBlocks, [{ type: 'text', text: LONG_REASONING }])
  })

  it('does NOT promote when the message carries tool calls (reasoning stays CoT)', async () => {
    const { convertLcMessages } = await loadModule()
    const [msg] = convertLcMessages([
      {
        type: 'ai',
        content: '',
        additional_kwargs: { reasoning_content: LONG_REASONING },
        tool_calls: [{ id: 'call_1', name: 'get_section', args: { heading_block_id: 3 } }],
      },
    ])
    assert.equal(msg.content, '') // content untouched
    assert.equal(msg.thinkingContent, LONG_REASONING) // reasoning kept as thinking
    assert.equal(msg.toolCalls?.length, 1)
  })

  it('leaves a normal message with both content and reasoning untouched', async () => {
    const { convertLcMessages } = await loadModule()
    const [msg] = convertLcMessages([
      { type: 'ai', content: 'the answer', additional_kwargs: { reasoning_content: LONG_REASONING }, tool_calls: [] },
    ])
    assert.equal(msg.content, 'the answer')
    assert.equal(msg.thinkingContent, LONG_REASONING)
  })

  it('leaves a genuinely empty message empty (no reasoning to promote)', async () => {
    const { convertLcMessages } = await loadModule()
    const [msg] = convertLcMessages([
      { type: 'ai', content: '', additional_kwargs: {}, tool_calls: [] },
    ])
    assert.equal(msg.content, '')
    assert.equal(msg.thinkingContent, undefined)
  })
})
