import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSearchSnippet,
  getSearchSnippetDisplayWidth,
} from '../src/components/common/tiptap/iw-search-replace/searchSnippet.ts'

test('keeps useful context when a Chinese quote is adjacent to the match', () => {
  const snippet = buildSearchSnippet({
    before: '证明自己爱的那个人并没有被岁月、婚姻和安排彻底抹掉——现在有两个“',
    match: '我',
    after: '”，她想抓住那个还和过去连续的人。怀孕让这种欲望变得更迫切',
  })

  assert.ok(getSearchSnippetDisplayWidth(snippet.before) >= 10)
  assert.ok(getSearchSnippetDisplayWidth(snippet.after) >= 10)
  assert.notEqual(snippet.before, '“')
  assert.notEqual(snippet.after, '”')
  assert.equal(snippet.prefixEllipsis, true)
  assert.equal(snippet.suffixEllipsis, true)
})

test('keeps the snippet within the default visual-width budget', () => {
  const snippet = buildSearchSnippet({
    before: 'This is a long English introduction mixed with 中文上下文 and more words before ',
    match: '我',
    after: ' followed by another long English explanation mixed with 中文内容 and a conclusion.',
  })

  const contentWidth = getSearchSnippetDisplayWidth(snippet.before)
    + getSearchSnippetDisplayWidth(snippet.match)
    + getSearchSnippetDisplayWidth(snippet.after)
  assert.ok(contentWidth <= 48)
})

test('does not add ellipses or trim a short paragraph', () => {
  const snippet = buildSearchSnippet({
    before: '女，与“',
    match: '我',
    after: '”同龄。',
  })

  assert.deepEqual(snippet, {
    before: '女，与“',
    match: '我',
    after: '”同龄。',
    prefixEllipsis: false,
    suffixEllipsis: false,
  })
})

test('gives unused width from a short side to the longer side', () => {
  const snippet = buildSearchSnippet({
    before: '短',
    match: '我',
    after: '这是很长的后置上下文，用来验证另一侧剩余的显示预算会被充分利用，而不是留下大片空白。',
  })

  assert.equal(snippet.before, '短')
  assert.ok(getSearchSnippetDisplayWidth(snippet.after) >= 30)
})

test('does not split emoji grapheme clusters', () => {
  const family = '👨‍👩‍👧‍👦'
  const snippet = buildSearchSnippet({
    before: `${family.repeat(20)}前文`,
    match: '我',
    after: '后文'.repeat(20),
  })

  assert.equal(snippet.before.includes('\uFFFD'), false)
  assert.equal(snippet.before.replaceAll(family, '').includes('\u200D'), false)
})
