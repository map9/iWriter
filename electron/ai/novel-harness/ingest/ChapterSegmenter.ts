import type {
  ChapterBoundaryPayload,
  SerializedBlockEntry,
  SerializedOutlineEntry,
  SerializedSnapshot,
} from '../../ipc/protocol'

const DEFAULT_WINDOW_WORDS = 2000

export type ChapterBoundary = ChapterBoundaryPayload['chapters'][number]

export interface SegmentOptions {
  windowWords?: number
}

export class ChapterSegmenter {
  segmentSnapshot(snapshot: SerializedSnapshot, options: SegmentOptions = {}): ChapterBoundary[] {
    if (!snapshot.blockMap.length) return []
    if (snapshot.outline.length) {
      return this.segmentByOutline(snapshot)
    }
    return this.segmentByFixedWindow(snapshot, options.windowWords ?? DEFAULT_WINDOW_WORDS)
  }

  segmentByOutline(snapshot: SerializedSnapshot): ChapterBoundary[] {
    if (!snapshot.outline.length) return []

    const chapterLevel = Math.min(...snapshot.outline.map(entry => entry.level))
    const headings = snapshot.outline.filter(entry => entry.level === chapterLevel)

    return headings.map((heading, index) => {
      const endBlockId = this.findSectionEnd(snapshot.blockMap, heading)
      return {
        id: `ch${String(index + 1).padStart(2, '0')}`,
        title: heading.text.trim() || `未命名章节 ${index + 1}`,
        wordCount: heading.wordCount,
        blockCount: Math.max(0, endBlockId - heading.displayId + 1),
        startBlockId: heading.displayId,
        endBlockId,
      }
    })
  }

  segmentByFixedWindow(snapshot: SerializedSnapshot, windowWords = DEFAULT_WINDOW_WORDS): ChapterBoundary[] {
    const targetWords = Math.max(1, windowWords)
    const chapters: ChapterBoundary[] = []
    let startBlockId = snapshot.blockMap[0]?.displayId ?? 1
    let endBlockId = startBlockId
    let wordCount = 0

    for (const block of snapshot.blockMap) {
      const blockWords = countWords(block.content)
      const shouldStartNext =
        wordCount > 0 &&
        wordCount + blockWords > targetWords

      if (shouldStartNext) {
        chapters.push(this.createUnnamedChapter(chapters.length, startBlockId, endBlockId, wordCount))
        startBlockId = block.displayId
        wordCount = 0
      }

      endBlockId = block.displayId
      wordCount += blockWords
    }

    if (wordCount > 0 || !chapters.length) {
      chapters.push(this.createUnnamedChapter(chapters.length, startBlockId, endBlockId, wordCount))
    }

    return chapters
  }

  extractWindowWords(adjustmentText: string): number | null {
    const match = adjustmentText.match(/(\d{3,6})/)
    if (!match) return null
    const value = Number(match[1])
    if (!Number.isFinite(value)) return null
    return Math.max(500, Math.min(value, 100_000))
  }

  private findSectionEnd(
    blockMap: SerializedBlockEntry[],
    heading: SerializedOutlineEntry,
  ): number {
    const nextHeading = blockMap.find(entry =>
      entry.displayId > heading.displayId &&
      entry.nodeType === 'heading' &&
      (entry.headingLevel ?? 1) <= heading.level
    )
    return nextHeading
      ? nextHeading.displayId - 1
      : blockMap[blockMap.length - 1]?.displayId ?? heading.displayId
  }

  private createUnnamedChapter(
    index: number,
    startBlockId: number,
    endBlockId: number,
    wordCount: number,
  ): ChapterBoundary {
    return {
      id: `ch${String(index + 1).padStart(2, '0')}`,
      title: `未命名章节 ${index + 1}`,
      wordCount,
      blockCount: Math.max(0, endBlockId - startBlockId + 1),
      startBlockId,
      endBlockId,
    }
  }
}

function countWords(text: string): number {
  if (!text.trim()) return 0
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const latin = (text.match(/\b\w+\b/g) ?? []).length
  return cjk + latin
}
