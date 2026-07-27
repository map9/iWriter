/**
 * Re-exports of IPC protocol types for use in the renderer process.
 * The source of truth lives in electron/ai/ipc/protocol.ts.
 */

export type {
  SessionContextStatsRequest,
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
  RunFilesystemAutoRejectEvent,
  SnapshotRequestEvent,
  SnapshotResponse,
  SerializedSnapshot,
  SerializedBlockEntry,
  SerializedOutlineEntry,
  DomainReviewItem,
} from '../../electron/ai/ipc/protocol'
