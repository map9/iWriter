import type {
  CreativeRoundResult,
  EditProposal,
  EditRoundResult,
} from './review'
import type { AiToolCall, AiToolResult } from './tool'

export interface AiContextCompressionEvent {
  id: string
  threadId: string
  turnId?: string
  subagentId?: string
  subagentName?: string
  anchorMessageId?: string
  anchorToolCallId?: string
  status: 'compressing' | 'completed' | 'failed'
  startedAt: number
  timestamp: number
  summary?: string
  filePath?: string | null
  compressedMessageCount?: number
  error?: string
}

export interface MessageTextBlock {
  type: 'text'
  text: string
}

export interface MessageToolCallBlock {
  type: 'tool_call'
  toolCallId: string
}

export interface MessageThinkingBlock {
  type: 'thinking'
  text: string
}

export interface MessageAgentEventBlock {
  type: 'agent_event'
  text?: string
  agentId?: string
  agentName?: string
  status?: 'started' | 'running' | 'completed' | 'failed'
}

export interface MessageContextCompressionBlock {
  type: 'context_compression'
  event: AiContextCompressionEvent
}

export interface TaskPlanItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type MessageContentBlock =
  | MessageTextBlock
  | MessageToolCallBlock
  | MessageThinkingBlock
  | MessageAgentEventBlock
  | MessageContextCompressionBlock

export type AiSubTaskProgressStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'done'
  | 'error'
  | 'cancelled'

export interface AiSubTaskProgress {
  invocationId: string
  name: string
  status: AiSubTaskProgressStatus
  text: string
  thinkingText: string
  toolCalls: AiToolCall[]
  contentBlocks?: MessageContentBlock[]
  contextCompressionEvents?: AiContextCompressionEvent[]
  errorText?: string
}

export interface ThreadMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  turnId?: string
  isError?: boolean
  thinkingContent?: string
  toolCalls?: AiToolCall[]
  toolResults?: AiToolResult[]
  editProposals?: EditProposal[]
  taskPlan?: {
    toolCallId?: string
    items: TaskPlanItem[]
  }
  editRoundResult?: EditRoundResult
  creativeRoundResult?: CreativeRoundResult
  contentBlocks?: MessageContentBlock[]
  subTasks?: AiSubTaskProgress[]
  timestamp: number
  usage?: { inputTokens: number; outputTokens: number }
}
