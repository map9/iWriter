import type { AiContextCompressionEvent, ThreadMessage } from '@shared/ai/contracts'

export interface ConversationMessageEntry {
  kind: 'message'
  key: string
  message: ThreadMessage
  isPreview?: boolean
}

export interface ConversationContextCompressionEntry {
  kind: 'context-compressed'
  key: string
  event: AiContextCompressionEvent
}

export type ConversationEntry = ConversationMessageEntry | ConversationContextCompressionEntry

export interface ConversationView {
  persistedMessages: ThreadMessage[]
  entries: ConversationEntry[]
}

