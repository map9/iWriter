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

// ── Tool Call ──────────────────────────────────────────────────────────────

/** Semantic kind of a tool call — used for UI icon/color selection. */
export type AiToolCallKind =
  | 'read' | 'edit' | 'delete' | 'move' | 'search'
  | 'execute' | 'think' | 'fetch' | 'other'

/** A tool call produced by an LLM or ACP agent, stored in ThreadMessage. */
export interface AiToolCall {
  id: string
  name: string

  // ── Semantic display fields ──────────────────────────────────────────────
  /** Semantic kind for UI icon/color selection */
  kind: AiToolCallKind
  /** Human-readable title shown in the UI (e.g. "读取 introduction.md") */
  title: string
  /** Lifecycle status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  /** File reference extracted from tool arguments (if applicable) */
  file?: { path: string; startLine?: number; endLine?: number }

  arguments: Record<string, unknown>
  /** Result summary shown in the UI (for read-type tools) */
  result?: string
  isError?: boolean
}

// A tool result (stored in ThreadMessage for LLM context reconstruction)
export interface AiToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

// ── Edit Proposals ─────────────────────────────────────────────────────────

interface BaseEditProposal {
  id: string
  description?: string
  status: 'pending' | 'applied' | 'rejected'
}

/** Block-level edit proposal — produced by Native LLM block edit tools. */
export interface BlockEditProposal extends BaseEditProposal {
  kind: 'block'
  /** Specific tool that generated this proposal */
  type: 'edit' | 'insert' | 'delete' | 'replace_range'

  // Single-block operations (edit, insert, delete)
  displayBlockId?: number   // {b:n} display ID the LLM referenced
  nodeId?: string           // TipTap node.attrs.id (nanoid)
  nodeType?: string         // paragraph, heading, codeBlock, etc.
  afterNodeId?: string      // for insert_block: insert after this node ('0' = document start)
  oldContent?: string       // Markdown of original block (for diff display)
  newContent?: string       // Markdown of replacement / inserted content

  // Range operations (replace_range)
  startDisplayBlockId?: number
  endDisplayBlockId?: number
  startNodeId?: string
  endNodeId?: string

  // Associated tool call ID
  toolCallId?: string

  /** If set, this edit targets a file on disk (not the active editor). Must be an .iwt file. */
  filePath?: string
}

/** File-level edit proposal — produced by ACP Agent fs/write_text_file interception. */
export interface FileEditProposal extends BaseEditProposal {
  kind: 'file'
  sessionId: string         // ACP session that triggered the write
  filePath: string
  oldContent: string        // Current editor Markdown
  newContent: string        // Agent's proposed Markdown
  toolCallId?: string
}

/** File creation proposal — produced by create_document when no document is open. */
export interface FileCreateProposal extends BaseEditProposal {
  kind: 'create_file'
  filename: string          // Desired tab name (without extension)
  content: string           // Full Markdown to inject into the new tab's editor
  toolCallId?: string
}

export type EditProposal = BlockEditProposal | FileEditProposal | FileCreateProposal

// ── Plan Entry (ACP-only) ──────────────────────────────────────────────────

export interface PlanEntry {
  content: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed'
}

// ── Thread Message ─────────────────────────────────────────────────────────

/** A message stored in a thread. */
export interface ThreadMessage {
  id: string
  role: 'user' | 'assistant'
  content: string

  /** Set to true for error messages so the UI can render them with error styling. */
  isError?: boolean

  /** Extended-thinking / chain-of-thought content (collapsible in UI) */
  thinkingContent?: string

  /** ACP-only: execution plan entries from the agent's `plan` notification */
  planEntries?: PlanEntry[]

  toolCalls?: AiToolCall[]
  toolResults?: AiToolResult[]
  editProposals?: EditProposal[]

  timestamp: number
  usage?: { inputTokens: number; outputTokens: number }
}

// ── Attach / Send Context ──────────────────────────────────────────────────

/**
 * All context attachments collected by the UI before a sendMessage call.
 * Passed from useChatSend → aiStore.sendMessage.
 */
export interface SendContext {
  /** Local text file paths (md/txt/iwt/code) — listed in <context_files> system prompt section. */
  textFilePaths: string[]
  /** Binary file paths (images, PDFs) — read by the store and embedded as inline base64 in the message. */
  binaryFilePaths: string[]
  /** Attached directory paths — listed in <environment> system prompt section. */
  directories: string[]
}

/** Info about an open editor tab (for environment context in system prompt). */
export interface OpenTabInfo {
  path?: string        // absolute file path (undefined for unsaved new files)
  name: string         // tab display name
  isDirty: boolean     // has unsaved changes
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
  /** Set to true when the last run ended with an error (shown in history list) */
  hasError?: boolean
  /** File path this thread was started against (set on first user message). Null = no file was open. */
  originFilePath?: string | null
  // EditorState delta tracking (Phase C)
  /** Hash of last injected editor state (filePath|outlineText|sectionHeading). */
  editorStateHash?: string
  /** File path from the last injected EditorState (to detect file switches). */
  lastFilePath?: string | null
  /** Section heading from the last injected EditorState (to detect cursor moves). */
  lastSectionHeading?: string | null
  /** Whether the workspace path has already been injected (only on first message). */
  workspaceInjected?: boolean
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
    // Document access tools: always allowed (read-only)
    get_document_outline: 'allow',
    get_section:          'allow',
    get_blocks:           'allow',
    get_block_context:    'allow',
    // Edit tools: require confirm
    edit_block:           'allow',
    insert_block:         'allow',
    delete_block:         'allow',
    replace_range:        'allow',
    create_document:      'allow',
  }
}

// ── Tool kind inference for Native LLM ────────────────────────────────────

export function inferToolKind(toolName: string): AiToolCallKind {
  const mapping: Record<string, AiToolCallKind> = {
    get_document_outline: 'read',
    get_section:          'read',
    get_blocks:           'read',
    get_block_context:    'read',
    edit_block:           'edit',
    insert_block:         'edit',
    delete_block:         'delete',
    replace_range:        'edit',
    create_document:      'edit',
  }
  return mapping[toolName] ?? 'other'
}

/** The set of tool names that produce edit proposals (user must approve before execution). */
export const BLOCK_EDIT_TOOLS = new Set([
  'edit_block',
  'insert_block',
  'delete_block',
  'replace_range',
  'create_document',
])
