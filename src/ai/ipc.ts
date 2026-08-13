/**
 * Compatibility exports of the shared AI IPC protocol for the renderer process.
 * New code should import directly from `@shared/ai/contracts/protocol`.
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
} from '../../shared/ai/contracts/protocol'
