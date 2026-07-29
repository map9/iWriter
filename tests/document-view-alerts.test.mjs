import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/ai/document/DocumentViewBuilder.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        alias: {
          '@': process.cwd() + '/src',
        },
        external: ['@tiptap/vue-3'],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return modulePromise
}

function textNode(text) {
  return {
    type: { name: 'text' },
    isText: true,
    text,
    marks: [],
    textContent: text,
  }
}

function paragraph(text) {
  const children = [textNode(text)]
  return {
    type: { name: 'paragraph' },
    attrs: {},
    forEach(callback) {
      children.forEach(callback)
    },
  }
}

function paragraphNodes(children) {
  return {
    type: { name: 'paragraph' },
    attrs: {},
    forEach(callback) {
      children.forEach(callback)
    },
  }
}

function boldTextNode(text) {
  return {
    ...textNode(text),
    marks: [{ type: { name: 'bold' }, attrs: {} }],
  }
}

function emojiNode(name) {
  return {
    type: { name: 'emoji' },
    isText: false,
    attrs: { name },
    marks: [],
    textContent: '',
  }
}

function blockquote(attrs, children) {
  return {
    type: { name: 'blockquote' },
    attrs,
    forEach(callback) {
      children.forEach(callback)
    },
  }
}

describe('DocumentViewBuilder alert serialization', () => {
  it('serializes alert blockquotes with their GFM alert marker', async () => {
    const { nodeToMarkdown } = await loadModule()

    assert.equal(
      nodeToMarkdown(blockquote({ alertType: 'COMMENT' }, [paragraph('这一段需要补一个人物动机。')])),
      '> [!COMMENT]\n> 这一段需要补一个人物动机。',
    )
  })

  it('keeps ordinary blockquotes unchanged', async () => {
    const { nodeToMarkdown } = await loadModule()

    assert.equal(
      nodeToMarkdown(blockquote({}, [paragraph('quoted')])),
      '> quoted',
    )
  })
})

describe('DocumentViewBuilder inline atom serialization', () => {
  it('preserves a Unicode emoji atom and bridges matching surrounding marks', async () => {
    const { nodeToMarkdown } = await loadModule()

    assert.equal(
      nodeToMarkdown(paragraphNodes([
        boldTextNode('对彼此（A'),
        emojiNode('left_right_arrow'),
        boldTextNode('B）'),
      ])),
      '**对彼此（A↔B）**',
    )
  })

  it('preserves an unformatted Unicode emoji atom', async () => {
    const { nodeToMarkdown } = await loadModule()

    assert.equal(
      nodeToMarkdown(paragraphNodes([
        textNode('A'),
        emojiNode('left_right_arrow'),
        textNode('B'),
      ])),
      'A↔B',
    )
  })

  it('canonicalizes a literal emoji split out of matching marked runs', async () => {
    const { nodeToMarkdown } = await loadModule()

    assert.equal(
      nodeToMarkdown(paragraphNodes([
        boldTextNode('对彼此（A'),
        textNode('↔'),
        boldTextNode('B）'),
      ])),
      '**对彼此（A↔B）**',
    )
  })
})
