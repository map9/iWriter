/**
 * T6 Spike 验收脚本
 */

import { createReviewBatchState } from '../src/ai/review/state'
import type { BlockEditProposal, ValidationIssue } from '../src/ai/types'

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

const validationReport: ValidationIssue[] = [
  {
    dimension: 'character',
    severity: 'warning',
    description: '人物动机需要复核。',
    suggestion: '补充一处内心动机。',
  },
]

const proposal: BlockEditProposal = {
  id: 'proposal-novel-1',
  kind: 'block',
  type: 'insert',
  status: 'pending',
  afterNodeId: '0',
  displayBlockId: 0,
  newContent: '扩写段落。',
  validationReport,
}

console.log('\n[T6-Spike-1] ReviewBatchState source')
const agentBatch = createReviewBatchState('thread-1', 'turn-1', [proposal])
check('默认 source 是 agent', agentBatch.source === 'agent')

const novelBatch = createReviewBatchState('novel-thread', 'novel-turn', [proposal], {
  source: 'novel_harness',
  novelSessionId: 'novel-session-1',
})
check('支持 novel_harness source', novelBatch.source === 'novel_harness')
check('保留 novelSessionId', novelBatch.novelSessionId === 'novel-session-1')

console.log('\n[T6-Spike-2] ValidationReport 字段')
check('proposal 可携带 validationReport', proposal.validationReport?.[0]?.dimension === 'character')
check('validation severity 合法', proposal.validationReport?.[0]?.severity === 'warning')

console.log(`\n${'─'.repeat(50)}`)
console.log(`结果：${passed} 通过 / ${failed} 失败`)

if (failed > 0) {
  throw new Error('T6 Spike verification failed')
}
