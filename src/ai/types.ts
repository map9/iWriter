// AI Provider Types

export type AiProviderType = 'openai-compat' | 'deepseek' | 'anthropic' | 'gemini'

export type AiAgentDomain = 'editing' | 'creative'

export type AiAgentMode = 'edit' | 'minimal' | 'creative'

export type AiThinkingLevel = 'low' | 'medium' | 'high' | 'extra_high'

export type AiToolPermission = 'confirm' | 'allow' | 'deny'

export interface AiModelProfile {
  maxInputTokens?: number
  maxOutputTokens?: number
  imageInputs?: boolean
  imageUrlInputs?: boolean
  pdfInputs?: boolean
  audioInputs?: boolean
  videoInputs?: boolean
  imageToolMessage?: boolean
  pdfToolMessage?: boolean
  reasoningOutput?: boolean
  imageOutputs?: boolean
  audioOutputs?: boolean
  videoOutputs?: boolean
  toolCalling?: boolean
  toolChoice?: boolean
  structuredOutput?: boolean
}

export interface AiProviderParameters {
  temperature?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
}

export interface AiProviderParameterSupport {
  temperature: boolean
  topP: boolean
  frequencyPenalty: boolean
  presencePenalty: boolean
}

// Provider configuration (stored by user)
export interface AiProviderConfig {
  id: string
  type: AiProviderType
  label: string           // user display name
  apiKey: string
  baseUrl?: string        // for openai-compat / deepseek: endpoint override
  defaultModelId: string
  enabled: boolean
  /** Which built-in preset this config was created from */
  presetId?: string
  /** Available model IDs for this provider (shown in model picker) */
  models?: string[]
  /** Per-model profile overrides used when LangChain does not know the model family. */
  modelProfiles?: Record<string, AiModelProfile>
  /** Last selected model ID for this provider (restored when switching back) */
  lastSelectedModelId?: string
  /** Last selected reasoning/thinking level for this provider */
  lastSelectedThinkingLevel?: AiThinkingLevel
  /** Protocol-level generation parameters */
  parameters?: AiProviderParameters
}

// ── Tool Call ──────────────────────────────────────────────────────────────

/** Semantic kind of a tool call — used for UI icon/color selection. */
export type AiToolCallKind =
  | 'read' | 'edit' | 'delete' | 'search'
  | 'execute' | 'delegate' | 'other'

export type AiToolDetailType =
  | 'outline'
  | 'section'
  | 'blocks'
  | 'block_context'
  | 'search_sections'
  | 'workspace_search'
  | 'todo_list'
  | 'subagent_task'
  | 'text'
  | 'json'

export interface AiToolDisplayMeta {
  actionLabel?: string
  targetLabel?: string
  targetPath?: string
  contextLabel?: string
  summaryLabel?: string
  detailType?: AiToolDetailType
  parsedResult?: Record<string, unknown> | null
  rawResult?: string
}

/** A tool call produced by an LLM or ACP agent, stored in ThreadMessage. */
export interface AiToolCall {
  id: string
  name: string

  // ── Semantic display fields ──────────────────────────────────────────────
  /** Semantic kind for UI icon/color selection */
  kind: AiToolCallKind
  /** Human-readable title shown in the UI (e.g. "读取 introduction.md") */
  title: string
  /** Compact parameter summary shown beside the title */
  paramsText?: string
  /** Lifecycle status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected'
  /** File reference extracted from tool arguments (if applicable) */
  file?: { path: string; startLine?: number; endLine?: number }

  arguments: Record<string, unknown>
  /** Result summary shown in the UI (for read-type tools) */
  result?: string
  isError?: boolean
  display?: AiToolDisplayMeta
}

// A tool result (stored in ThreadMessage for LLM context reconstruction)
export interface AiToolResult {
  toolCallId: string
  content: string
  isError?: boolean
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

export interface TaskPlanItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** Ordered content block for interleaved text + tool call rendering. */
export type MessageContentBlock =
  | MessageTextBlock
  | MessageToolCallBlock
  | MessageThinkingBlock
  | MessageAgentEventBlock

// ── Edit Proposals ─────────────────────────────────────────────────────────

interface BaseEditProposal {
  id: string
  description?: string
  status: 'pending' | 'applied' | 'rejected'
  sourceMessageId?: string
  sourceTurnId?: string
  /** True if the user modified the proposal args before approving (edit decision). */
  wasEdited?: boolean
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
  anchorContent?: string    // Markdown of the anchor block from the proposal snapshot
  newContent?: string       // Markdown of replacement / inserted content
  expectedCurrentContent?: string // Expected current Markdown of the target block
  expectedAnchorContent?: string  // Expected current Markdown of the anchor block for insert
  expectedOldContent?: string     // Expected current Markdown of the replaced block range

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

/** File creation proposal — produced by create_document when no document is open. */
export interface FileCreateProposal extends BaseEditProposal {
  kind: 'create_file'
  filename: string          // Desired tab name (without extension)
  content: string           // Full Markdown to inject into the new tab's editor
  toolCallId?: string
}

export type EditProposal = BlockEditProposal | FileCreateProposal

// ── Creative Review Items ─────────────────────────────────────────────────

interface BaseCreativeReviewItem {
  id: string
  status: 'pending' | 'applied' | 'rejected'
  sourceMessageId?: string
  sourceTurnId?: string
  toolCallId?: string
  wasEdited?: boolean
}

export interface CreativePlanReviewItem extends BaseCreativeReviewItem {
  kind: 'creative_plan'
  toolName: 'confirm_writing_plan'
  plan: string
  rationale: string
  alternatives?: string[]
}

export interface CreativeWriteReviewItem extends BaseCreativeReviewItem {
  kind: 'creative_write'
  toolName: 'write_to_chapter'
  filename: string
  mode: 'append' | 'insert_at' | 'replace_range'
  approvedPlan: string
  newContent: string
  insertAnchor?: string
  replaceStartAnchor?: string
  replaceEndAnchor?: string
}

export interface CreativeStoryBibleReviewItem extends BaseCreativeReviewItem {
  kind: 'creative_storybible'
  toolName: 'replace_storybible_section' | 'rebuild_storybible'
  section?: string
  newContent: string
}

export type CreativeReviewItem =
  | CreativePlanReviewItem
  | CreativeWriteReviewItem
  | CreativeStoryBibleReviewItem

export type EditRoundResultState =
  | 'applied'
  | 'applied_edited'
  | 'skipped'
  | 'rework_requested'
  | 'ended'
  | 'failed_to_apply'

// ── Creative Round Results ─────────────────────────────────────────────────

export type CreativeRoundResultState =
  | 'applied'
  | 'applied_edited'
  | 'skipped'
  | 'failed_to_apply'

export interface CreativeRoundResultItem {
  reviewId: string
  state: CreativeRoundResultState
  kind: CreativeReviewItem['kind']
  toolName: string
  label: string
  finalContent?: string
  failureMessage?: string
}

export interface CreativeRoundResult {
  total: number
  applied: number
  appliedEdited: number
  skipped: number
  failedToApply: number
  items: CreativeRoundResultItem[]
}

export interface EditRoundResultItem {
  proposalId: string
  state: EditRoundResultState
  kind: EditProposal['kind'] | BlockEditProposal['type']
  label: string
  filePath?: string
  description?: string
  oldContent?: string
  newContent?: string
  finalAppliedContent?: string
  failureMessage?: string
  blockInfo?: {
    displayBlockId?: number
    startDisplayBlockId?: number
    endDisplayBlockId?: number
  }
}

export interface EditRoundResult {
  total: number
  applied: number
  appliedEdited: number
  skipped: number
  reworkRequested: number
  ended: number
  failedToApply: number
  items: EditRoundResultItem[]
}

// ── Thread Message ─────────────────────────────────────────────────────────

/** A message stored in a thread. */
export interface ThreadMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Stable renderer/main-process turn identity for one user->assistant cycle. */
  turnId?: string

  /** Set to true for error messages so the UI can render them with error styling. */
  isError?: boolean

  /** Extended-thinking / chain-of-thought content (collapsible in UI) */
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
  /** Ordered content blocks for interleaved text + tool call rendering. */
  contentBlocks?: MessageContentBlock[]

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
  /**
   * Messages cache in the renderer process.
   * NOT the authoritative source — the LangGraph checkpointer is.
   * Undefined means "not yet loaded from checkpointer".
   * An empty array means "loaded, but no messages" (e.g. a fresh local thread).
   */
  messages?: ThreadMessage[]
  /**
   * True once messages have been fetched from the checkpointer at least once.
   * Used by selectThread() to avoid redundant requests.
   */
  messagesLoaded?: boolean
  providerConfigId: string
  modelId: string
  domain: AiAgentDomain
  mode: AiAgentMode
  /** Current thinking level for LLM provider protocols that support it */
  thinkingLevel?: AiThinkingLevel
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
  defaultMode: AiAgentMode
  toolPermissions: Record<string, AiToolPermission>
}

// Default AI settings
export const DEFAULT_AI_SETTINGS: AiSettings = {
  providerConfigs: [],
  activeProviderConfigId: null,
  defaultMode: 'edit',
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

export const DEFAULT_THINKING_LEVEL: AiThinkingLevel = 'medium'

export const DEFAULT_AI_PROVIDER_PARAMETERS: Required<AiProviderParameters> = {
  temperature: 0.78,
  topP: 0.92,
  frequencyPenalty: 0.2,
  presencePenalty: 0.25,
}

export function normalizeThinkingLevel(level: string | undefined): AiThinkingLevel {
  if (level === 'low') return 'low'
  if (level === 'medium') return 'medium'
  if (level === 'high') return 'high'
  if (level === 'extra_high') return 'extra_high'
  return DEFAULT_THINKING_LEVEL
}

export function normalizeProviderParameters(parameters: AiProviderParameters | undefined): Required<AiProviderParameters> {
  return {
    temperature: parameters?.temperature ?? DEFAULT_AI_PROVIDER_PARAMETERS.temperature,
    topP: parameters?.topP ?? DEFAULT_AI_PROVIDER_PARAMETERS.topP,
    frequencyPenalty: parameters?.frequencyPenalty ?? DEFAULT_AI_PROVIDER_PARAMETERS.frequencyPenalty,
    presencePenalty: parameters?.presencePenalty ?? DEFAULT_AI_PROVIDER_PARAMETERS.presencePenalty,
  }
}

export function isOpenAIResponsesProtocol(type: AiProviderType, baseUrl?: string): boolean {
  if (type !== 'openai-compat') return false
  if (!baseUrl) return true
  return /api\.openai\.com/i.test(baseUrl)
}

export function getProviderParameterSupport(type: AiProviderType, baseUrl?: string): AiProviderParameterSupport {
  if (isOpenAIResponsesProtocol(type, baseUrl)) {
    return {
      temperature: true,
      topP: true,
      frequencyPenalty: false,
      presencePenalty: false,
    }
  }
  if (type === 'anthropic') {
    return {
      temperature: false,
      topP: true,
      frequencyPenalty: false,
      presencePenalty: false,
    }
  }
  return {
    temperature: true,
    topP: true,
    frequencyPenalty: true,
    presencePenalty: true,
  }
}

export function resolveAgentDomain(mode: AiAgentMode): AiAgentDomain {
  return mode === 'creative' ? 'creative' : 'editing'
}

export function getDefaultModeForDomain(domain: AiAgentDomain): AiAgentMode {
  return domain === 'creative' ? 'creative' : 'edit'
}

export function normalizeAgentMode(mode: string | undefined): AiAgentMode {
  if (mode === 'creative') return 'creative'
  if (mode === 'minimal') return 'minimal'
  if (mode === 'edit') return 'edit'
  return 'edit'
}

export function normalizeModeForDomain(
  mode: AiAgentMode | undefined,
  domain: AiAgentDomain,
): AiAgentMode {
  if (domain === 'creative') {
    return 'creative'
  }
  if (mode === 'minimal' || mode === 'edit') {
    return mode
  }
  return 'edit'
}

// ── Tool kind inference for Native LLM ────────────────────────────────────

export function inferToolKind(toolName: string): AiToolCallKind {
  const mapping: Record<string, AiToolCallKind> = {
    get_document_outline: 'read',
    get_section:          'read',
    get_blocks:           'read',
    get_block_context:    'read',
    search_blocks_in_document: 'search',
    search_sections_in_document: 'search',
    search_in_directory: 'search',
    edit_block:           'edit',
    insert_block:         'edit',
    delete_block:         'delete',
    replace_range:        'edit',
    create_document:      'edit',
    read_storybible:      'read',
    read_chapter:         'read',
    read_fragments:       'read',
    search_draft:         'search',
    get_session_diff:     'read',
    get_storybible_rebuild_signal: 'read',
    run_consistency_check: 'search',
    advise_directions: 'read',
    analyze_story_architecture: 'read',
    add_fragment:         'edit',
    patch_storybible:     'edit',
    confirm_writing_plan: 'edit',
    write_to_chapter:     'edit',
    replace_storybible_section: 'edit',
    rebuild_storybible:   'edit',
    // deepagents built-in tools
    execute:              'execute',
    read_file:            'read',
    list_directory:       'read',
    write_file:           'edit',
    edit_file:            'edit',
    ls:                   'read',
    glob:                 'search',
    grep:                 'search',
    task:                 'delegate',
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

export const CREATIVE_REVIEW_TOOLS = new Set([
  'confirm_writing_plan',
  'write_to_chapter',
  'replace_storybible_section',
  'rebuild_storybible',
])

/** Human-readable labels for BlockEditProposal types. */
export const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  edit:          '编辑块',
  insert:        '插入块',
  delete:        '删除块',
  replace_range: '替换范围',
}
