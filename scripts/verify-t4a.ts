/**
 * T4a ChapterCompressor 验收脚本
 */

import { ChapterCompressor } from '../electron/ai/novel-harness/compress/ChapterCompressor'
import type { ExtractChapterInput } from '../electron/ai/novel-harness/compress/ChapterCompressor'

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

const providerConfig = {
  id: 'test-provider',
  type: 'openai-compat' as const,
  label: 'Test',
  apiKey: 'test',
  defaultModelId: 'test-model',
  enabled: true,
}

const input: ExtractChapterInput = {
  chapter: {
    id: 'ch01',
    title: '第一章',
    wordCount: 120,
    blockCount: 2,
    startBlockId: 1,
    endBlockId: 2,
  },
  chapterText: '{b:1}\n# 第一章\n\n{b:2}\n李明走进档案馆，发现一封信。',
  sourceFile: 'novel.md',
  providerConfig,
  blocks: [
    { displayId: 1, nodeId: 'h1', nodeType: 'heading', headingLevel: 1, content: '# 第一章' },
    { displayId: 2, nodeId: 'p1', nodeType: 'paragraph', content: '李明走进档案馆，发现一封信。' },
  ],
  now: '2026-05-07T00:00:00.000Z',
}

const validJson = JSON.stringify({
  characters: [
    {
      id: 'li-ming',
      type: 'character_card',
      name: '李明',
      aliases: [],
      relationships: [],
      state_by_chapter: [{ chapter_id: 'ch01', status: '进入档案馆并发现信件' }],
      confidence: 0.86,
      updated_at: '2026-05-07T00:00:00.000Z',
      source_refs: [{ file: 'novel.md', chapter_id: 'ch01', block_id: 2 }],
    },
  ],
  scenes: [
    {
      id: 'ch01--001',
      type: 'scene_card',
      chapter_id: 'ch01',
      sequence: 1,
      time: '夜晚',
      location: '档案馆',
      characters: ['li-ming'],
      summary: '李明进入档案馆并发现一封信。',
      beats: ['李明进入档案馆', '李明发现信件'],
      tone: '悬疑',
      foreshadowing_ids: [],
      confidence: 0.82,
      updated_at: '2026-05-07T00:00:00.000Z',
      source_refs: [{ file: 'novel.md', chapter_id: 'ch01', block_id: 2 }],
    },
  ],
  timeline: {
    id: 'ch01',
    type: 'timeline_chapter',
    chapter_id: 'ch01',
    events: [
      {
        id: 'ch01-event-001',
        time: '夜晚',
        event: '李明进入档案馆并发现信件。',
        characters: ['li-ming'],
        chapter_id: 'ch01',
        is_turning_point: false,
        source_refs: [{ file: 'novel.md', chapter_id: 'ch01', block_id: 2 }],
        confidence: 0.8,
      },
    ],
    confidence: 0.8,
    updated_at: '2026-05-07T00:00:00.000Z',
  },
})

let calls = 0
const compressor = new ChapterCompressor({
  skillPrompt: 'Return JSON only.',
  modelInvoker: async () => {
    calls++
    if (calls === 1) return '{"characters":[],"scenes":[]}'
    return validJson
  },
})

async function main() {
  console.log('\n[T4a-1] LLM JSON draft 提取与重试')
  const draft = await compressor.extractChapter(input)
  check('第一次失败后重试成功', draft.attempts === 2)
  check('输出 CharacterCard', draft.characters.length === 1 && draft.characters[0]?.id === 'li-ming')
  check('输出 SceneCard', draft.scenes.length === 1 && draft.scenes[0]?.id === 'ch01--001')
  check('输出 TimelineChapter', draft.timeline?.id === 'ch01')
  check('source_refs.block_id 为正整数', draft.scenes[0]?.source_refs[0]?.block_id === 2)
  check('保留失败校验信息', draft.validationErrors.length === 1)

  console.log('\n[T4a-2] 非法 block_id 会失败')
  const badBlockCompressor = new ChapterCompressor({
    skillPrompt: 'Return JSON only.',
    modelInvoker: async () => validJson.replace('"block_id":2', '"block_id":99'),
  })

  let rejected = false
  try {
    await badBlockCompressor.extractChapter({ ...input, maxRetries: 0 })
  } catch {
    rejected = true
  }
  check('非法 block_id 被拒绝', rejected)

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`结果：${passed} 通过 / ${failed} 失败`)

  if (failed > 0) {
    throw new Error('T4a verification failed')
  }
}

main().catch(error => {
  console.error(error)
  throw error
})
