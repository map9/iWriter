/**
 * Re-exports of IPC protocol types for use in the renderer process.
 * The source of truth lives in electron/ai/ipc/protocol.ts.
 */

export type {
  SendMessageRequest,
  EditorContext,
  ResumeDecision,
  ResumeRunRequest,
  StreamChunkEvent,
  RunInterruptedEvent,
  RunDoneEvent,
  RunErrorEvent,
  SnapshotRequestEvent,
  SnapshotResponse,
  SerializedSnapshot,
  SerializedBlockEntry,
  SerializedOutlineEntry,
} from '../../electron/ai/ipc/protocol'
