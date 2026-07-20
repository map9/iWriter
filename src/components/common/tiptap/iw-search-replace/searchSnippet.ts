export interface SearchSnippetInput {
  before: string
  match: string
  after: string
}

export interface SearchSnippet extends SearchSnippetInput {
  prefixEllipsis: boolean
  suffixEllipsis: boolean
}

export interface SearchSnippetOptions {
  totalWidth?: number
  minimumSideWidth?: number
  boundarySlack?: number
}

interface DisplaySegment {
  text: string
  width: number
}

interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>
}

const Segmenter = (Intl as unknown as {
  Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => GraphemeSegmenter
}).Segmenter
const graphemeSegmenter = new Segmenter('und', { granularity: 'grapheme' })
const WIDE_CHARACTER_PATTERN = /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u
const STRONG_BOUNDARIES = new Set(['。', '！', '？', '；', '.', '!', '?', ';', '\n', '\r'])
const SOFT_BOUNDARIES = new Set(['，', '、', '：', ',', ':', ' ', '\t', '　'])

function toDisplaySegments(text: string): DisplaySegment[] {
  return Array.from(graphemeSegmenter.segment(text), item => ({
    text: item.segment,
    width: WIDE_CHARACTER_PATTERN.test(item.segment) ? 2 : 1,
  }))
}

function segmentsWidth(segments: DisplaySegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.width, 0)
}

export function getSearchSnippetDisplayWidth(text: string): number {
  return segmentsWidth(toDisplaySegments(text))
}

function takeStart(segments: DisplaySegment[], budget: number): DisplaySegment[] {
  const result: DisplaySegment[] = []
  let width = 0

  for (const segment of segments) {
    if (width + segment.width > budget) break
    result.push(segment)
    width += segment.width
  }

  return result
}

function takeEnd(segments: DisplaySegment[], budget: number): DisplaySegment[] {
  const result: DisplaySegment[] = []
  let width = 0

  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index]
    if (!segment || width + segment.width > budget) break
    result.unshift(segment)
    width += segment.width
  }

  return result
}

function boundaryPriority(text: string): number {
  if (STRONG_BOUNDARIES.has(text)) return 2
  if (SOFT_BOUNDARIES.has(text)) return 1
  return 0
}

function refineStartBoundary(
  segments: DisplaySegment[],
  minimumWidth: number,
  slack: number,
): DisplaySegment[] {
  let inspectedWidth = 0
  let bestIndex = -1
  let bestPriority = 0

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (!segment) continue
    inspectedWidth += segment.width
    if (inspectedWidth > slack) break

    const priority = boundaryPriority(segment.text)
    if (
      priority > 0
      && segmentsWidth(segments.slice(index + 1)) >= minimumWidth
      && priority > bestPriority
    ) {
      bestIndex = index
      bestPriority = priority
    }
  }

  return bestIndex >= 0 ? segments.slice(bestIndex + 1) : segments
}

function refineEndBoundary(
  segments: DisplaySegment[],
  minimumWidth: number,
  slack: number,
): DisplaySegment[] {
  let inspectedWidth = 0
  let bestIndex = -1
  let bestPriority = 0

  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index]
    if (!segment) continue
    inspectedWidth += segment.width
    if (inspectedWidth > slack) break

    const priority = boundaryPriority(segment.text)
    if (
      priority > 0
      && segmentsWidth(segments.slice(0, index + 1)) >= minimumWidth
      && priority > bestPriority
    ) {
      bestIndex = index
      bestPriority = priority
    }
  }

  return bestIndex >= 0 ? segments.slice(0, bestIndex + 1) : segments
}

export function buildSearchSnippet(
  input: SearchSnippetInput,
  options: SearchSnippetOptions = {},
): SearchSnippet {
  const totalWidth = options.totalWidth ?? 48
  const minimumSideWidth = options.minimumSideWidth ?? 10
  const boundarySlack = options.boundarySlack ?? 6
  const beforeSegments = toDisplaySegments(input.before)
  const afterSegments = toDisplaySegments(input.after)
  const beforeWidth = segmentsWidth(beforeSegments)
  const afterWidth = segmentsWidth(afterSegments)
  const availableWidth = Math.max(0, totalWidth - getSearchSnippetDisplayWidth(input.match))

  let beforeBudget = Math.min(beforeWidth, Math.floor(availableWidth / 2))
  let afterBudget = Math.min(afterWidth, availableWidth - beforeBudget)
  let remainingWidth = availableWidth - beforeBudget - afterBudget

  const extraBefore = Math.min(remainingWidth, beforeWidth - beforeBudget)
  beforeBudget += extraBefore
  remainingWidth -= extraBefore
  afterBudget += Math.min(remainingWidth, afterWidth - afterBudget)

  let selectedBefore = takeEnd(beforeSegments, beforeBudget)
  let selectedAfter = takeStart(afterSegments, afterBudget)
  const prefixEllipsis = selectedBefore.length < beforeSegments.length
  const suffixEllipsis = selectedAfter.length < afterSegments.length

  if (prefixEllipsis) {
    selectedBefore = refineStartBoundary(selectedBefore, minimumSideWidth, boundarySlack)
  }
  if (suffixEllipsis) {
    selectedAfter = refineEndBoundary(selectedAfter, minimumSideWidth, boundarySlack)
  }

  return {
    before: selectedBefore.map(segment => segment.text).join('').trimStart(),
    match: input.match,
    after: selectedAfter.map(segment => segment.text).join('').trimEnd(),
    prefixEllipsis,
    suffixEllipsis,
  }
}
