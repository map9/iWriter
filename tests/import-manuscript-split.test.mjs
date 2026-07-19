import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/tools/creative/ImportManuscript.ts'],
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

describe('detectBoundaries', () => {
  it('detects ATX headings (level 1-2) with high confidence', async () => {
    const { detectBoundaries } = await loadModule()
    const lines = '# Chapter One\n\nalpha\n\n# Chapter Two\n\nbeta'.split('\n')
    const c = detectBoundaries(lines)
    assert.equal(c.length, 2)
    assert.deepEqual(c.map(x => x.boundary_line), [0, 4])
    assert.deepEqual(c.map(x => x.title), ['Chapter One', 'Chapter Two'])
    assert.ok(c.every(x => x.confidence === 'high'))
  })

  it('does not treat a level-3 heading or a thematic break as a boundary', async () => {
    const { detectBoundaries } = await loadModule()
    const lines = '# One\n\n### a scene\n\n* * *\n\ntext'.split('\n')
    const c = detectBoundaries(lines)
    assert.equal(c.length, 1)
    assert.equal(c[0].boundary_line, 0)
  })

  it('detects CJK 第N章 patterns', async () => {
    const { detectBoundaries } = await loadModule()
    const lines = '第一章 开端\n\n正文\n\n第二章\n\n正文'.split('\n')
    const c = detectBoundaries(lines)
    assert.equal(c.length, 2)
    assert.equal(c[0].confidence, 'high')
    assert.match(c[0].title, /第一章/)
  })

  it('detects English "Chapter N" patterns case-insensitively', async () => {
    const { detectBoundaries } = await loadModule()
    const lines = 'CHAPTER I\n\ntext\n\nChapter II. The Return\n\ntext'.split('\n')
    const c = detectBoundaries(lines)
    assert.equal(c.length, 2)
    assert.ok(c.every(x => x.confidence === 'high'))
  })

  it('flags bare-number and numbered lines as medium confidence', async () => {
    const { detectBoundaries } = await loadModule()
    const lines = '1\n\ntext\n\n2. A Title\n\ntext'.split('\n')
    const c = detectBoundaries(lines)
    assert.equal(c.length, 2)
    assert.ok(c.every(x => x.confidence === 'medium'))
  })
})
