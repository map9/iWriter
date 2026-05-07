import type {
  CharacterCard,
  TimelineEvent,
  ValidationIssue,
  WorldbookEntry,
} from '../schema/types'

export type ValidationDimension = 'character' | 'timeline' | 'worldbook'

export interface ValidationReport {
  issues: ValidationIssue[]
  mode: 'soft'
  isBlocking: false
}

export class ConsistencyValidator {
  validateCharacterBehavior(text: string, character: CharacterCard): ValidationReport {
    const issues: ValidationIssue[] = []
    const normalizedText = normalizeText(text)
    const names = [character.name, ...character.aliases].filter(Boolean)
    const characterMentioned = names.some(name => normalizedText.includes(normalizeText(name)))

    if (!characterMentioned) {
      issues.push({
        dimension: 'character',
        severity: 'warning',
        description: `正文中没有明显提到人物 "${character.name}"。`,
        suggestion: '如果该段应该使用此人物卡，请补充人物出场、行动或称谓；否则可忽略此建议。',
      })
    }

    const latestStatus = character.state_by_chapter.at(-1)?.status
    if (latestStatus && indicatesDead(latestStatus) && indicatesActivePresence(normalizedText, names)) {
      issues.push({
        dimension: 'character',
        severity: 'error',
        description: `人物 "${character.name}" 的最近状态像是死亡/退场，但正文仍出现主动行动。`,
        suggestion: '确认这是回忆、幻觉、误传，还是需要更新人物状态。',
      })
    }

    if (character.personality && contradictsTrait(normalizedText, character.personality)) {
      issues.push({
        dimension: 'character',
        severity: 'warning',
        description: `人物 "${character.name}" 的行为可能与 personality 描述不一致。`,
        suggestion: '保留反差也可以，但建议在正文中给出动机或铺垫。',
      })
    }

    return softReport(issues)
  }

  validateTimeline(text: string, events: TimelineEvent[]): ValidationReport {
    const issues: ValidationIssue[] = []
    const orderedEvents = [...events].sort((a, b) =>
      firstBlockId(a) - firstBlockId(b)
    )

    for (let index = 1; index < orderedEvents.length; index++) {
      const previous = orderedEvents[index - 1]!
      const current = orderedEvents[index]!
      const previousTime = parseComparableTime(previous.time)
      const currentTime = parseComparableTime(current.time)

      if (previousTime !== null && currentTime !== null && currentTime < previousTime) {
        issues.push({
          dimension: 'timeline',
          severity: 'error',
          description: `时间线顺序可能矛盾："${current.event}" 的时间早于前一个事件 "${previous.event}"。`,
          suggestion: '检查事件顺序、章节位置或 time 字段是否需要调整。',
        })
      }
    }

    for (const event of events) {
      if (!textIncludesEventHint(text, event)) {
        issues.push({
          dimension: 'timeline',
          severity: 'warning',
          description: `正文中没有明显找到时间线事件 "${event.event}" 的对应表述。`,
          suggestion: '确认该事件是否应属于当前段落，或补充更清晰的事件描写。',
        })
      }
    }

    return softReport(issues)
  }

  validateWorldbookRules(text: string, entries: WorldbookEntry[]): ValidationReport {
    const issues: ValidationIssue[] = []
    const normalizedText = normalizeText(text)

    for (const entry of entries) {
      for (const rule of entry.rules) {
        const forbidden = extractForbiddenTerm(rule)
        if (!forbidden) continue

        if (normalizedText.includes(normalizeText(forbidden))) {
          issues.push({
            dimension: 'worldbook',
            severity: 'warning',
            description: `正文可能违反设定 "${entry.name}"：${rule}`,
            suggestion: `检查 "${forbidden}" 是否确实被规则禁止；如果是例外情况，请在正文中解释条件。`,
          })
        }
      }
    }

    return softReport(issues)
  }

  validateAll(input: {
    text: string
    characters?: CharacterCard[]
    timelineEvents?: TimelineEvent[]
    worldbookEntries?: WorldbookEntry[]
  }): ValidationReport {
    const issues = [
      ...(input.characters ?? []).flatMap(character =>
        this.validateCharacterBehavior(input.text, character).issues
      ),
      ...this.validateTimeline(input.text, input.timelineEvents ?? []).issues,
      ...this.validateWorldbookRules(input.text, input.worldbookEntries ?? []).issues,
    ]

    return softReport(issues)
  }
}

function softReport(issues: ValidationIssue[]): ValidationReport {
  return {
    issues,
    mode: 'soft',
    isBlocking: false,
  }
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase()
}

function indicatesDead(status: string): boolean {
  return /死亡|死去|阵亡|牺牲|dead|deceased|killed/i.test(status)
}

function indicatesActivePresence(text: string, names: string[]): boolean {
  const normalizedNames = names.map(normalizeText).filter(Boolean)
  const activeWords = /说|问|答|走|跑|看|拿|笑|哭|出现|said|asked|walked|ran|looked|held|appeared/
  return normalizedNames.some(name => text.includes(name)) && activeWords.test(text)
}

function contradictsTrait(text: string, trait: string): boolean {
  const normalizedTrait = normalizeText(trait)
  if (/沉默|寡言|silent|quiet/.test(normalizedTrait)) {
    return /滔滔不绝|喋喋不休|长篇大论|talked endlessly|kept talking/.test(text)
  }
  if (/胆小|怯懦|coward|timid/.test(normalizedTrait)) {
    return /毫不犹豫|无所畏惧|勇敢地|fearlessly|without hesitation/.test(text)
  }
  return false
}

function firstBlockId(event: TimelineEvent): number {
  return event.source_refs[0]?.block_id ?? Number.MAX_SAFE_INTEGER
}

function parseComparableTime(time: string): number | null {
  const normalized = time.trim()
  const chapterMatch = normalized.match(/(?:第)?(\d+)(?:章|chapter)/i)
  if (chapterMatch) return Number(chapterMatch[1])

  const numericMatch = normalized.match(/\d+(?:\.\d+)?/)
  if (numericMatch) return Number(numericMatch[0])

  const orderWords = ['清晨', '上午', '中午', '下午', '傍晚', '夜晚', '深夜']
  const orderIndex = orderWords.findIndex(word => normalized.includes(word))
  return orderIndex >= 0 ? orderIndex : null
}

function textIncludesEventHint(text: string, event: TimelineEvent): boolean {
  const normalizedText = normalizeText(text)
  const eventWords = normalizeText(event.event)
    .split(/[^\u4e00-\u9fffa-z0-9]+/i)
    .filter(word => word.length >= 2)

  if (eventWords.some(word => normalizedText.includes(word))) return true
  return event.characters.some(character => normalizedText.includes(normalizeText(character)))
}

function extractForbiddenTerm(rule: string): string | null {
  const patterns = [
    /(?:禁止|不能|不可|不允许)([^，。；;,.]+)/,
    /(?:must not|cannot|can't|forbid(?:s|den)?)([^.;,]+)/i,
  ]

  for (const pattern of patterns) {
    const match = rule.match(pattern)
    const term = match?.[1]?.trim()
    if (term) return term.replace(/^(任何|使用|出现|拥有|use|have|show)\s*/i, '').trim()
  }

  return null
}
