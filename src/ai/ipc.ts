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
  SnapshotRequestEvent,
  SnapshotResponse,
  NovelConfirmRequest,
  NovelConfirmResponse,
  NovelConfirmType,
  NovelConfirmPayload,
  ChapterBoundaryPayload,
  SceneSplitPayload,
  AliasMergePayload,
  StoryStateWritePayload,
  ExpansionPlanPayload,
  SerializedSnapshot,
  SerializedBlockEntry,
  SerializedOutlineEntry,
} from '../../electron/ai/ipc/protocol'
