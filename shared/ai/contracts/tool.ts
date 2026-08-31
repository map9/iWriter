export type AiToolCallKind =
  | 'read' | 'edit' | 'delete' | 'search'
  | 'execute' | 'delegate' | 'other'

export type AiToolDetailType =
  | 'outline'
  | 'section'
  | 'sections'
  | 'blocks'
  | 'block_context'
  | 'search_sections'
  | 'workspace_search'
  | 'todo_list'
  | 'subagent_task'
  | 'pdf_outline'
  | 'pdf_pages'
  | 'web_search'
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

export interface AiToolCall {
  id: string
  name: string
  kind: AiToolCallKind
  title: string
  paramsText?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected'
  file?: { path: string; startLine?: number; endLine?: number }
  arguments: Record<string, unknown>
  result?: string
  isError?: boolean
  isInvalid?: boolean
  display?: AiToolDisplayMeta
}

export interface AiToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

export function inferToolKind(toolName: string): AiToolCallKind {
  const mapping: Record<string, AiToolCallKind> = {
    get_editor_state: 'read',
    get_document_outline: 'read',
    get_section: 'read',
    get_sections: 'read',
    get_blocks: 'read',
    get_block_context: 'read',
    search_blocks_in_document: 'search',
    search_sections_in_document: 'search',
    search_in_directory: 'search',
    edit_block: 'edit',
    insert_block: 'edit',
    delete_block: 'delete',
    replace_range: 'edit',
    create_document: 'edit',
    git: 'execute',
    confirm_writing_plan: 'edit',
    finalize_chapter: 'edit',
    find_references: 'read',
    import_manuscript: 'edit',
    delete: 'delete',
    delete_file: 'delete',
    rename_file: 'edit',
    move_file: 'edit',
    get_pdf_outline: 'read',
    get_pdf_pages: 'read',
    web_search: 'search',
    fetch_url: 'read',
    execute: 'execute',
    read_file: 'read',
    write_file: 'edit',
    edit_file: 'edit',
    ls: 'read',
    glob: 'search',
    grep: 'search',
    task: 'delegate',
    write_todos: 'edit',
  }
  return mapping[toolName] ?? 'other'
}

export const BLOCK_EDIT_TOOLS = new Set([
  'edit_block',
  'insert_block',
  'delete_block',
  'replace_range',
  'create_document',
])

export const CREATIVE_REVIEW_TOOLS = new Set([
  'confirm_writing_plan',
  'finalize_chapter',
  'git',
  'import_manuscript',
])

export const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  edit: '编辑块',
  insert: '插入块',
  delete: '删除块',
  replace_range: '替换范围',
}
