/**
 * T2 StoryStateStore 验收脚本
 * 运行方式：npx tsx scripts/verify-t2.ts
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { StoryStateStore } from '../electron/ai/novel-harness/store/StoryStateStore'
import type { CharacterCard, StoryAsset } from '../electron/ai/novel-harness/schema/types'

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

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iwriter-story-store-'))
const store = new StoryStateStore(rootDir)

const validCharacter: CharacterCard = {
  id: 'li-ming',
  type: 'character_card',
  name: 'Li Ming',
  aliases: [],
  relationships: [],
  state_by_chapter: [],
  confidence: 0.86,
  updated_at: '2026-05-07T12:00:00Z',
  source_refs: [{ file: 'novel.md', chapter_id: 'ch01', block_id: 1 }],
}

console.log('\n[T2-1] 写入 CharacterCard')
const written = store.writeAsset(validCharacter, '## Summary\nLi Ming enters the archive.\n')
check('写入 characters/li-ming.md', fs.existsSync(written.path), written.path)

const raw = fs.readFileSync(written.path, 'utf-8')
check('文件包含 YAML frontmatter', raw.startsWith('---\n') && raw.includes('\ntype: character_card\n'))
check('文件保留 Markdown 正文', raw.includes('Li Ming enters the archive.'))

console.log('\n[T2-2] 读回并通过 validator')
const readBack = store.readAsset('characters', 'li-ming')
check('读回 asset id 正确', readBack.asset.id === 'li-ming')
check('读回 asset type 正确', readBack.asset.type === 'character_card')
check('读回正文正确', readBack.body.includes('Li Ming enters the archive.'))

console.log('\n[T2-3] 非法 schema 不覆盖旧文件')
const beforeInvalidWrite = fs.readFileSync(written.path, 'utf-8')
const invalidCharacter = {
  ...validCharacter,
  confidence: 1.5,
} as unknown as StoryAsset

let rejected = false
try {
  store.writeAsset(invalidCharacter, 'this should not be written')
} catch {
  rejected = true
}
const afterInvalidWrite = fs.readFileSync(written.path, 'utf-8')
check('非法写入被拒绝', rejected)
check('旧文件未被覆盖', beforeInvalidWrite === afterInvalidWrite)

console.log('\n[T2-4] listAssets 能枚举新 section')
const items = store.listAssets('characters')
check('listAssets(characters) 找到 li-ming', items.some(item => item.section === 'characters' && item.slug === 'li-ming'))

const allItems = store.listAssets()
check('listAssets() 包含 characters 条目', allItems.some(item => item.section === 'characters' && item.slug === 'li-ming'))
check('新 section 目录被创建', fs.existsSync(path.join(rootDir, 'timeline')) && fs.existsSync(path.join(rootDir, 'foreshadowing')))

console.log(`\n${'─'.repeat(50)}`)
console.log(`结果：${passed} 通过 / ${failed} 失败`)

fs.rmSync(rootDir, { recursive: true, force: true })

if (failed > 0) {
  process.exit(1)
}
