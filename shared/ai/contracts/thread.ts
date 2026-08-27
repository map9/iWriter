import type { AiAgentDomain, AiAgentMode, AiThinkingLevel } from './agent'
import type { ThreadMessage } from './message'

export interface ThreadRuntimeSelection {
  providerConfigId: string
  modelId: string
  thinkingLevel: AiThinkingLevel
}

export interface TurnRuntimeSnapshot extends ThreadRuntimeSelection {
  turnId: string
  providerConfigRevision: string
  domain: AiAgentDomain
  mode: AiAgentMode
  workspacePath: string | null
}

export interface SendContext {
  filePaths: string[]
  directories: string[]
}

export interface ContextAttachment {
  path: string
  kind: 'file' | 'directory'
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface ThreadUsage {
  main: UsageTotals
  subagents: UsageTotals
  latestMainInputTokens: number
}

export interface AiThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages?: ThreadMessage[]
  messagesLoaded?: boolean
  providerConfigId: string
  modelId: string
  domain: AiAgentDomain
  mode: AiAgentMode
  thinkingLevel?: AiThinkingLevel
  workspacePath?: string | null
  pendingRuntime?: ThreadRuntimeSelection
  hasError?: boolean
  usage?: ThreadUsage
}
