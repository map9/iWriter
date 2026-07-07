import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise
async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/document/BlockParser.ts'],
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

// Minimal snapshot: one h1 section + N leaf blocks with explicit charCount.
function makeSnapshot(blocks) {
  return {
    blockMap: blocks.map(b => ({
      displayId: b.id,
      nodeType: b.heading ? 'heading' : 'paragraph',
      ...(b.heading ? { headingLevel: 1 } : {}),
      content: b.content ?? 'x'.repeat(b.chars ?? 0),
      charCount: b.chars,
      isContainer: false,
    })),
    outline: blocks.filter(b => b.heading).map(b => ({ displayId: b.id, text: b.content ?? 'H', wordCount: 0 })),
  }
}

// Read a whole section by chaining next_offset, collecting the pages.
function readAllPages(BlockParser, snapshot, headingId, budget) {
  const pages = []
  let offset = 0
  for (let guard = 0; guard < 50; guard++) {
    const r = JSON.parse(BlockParser.getSection(snapshot, headingId, offset, budget))
    pages.push(r)
    if (!r.has_more) break
    assert.ok(r.next_offset > offset, 'next_offset must advance to avoid an infinite loop')
    offset = r.next_offset
  }
  return pages
}

// Extract the {b:N} ids present in a page's content, in order.
function pageBlockIds(page) {
  return [...page.content.matchAll(/\{b:(\d+)\}/g)].map(m => Number(m[1]))
}

describe('BlockParser.getSection — adaptive (content-budget) pagination', () => {
  it('single page when the section fits the budget (matches the trace)', async () => {
    const { BlockParser } = await loadModule()
    const snap = makeSnapshot([
      { id: 1, heading: true, chars: 10 },
      { id: 2, chars: 40 },
      { id: 3, chars: 40 },
    ])
    const r = JSON.parse(BlockParser.getSection(snap, 1, 0, 4000))
    assert.equal(r.has_more, false)
    assert.equal(r.offset, 0)
    assert.equal(r.next_offset, 3)
    assert.equal(r.blocks_returned, 3)
    assert.equal(r.total_section_blocks, 3)
    assert.equal(r.chars_returned, 90)
  })

  it('paginates an over-budget section and next_offset chaining covers every block exactly once', async () => {
    const { BlockParser } = await loadModule()
    const snap = makeSnapshot([
      { id: 1, heading: true, chars: 10 },
      { id: 2, chars: 40 },
      { id: 3, chars: 40 },
      { id: 4, chars: 40 },
      { id: 5, chars: 40 },
    ])
    const pages = readAllPages(BlockParser, snap, 1, 100)

    // Page 1: heading(10)+40+40 = 90; adding block 4 would hit 130 > 100 -> stop.
    assert.equal(pages[0].has_more, true)
    assert.equal(pages[0].next_offset, 3)
    assert.deepEqual(pageBlockIds(pages[0]), [1, 2, 3])

    // Page 2: blocks 4,5 -> 80 <= 100, section ends.
    assert.equal(pages[1].has_more, false)
    assert.equal(pages[1].next_offset, 5)
    assert.deepEqual(pageBlockIds(pages[1]), [4, 5])

    // Chaining reads every block once, in order, no gaps/overlaps.
    const all = pages.flatMap(pageBlockIds)
    assert.deepEqual(all, [1, 2, 3, 4, 5])
  })

  it('gives a single over-budget block its own page (never splits a block)', async () => {
    const { BlockParser } = await loadModule()
    const snap = makeSnapshot([
      { id: 1, heading: true, chars: 10 },
      { id: 2, chars: 40 },
      { id: 3, chars: 200 }, // exceeds the 100 budget on its own
      { id: 4, chars: 40 },
    ])
    const pages = readAllPages(BlockParser, snap, 1, 100)
    const idsPerPage = pages.map(pageBlockIds)

    // The 200-char block is isolated on its own page, unsplit.
    const bigPage = idsPerPage.find(ids => ids.includes(3))
    assert.deepEqual(bigPage, [3])
    // Everything still read exactly once, in order.
    assert.deepEqual(pages.flatMap(pageBlockIds), [1, 2, 3, 4])
    assert.equal(pages[pages.length - 1].has_more, false)
  })
})
