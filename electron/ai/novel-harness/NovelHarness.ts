import type { SnapshotBroker } from '../document/SnapshotBroker'
import type { NovelConfirmRequest, NovelConfirmResponse } from '../ipc/protocol'
import { ConfirmGate } from './ipc/ConfirmGate'
import { ChapterSegmenter } from './ingest/ChapterSegmenter'

const MAX_ADJUST_ROUNDS = 5

export class NovelHarness {
  private readonly segmenter = new ChapterSegmenter()

  constructor(
    private readonly snapshotBroker: SnapshotBroker,
    private readonly confirmGate: ConfirmGate,
  ) {}

  async startCompress(filePath: string | null = null): Promise<NovelConfirmResponse> {
    const snapshot = await this.snapshotBroker.requestSnapshot(filePath)
    if (!snapshot) {
      throw new Error('Unable to read document snapshot for novel compression.')
    }

    let chapters = this.segmenter.segmentSnapshot(snapshot)
    if (!chapters.length) {
      throw new Error('No document blocks found for novel compression.')
    }

    for (let round = 0; round < MAX_ADJUST_ROUNDS; round++) {
      const response = await this.confirmGate.waitForConfirm({
        sessionId: this.createSessionId('chapter_boundary'),
        type: 'chapter_boundary',
        payload: { chapters },
      })

      if (response.decision !== 'adjust') {
        return response
      }

      const windowWords = this.segmenter.extractWindowWords(response.adjustmentText ?? '')
      if (windowWords) {
        chapters = this.segmenter.segmentByFixedWindow(snapshot, windowWords)
      } else if (response.adjustedPayload && 'chapters' in response.adjustedPayload) {
        chapters = response.adjustedPayload.chapters
      }
    }

    throw new Error('Chapter boundary adjustment exceeded the maximum retry count.')
  }

  private createSessionId(type: NovelConfirmRequest['type']): string {
    return `novel-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
