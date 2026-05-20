/**
 * Re-exports of IPC protocol types for use in the renderer process.
 * The source of truth lives in electron/ai/ipc/protocol.ts.
 */

export type {
  CompactInputRequest,
  CompactInputResponse,
  SessionContextStatsResponse,
  SendMessageRequest,
  EditorContext,
  ResumeDecision,
  ResumeRunRequest,
  StreamChunkEvent,
  RunInterruptedEvent,
  RunDoneEvent,
  RunErrorEvent,
  RunContextCompressedEvent,
  RunModelFallbackEvent,
  SnapshotRequestEvent,
  SnapshotResponse,
  SerializedSnapshot,
  SerializedBlockEntry,
  SerializedOutlineEntry,
  DomainReviewItem,
} from '../../electron/ai/ipc/protocol'
