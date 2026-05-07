/**
 * T5 ConsistencyValidator 验收脚本
 */

import { ConsistencyValidator } from '../electron/ai/novel-harness/validate/ConsistencyValidator'
import type { CharacterCard, TimelineEvent, WorldbookEntry } from '../electron/ai/novel-harness/schema/types'

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

const validator = new ConsistencyValidator()

const character: CharacterCard = {
  id: 'li-ming',
  type: 'character_card',
  name: '李明',
  aliases: [],
  personality: '沉默寡言',
  relationships: [],
  state_by_chapter: [{ chapter_id: 'ch01', status: '死亡' }],
  confidence: 0.9,
  updated_at: '2026-05-07T00:00:00Z',
  source_refs: [{ file: 'novel.md', chapter_id: 'ch01', block_id: 1 }],
}

console.log('\n[T5-1] 人物行为软校验')
const characterReport = validator.validateCharacterBehavior('李明走进大厅，滔滔不绝地说了很久。', character)
check('输出人物问题', characterReport.issues.length >= 1)
check('报告永远不自动阻断', characterReport.isBlocking === false && characterReport.mode === 'soft')

const events: TimelineEvent[] = [
  {
    id: 'ev-late',
    time: '第3章',
    event: '众人抵达王城',
    characters: ['李明'],
    chapter_id: 'ch03',
    is_turning_point: false,
    source_refs: [{ file: 'novel.md', chapter_id: 'ch03', block_id: 1 }],
    confidence: 0.8,
  },
  {
    id: 'ev-early',
    time: '第1章',
    event: '李明离开村庄',
    characters: ['李明'],
    chapter_id: 'ch01',
    is_turning_point: false,
    source_refs: [{ file: 'novel.md', chapter_id: 'ch01', block_id: 2 }],
    confidence: 0.8,
  },
]

console.log('\n[T5-2] 时间线一致性软校验')
const timelineReport = validator.validateTimeline('李明离开村庄。', events)
check('检测时间顺序矛盾', timelineReport.issues.some(issue => issue.dimension === 'timeline' && issue.severity === 'error'))
check('时间线报告不阻断', timelineReport.isBlocking === false)

const worldbook: WorldbookEntry = {
  id: 'magic-rule',
  type: 'worldbook_entry',
  category: 'magic',
  name: '禁魔区',
  description: '王城内无法施法。',
  rules: ['王城内禁止魔法'],
  related_characters: [],
  confidence: 0.85,
  updated_at: '2026-05-07T00:00:00Z',
}

console.log('\n[T5-3] 世界观规则软校验')
const worldbookReport = validator.validateWorldbookRules('他在王城里使用魔法打开了门。', [worldbook])
check('检测世界观规则可能违反', worldbookReport.issues.some(issue => issue.dimension === 'worldbook'))

console.log('\n[T5-4] 汇总报告格式')
const allReport = validator.validateAll({
  text: '李明走进大厅，滔滔不绝地说了很久。他在王城里使用魔法打开了门。',
  characters: [character],
  timelineEvents: events,
  worldbookEntries: [worldbook],
})
check('汇总报告包含标准 issues 数组', Array.isArray(allReport.issues) && allReport.issues.length >= 3)
check('所有 issue severity 合法', allReport.issues.every(issue => ['warning', 'error'].includes(issue.severity)))

console.log(`\n${'─'.repeat(50)}`)
console.log(`结果：${passed} 通过 / ${failed} 失败`)

if (failed > 0) {
  process.exit(1)
}
