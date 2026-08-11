import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise
let deepSeekModelModulePromise
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

async function loadDeepSeekModelModule() {
  if (!deepSeekModelModulePromise) {
    deepSeekModelModulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/providers/ChatDeepSeek.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return deepSeekModelModulePromise
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

describe('MessageAdapter — current user-message bindings', () => {
  it('hides generated turn bindings when restoring a user message', async () => {
    const { convertLcMessages } = await loadModule()
    const [msg] = convertLcMessages([{
      type: 'human',
      content: [
        'Compare these references.',
        '<turn_bindings>',
        '  <attached_files>',
        '    <file path="/project/reference.md" />',
        '  </attached_files>',
        '</turn_bindings>',
      ].join('\n'),
    }])

    assert.equal(msg.content, 'Compare these references.')
  })

  it('hides generated image metadata when restoring a multimodal user message', async () => {
    const { convertLcMessages } = await loadModule()
    const [msg] = convertLcMessages([{
      type: 'human',
      content: [
        { type: 'text', text: 'Describe this image.' },
        { type: 'text', text: '\n<attached_image path="/project/cover.png" />' },
        { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
      ],
    }])

    assert.equal(msg.content, 'Describe this image.')
  })
})

describe('ChatDeepSeek — summary thinking control', () => {
  it('explicitly disables provider-default thinking for summary requests', async () => {
    const { ChatDeepSeek } = await loadDeepSeekModelModule()
    const originalFetch = globalThis.fetch
    let requestBody
    globalThis.fetch = async (_url, init) => {
      requestBody = JSON.parse(init.body)
      return new Response(JSON.stringify({
        id: 'summary-response',
        model: 'deepseek-v4-flash',
        choices: [{ message: { role: 'assistant', content: 'summary' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const model = new ChatDeepSeek({
        model: 'deepseek-v4-flash',
        apiKey: 'test-key',
        disableThinking: true,
      })
      await model.invoke('compact this conversation')
    } finally {
      globalThis.fetch = originalFetch
    }

    assert.deepEqual(requestBody.thinking, { type: 'disabled' })
    assert.equal(requestBody.reasoning_effort, 'none')
  })
})

describe('MessageAdapter — block proposal snapshots', () => {
  it('does not duplicate a selected list container and its item leaves in replace_range oldContent', async () => {
    const { buildProposalFromAction } = await loadModule()
    const snapshot = {
      blockMap: [
        {
          displayId: 78,
          nodeId: 'heading-id',
          nodeType: 'heading',
          content: '## 社会面（society）',
        },
        {
          displayId: 79,
          nodeId: 'list:first-item',
          nodeType: 'bulletList',
          content: '- 第一项\n- 第二项',
          isContainer: true,
        },
        {
          displayId: 80,
          nodeId: 'first-item',
          nodeType: 'listItem',
          content: '- 第一项',
          containerId: 79,
        },
        {
          displayId: 81,
          nodeId: 'second-item',
          nodeType: 'listItem',
          content: '- 第二项',
          containerId: 79,
        },
      ],
    }

    const proposal = buildProposalFromAction(
      'replace_range',
      {
        start_block_id: 78,
        end_block_id: 81,
        file_path: '/project/chapter.md',
        new_content: '',
        expected_old_content: '## 社会面（society）\n\n- 第一项\n- 第二项',
      },
      snapshot,
    )

    assert.equal(
      proposal.oldContent,
      '## 社会面（society）\n\n- 第一项\n\n- 第二项',
    )
    assert.equal(proposal.oldContent.match(/第一项/g)?.length, 1)
    assert.equal(proposal.oldContent.match(/第二项/g)?.length, 1)
  })
})
