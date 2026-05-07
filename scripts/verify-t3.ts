/**
 * T3 ChapterSegmenter 验收脚本
 * 运行方式：npx tsx scripts/verify-t3.ts
 */

import { ChapterSegmenter } from '../electron/ai/novel-harness/ingest/ChapterSegmenter'
import type { SerializedSnapshot } from '../electron/ai/ipc/protocol'

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ''}`)
    failed++
  }
}

function makeBlock(displayId: number, content: string, nodeType = 'paragraph', headingLevel?: number) {
  return {
    displayId,
    nodeId: `node-${displayId}`,
    nodeType,
    content,
    headingLevel,
  }
}

const segmenter = new ChapterSegmenter()

console.log('\n[T3-1] 标题文档识别章节边界')
const titledSnapshot: SerializedSnapshot = {
  filePath: null,
  viewMarkdown: '',
  outlineText: '',
  blockMap: [
    makeBlock(1, '# 第一章', 'heading', 1),
    makeBlock(2, '第一章正文。'),
    makeBlock(3, '第一章继续。'),
    makeBlock(4, '## 第一节', 'heading', 2),
    makeBlock(5, '第一节正文。'),
    makeBlock(6, '# 第二章', 'heading', 1),
    makeBlock(7, '第二章正文。'),
  ],
  outline: [
    { displayId: 1, level: 1, text: '第一章', sectionBlocks: 5, wordCount: 12 },
    { displayId: 4, level: 2, text: '第一节', sectionBlocks: 2, wordCount: 6 },
    { displayId: 6, level: 1, text: '第二章', sectionBlocks: 2, wordCount: 6 },
  ],
  totalBlocks: 7,
  totalWords: 18,
  cursorBlockId: null,
}

const titledChapters = segmenter.segmentSnapshot(titledSnapshot)
check('只使用最高层级标题作为章节', titledChapters.length === 2)
check('第一章包含子标题内容', titledChapters[0]?.startBlockId === 1 && titledChapters[0]?.endBlockId === 5)
check('第二章范围正确', titledChapters[1]?.startBlockId === 6 && titledChapters[1]?.endBlockId === 7)

console.log('\n[T3-2] 无标题文档固定窗口分块')
const noHeadingSnapshot: SerializedSnapshot = {
  filePath: null,
  viewMarkdown: '',
  outlineText: '',
  blockMap: [
    makeBlock(1, '一'.repeat(700)),
    makeBlock(2, '二'.repeat(700)),
    makeBlock(3, '三'.repeat(700)),
    makeBlock(4, '四'.repeat(700)),
  ],
  outline: [],
  totalBlocks: 4,
  totalWords: 2800,
  cursorBlockId: null,
}

const fallbackChapters = segmenter.segmentSnapshot(noHeadingSnapshot, { windowWords: 2000 })
check('按 2000 字窗口分成两段', fallbackChapters.length === 2)
check('fallback 标题为未命名章节', fallbackChapters.every(chapter => chapter.title.startsWith('未命名章节')))
check('fallback block 范围连续', fallbackChapters[0]?.endBlockId === 2 && fallbackChapters[1]?.startBlockId === 3)

console.log('\n[T3-3] 调整文本提取窗口字数')
check('能从中文调整指令中提取字数', segmenter.extractWindowWords('请按 1500 字重新切分') === 1500)
check('过小窗口被限制到 500', segmenter.extractWindowWords('按 100 字切') === 500)

console.log(`\n${'─'.repeat(50)}`)
console.log(`结果：${passed} 通过 / ${failed} 失败`)

if (failed > 0) {
  process.exit(1)
}
