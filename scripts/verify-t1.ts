/**
 * T1 schema 验收脚本 — 对应 M1 验收标准
 * 运行方式：npx tsx scripts/verify-t1.ts
 */

import {
  type ValidationResult,
  validateCharacterCard,
  validateSceneCard,
  validateTimelineEvent,
  validateForeshadowingEntry,
  validateOutlineChapter,
  validateStyleProfile,
  validateWorldbookEntry,
  validateStoryAsset,
} from '../electron/ai/novel-harness/schema/validator'

let passed = 0
let failed = 0

function hasErrorContaining(result: ValidationResult<unknown>, text: string): boolean {
  return 'errors' in result && result.errors.some(error => error.includes(text))
}

function errorDetail(result: ValidationResult<unknown>): string {
  return 'errors' in result ? result.errors.join(', ') : '校验意外通过'
}

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// ── M1-1: 合规数据通过校验 ───────────────────────────────────────────────────
console.log('\n[M1-1] 合规数据通过校验')

const validChar = {
  id: 'li-ming',
  type: 'character_card' as const,
  name: '李明',
  confidence: 0.85,
  updated_at: '2026-05-06T12:00:00Z',
  source_refs: [{ file: 'ch01.md', chapter_id: 'ch01', block_id: 5 }],
}
check('CharacterCard 合规数据', validateCharacterCard(validChar).ok === true)

const validScene = {
  id: 'ch01--001',
  type: 'scene_card' as const,
  chapter_id: 'ch01',
  sequence: 1,
  summary: '李明在书房发现密信',
  confidence: 0.9,
  updated_at: '2026-05-06T12:00:00Z',
  source_refs: [{ file: 'ch01.md', chapter_id: 'ch01', block_id: 12 }],
}
check('SceneCard 合规数据', validateSceneCard(validScene).ok === true)

const validTimeline = {
  id: 'evt-001',
  time: '第三天清晨',
  event: '李明收到密信',
  chapter_id: 'ch01',
  is_turning_point: true,
  source_refs: [{ file: 'ch01.md', chapter_id: 'ch01', block_id: 7 }],
  confidence: 0.8,
}
check('TimelineEvent 合规数据', validateTimelineEvent(validTimeline).ok === true)

const validForeshadowing = {
  id: 'sword-prophecy',
  type: 'foreshadowing_entry' as const,
  description: '剑柄上的刻字',
  plant_scene_id: 'ch01--002',
  status: 'planted' as const,
  confidence: 0.75,
  updated_at: '2026-05-06T12:00:00Z',
  source_refs: [{ file: 'ch01.md', chapter_id: 'ch01', block_id: 20 }],
}
check('ForeshadowingEntry 合规数据', validateForeshadowingEntry(validForeshadowing).ok === true)

// ── M1-2: 缺必填字段返回明确错误 ──────────────────────────────────────────────
console.log('\n[M1-2] 缺必填字段返回明确错误')

const missingName = { ...validChar, name: '' }
const r1 = validateCharacterCard(missingName)
check(
  'CharacterCard 缺 name → 明确错误',
  hasErrorContaining(r1, 'name'),
  errorDetail(r1)
)

const missingSourceRef = { ...validChar, source_refs: [] }
const r2 = validateCharacterCard(missingSourceRef)
check(
  'CharacterCard source_refs 为空数组 → 错误',
  r2.ok === false,
  errorDetail(r2)
)

const missingChapterId = { ...validScene, chapter_id: '' }
const r3 = validateSceneCard(missingChapterId)
check(
  'SceneCard 缺 chapter_id → 明确错误',
  hasErrorContaining(r3, 'chapter_id'),
  errorDetail(r3)
)

// ── M1-3: confidence 超出 0–1 范围校验失败 ────────────────────────────────────
console.log('\n[M1-3] confidence 超出范围')

const badConfHigh = { ...validChar, confidence: 1.1 }
const r4 = validateCharacterCard(badConfHigh)
check(
  'confidence=1.1 → 校验失败',
  r4.ok === false,
  errorDetail(r4)
)

const badConfNeg = { ...validChar, confidence: -0.1 }
const r5 = validateCharacterCard(badConfNeg)
check(
  'confidence=-0.1 → 校验失败',
  r5.ok === false,
  errorDetail(r5)
)

const confString = { ...validChar, confidence: '0.8' }
const r6 = validateCharacterCard(confString)
check(
  'confidence 为字符串 "0.8" → 校验失败',
  r6.ok === false,
  errorDetail(r6)
)

// ── M1-4: source_refs 缺 file 或 chapter_id 时失败 ───────────────────────────
console.log('\n[M1-4] source_refs 字段校验')

const missingFile = { ...validChar, source_refs: [{ chapter_id: 'ch01', block_id: 5 }] }
const r7 = validateCharacterCard(missingFile)
check(
  'source_refs 缺 file → 校验失败',
  r7.ok === false,
  errorDetail(r7)
)

const missingChapter = { ...validChar, source_refs: [{ file: 'ch01.md', block_id: 5 }] }
const r8 = validateCharacterCard(missingChapter)
check(
  'source_refs 缺 chapter_id → 校验失败',
  r8.ok === false,
  errorDetail(r8)
)

const missingBlockId = { ...validChar, source_refs: [{ file: 'ch01.md', chapter_id: 'ch01' }] }
const r9 = validateCharacterCard(missingBlockId)
check(
  'source_refs 缺 block_id → 校验失败',
  r9.ok === false,
  errorDetail(r9)
)

// ── M1-5: discriminatedUnion 覆盖所有 asset 类型 ─────────────────────────────
console.log('\n[M1-5] StoryAsset discriminatedUnion 覆盖所有类型')

check('character_card 被 StoryAsset 识别', validateStoryAsset(validChar).ok === true)
check('scene_card 被 StoryAsset 识别', validateStoryAsset(validScene).ok === true)
check('foreshadowing_entry 被 StoryAsset 识别', validateStoryAsset(validForeshadowing).ok === true)

const validOutline = {
  id: 'ch01-outline',
  type: 'outline_chapter' as const,
  number: 1,
  title: '第一章',
  summary: '李明收到密信，卷入阴谋',
  confidence: 0.9,
  updated_at: '2026-05-06T12:00:00Z',
}
check('outline_chapter 被 StoryAsset 识别', validateStoryAsset(validOutline).ok === true)

const validStyle = {
  id: 'profile',
  type: 'style_profile' as const,
  confidence: 0.7,
  updated_at: '2026-05-06T12:00:00Z',
}
check('style_profile 被 StoryAsset 识别', validateStoryAsset(validStyle).ok === true)

const unknownType = { ...validChar, type: 'unknown_type' }
const r10 = validateStoryAsset(unknownType)
check(
  '未知 type → StoryAsset 校验失败',
  r10.ok === false,
  r10.ok ? '校验意外通过' : '正确拒绝'
)

// ── 汇总 ─────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) {
  process.exit(1)
}
