// AI Provider Types

export type AiProviderType = 'openai-compat' | 'anthropic' | 'gemini' | 'acp'

/** 'llm' = native LLM API,  'agent' = external ACP agent process */
export type AiProviderKind = 'llm' | 'agent'

export type AiAgentProfile = 'write' | 'ask' | 'minimal'

export type AiToolPermission = 'confirm' | 'allow' | 'deny'

// Provider configuration (stored by user)
export interface AiProviderConfig {
  id: string
  type: AiProviderType
  /** Distinguishes direct LLM API from an external ACP agent. Defaults to 'llm'. */
  kind?: AiProviderKind
  label: string           // user display name
  apiKey: string
  baseUrl?: string        // for openai-compat: endpoint override
  defaultModelId: string
  enabled: boolean
  /** Which built-in preset this config was created from */
  presetId?: string
  /** Available model IDs for this provider (shown in model picker) */
  models?: string[]
  /** Agent operation modes, e.g. ['Plan', 'Agent', 'AutoPilot'] */
  agentModes?: string[]
  /** Think modes for LLM providers that support extended thinking, e.g. ['Normal', 'Think'] */
  thinkModes?: string[]
  /** Last selected model ID for this provider (restored when switching back) */
  lastSelectedModelId?: string
  /** Last selected mode (agent mode or think mode) for this provider */
  lastSelectedMode?: string
  // ACP-specific: command to spawn the agent process
  acpCommand?: string
  acpArgs?: string[]
  /** Extra environment variables injected when spawning the agent process */
  acpEnv?: Record<string, string>
  /** Models dynamically discovered from the ACP agent's initialize response */
  acpDynamicModels?: AcpModelInfo[]
  /** Modes dynamically discovered from the ACP agent's initialize response */
  acpDynamicModes?: AcpModeInfo[]
}

/** Model info reported by an ACP agent in its initialize response. */
export interface AcpModelInfo {
  id: string
  name: string
  description?: string
}

/** Mode info reported by an ACP agent in its initialize response. */
export interface AcpModeInfo {
  id: string
  name: string
  description?: string
}

/** A pending permission request from an ACP agent. */
export interface AcpPermissionRequest {
  sessionId: string
  requestId: number
  permission: string
  path?: string
  description?: string
  options: string[]
}

// Model information
export interface AiModel {
  id: string
  label: string
  contextWindow: number
  supportsTools: boolean
  supportsVision?: boolean
}

// A completed tool call (stored in ThreadMessage)
export interface AiToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

// A tool result (stored in ThreadMessage)
export interface AiToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

// An edit proposal produced by the edit_document tool
export interface EditProposal {
  id: string
  toolCallId: string
  oldText: string
  newText: string
  description: string
  filePath?: string  // undefined = current editor document
  status: 'pending' | 'applied' | 'rejected'
}

// A message stored in a thread
export interface ThreadMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: AiToolCall[]
  toolResults?: AiToolResult[]
  editProposals?: EditProposal[]
  timestamp: number
  usage?: { inputTokens: number; outputTokens: number }
}

// A thread (one conversation)
export interface AiThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ThreadMessage[]
  providerConfigId: string
  modelId: string
  profile: AiAgentProfile
  /** Current agent mode for agent-type providers (e.g. 'Plan', 'Agent') */
  agentMode?: string
  /** Current think mode for LLM providers that support it */
  thinkMode?: string
}

// Persisted AI settings
export interface AiSettings {
  providerConfigs: AiProviderConfig[]
  activeProviderConfigId: string | null
  defaultProfile: AiAgentProfile
  toolPermissions: Record<string, AiToolPermission>
}

// Default AI settings
export const DEFAULT_AI_SETTINGS: AiSettings = {
  providerConfigs: [],
  activeProviderConfigId: null,
  defaultProfile: 'write',
  toolPermissions: {
    edit_document: 'allow',
    read_file: 'allow',
    list_directory: 'allow',
    write_file: 'confirm',
    create_document: 'confirm',
  }
}
