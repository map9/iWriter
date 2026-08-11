import { resolveWorkspacePath } from './RuntimePathResolver'

export interface RuntimeToolActionRequest {
  name: string
  args: Record<string, unknown>
}

const SCALAR_PATH_FIELDS: Record<string, string[]> = {
  write_file: ['file_path'],
  edit_file: ['file_path'],
  delete_file: ['file_path'],
  rename_file: ['file_path'],
  move_file: ['source_path', 'destination_path'],
  edit_block: ['file_path'],
  insert_block: ['file_path'],
  delete_block: ['file_path'],
  replace_range: ['file_path'],
  create_document: ['directory'],
  finalize_chapter: ['chapter'],
  import_manuscript: ['source_path', 'target_directory'],
}

const ARRAY_PATH_FIELDS: Record<string, string[]> = {
  confirm_writing_plan: ['target_files'],
}

function isVirtualPath(value: string): boolean {
  return value.startsWith('untitled:')
    || value.startsWith('/large_tool_results/')
    || value.startsWith('/conversation_history/')
}

function normalizePathValue(
  value: string,
  workspacePath: string | null,
  argumentName: string,
): { value: string; error?: string } {
  const trimmed = value.trim()
  if (isVirtualPath(trimmed)) return { value: trimmed }
  const resolved = resolveWorkspacePath(trimmed, workspacePath, argumentName)
  return resolved.ok
    ? { value: resolved.path }
    : { value: trimmed, error: resolved.error }
}

export function normalizeRuntimeToolPaths(
  actionRequests: RuntimeToolActionRequest[],
  workspacePath: string | null,
): { actionRequests: RuntimeToolActionRequest[]; errors: Record<number, string> } {
  const errors: Record<number, string> = {}
  const normalizedRequests = actionRequests.map((request, index) => {
    const args = { ...request.args }

    for (const field of SCALAR_PATH_FIELDS[request.name] ?? []) {
      const raw = args[field]
      if (typeof raw !== 'string') continue
      const normalized = normalizePathValue(raw, workspacePath, field)
      args[field] = normalized.value
      if (normalized.error) errors[index] ??= normalized.error
    }

    for (const field of ARRAY_PATH_FIELDS[request.name] ?? []) {
      const raw = args[field]
      if (!Array.isArray(raw)) continue
      args[field] = raw.map(value => {
        if (typeof value !== 'string') return value
        const normalized = normalizePathValue(value, workspacePath, field)
        if (normalized.error) errors[index] ??= normalized.error
        return normalized.value
      })
    }

    return { ...request, args }
  })

  return { actionRequests: normalizedRequests, errors }
}
