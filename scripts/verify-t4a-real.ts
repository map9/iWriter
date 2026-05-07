/**
 * T4a 真实 LLM 人工验收脚本。
 *
 * 需要环境变量：
 * - T4A_API_KEY
 * - T4A_MODEL_ID
 *
 * 可选环境变量：
 * - T4A_PROVIDER_TYPE=openai-compat|deepseek|anthropic|gemini
 * - T4A_BASE_URL
 */

import { ChapterCompressor } from '../electron/ai/novel-harness/compress/ChapterCompressor'
import type { ExtractChapterInput } from '../electron/ai/novel-harness/compress/ChapterCompressor'
import type { AiProviderConfig, AiProviderType } from '../src/ai/types'

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

const providerType = (process.env.T4A_PROVIDER_TYPE?.trim() || 'openai-compat') as AiProviderType
const modelId = requiredEnv('T4A_MODEL_ID')

const providerConfig: AiProviderConfig = {
  id: 'manual-t4a-provider',
  type: providerType,
  label: 'Manual T4a Provider',
  apiKey: requiredEnv('T4A_API_KEY'),
  baseUrl: process.env.T4A_BASE_URL?.trim() || undefined,
  defaultModelId: modelId,
  enabled: true,
}

const input: ExtractChapterInput = {
  chapter: {
    id: 'ch01',
    title: '第一章 旧档案馆',
    wordCount: 180,
    blockCount: 4,
    startBlockId: 1,
    endBlockId: 4,
  },
  sourceFile: 'manual-sample.md',
  providerConfig,
  modelId,
  now: '2026-05-07T00:00:00.000Z',
  blocks: [
    { displayId: 1, nodeId: 'h1', nodeType: 'heading', headingLevel: 1, content: '# 第一章 旧档案馆' },
    { displayId: 2, nodeId: 'p1', nodeType: 'paragraph', content: '李明在雨夜回到城北旧档案馆。他把钥匙藏在袖口，不愿让守夜人发现。' },
    { displayId: 3, nodeId: 'p2', nodeType: 'paragraph', content: '档案馆三楼的窗户没有关严，风吹动泛黄的卷宗。李明在第七排书架后找到一封没有署名的信。' },
    { displayId: 4, nodeId: 'p3', nodeType: 'paragraph', content: '信里只写了一句话：明天中午之前，不要相信姚小姐。李明把信烧掉，却记住了纸角上的银色印记。' },
  ],
  chapterText: [
    '{b:1}\n# 第一章 旧档案馆',
    '{b:2}\n李明在雨夜回到城北旧档案馆。他把钥匙藏在袖口，不愿让守夜人发现。',
    '{b:3}\n档案馆三楼的窗户没有关严，风吹动泛黄的卷宗。李明在第七排书架后找到一封没有署名的信。',
    '{b:4}\n信里只写了一句话：明天中午之前，不要相信姚小姐。李明把信烧掉，却记住了纸角上的银色印记。',
  ].join('\n\n'),
}

async function main() {
  const compressor = new ChapterCompressor()
  const draft = await compressor.extractChapter(input)

  console.log(JSON.stringify({
    attempts: draft.attempts,
    characters: draft.characters.map(character => ({
      id: character.id,
      name: character.name,
      confidence: character.confidence,
      source_refs: character.source_refs,
    })),
    scenes: draft.scenes.map(scene => ({
      id: scene.id,
      summary: scene.summary,
      confidence: scene.confidence,
      source_refs: scene.source_refs,
    })),
    timelineEvents: draft.timeline?.events.length ?? 0,
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  throw error
})
