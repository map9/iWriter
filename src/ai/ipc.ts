/**
 * Re-exports of IPC protocol types for use in the renderer process.
 * The source of truth lives in electron/ai/ipc/protocol.ts.
 */

export type {
  SessionContextStatsRequest,
  SessionContextStatsResponse,
  SendMessageRequest,
  ResumeDecision,
  ResumeRunRequest,
  StreamChunkEvent,
  RunInterruptedEvent,
  RunDoneEvent,
  RunErrorEvent,
  RunModelFallbackEvent,
  RunFilesystemAutoRejectEvent,
  SnapshotRequestEvent,
  SnapshotResponse,
  SerializedSnapshot,
  SerializedBlockEntry,
  SerializedOutlineEntry,
  EditorStateRequestEvent,
  EditorStateResponse,
  EditorStateSnapshot,
  EditorStateDocument,
  EditorStateTab,
  DomainReviewItem,
} from '../../electron/ai/ipc/protocol'
