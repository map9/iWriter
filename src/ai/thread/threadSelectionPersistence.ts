import type { AiThread } from '@shared/ai/contracts'
import {
  normalizeAgentMode,
  normalizeThinkingLevel,
  resolveAgentDomain,
} from '@shared/ai/contracts'
import { areWorkspacePathsEqual, normalizeWorkspaceBinding } from '@shared/workspace/path'

const STORAGE_KEY = 'iwriter-ai-active-thread-selection'
const STORAGE_VERSION = 1

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface DraftThreadSnapshot {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  providerConfigId: string
  modelId: string
  mode: AiThread['mode']
  thinkingLevel?: AiThread['thinkingLevel']
  workspacePath: string | null
}

export type ActiveThreadSelection =
  | { version: typeof STORAGE_VERSION; kind: 'persisted'; threadId: string }
  | { version: typeof STORAGE_VERSION; kind: 'draft'; thread: DraftThreadSnapshot }

export interface InitialThreadSelection {
  threads: AiThread[]
  activeThreadId: string | null
  localDraftThreadId: string | null
}

function browserStorage(): StorageLike | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function parseDraftThread(value: unknown): DraftThreadSnapshot | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string'
    || typeof value.title !== 'string'
    || typeof value.createdAt !== 'number'
    || typeof value.updatedAt !== 'number'
    || typeof value.providerConfigId !== 'string'
    || typeof value.modelId !== 'string'
    || typeof value.mode !== 'string'
    || (value.thinkingLevel !== undefined && typeof value.thinkingLevel !== 'string')
    || (value.workspacePath !== null && typeof value.workspacePath !== 'string')
  ) return null

  const mode = normalizeAgentMode(value.mode)
  return {
    id: value.id,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    providerConfigId: value.providerConfigId,
    modelId: value.modelId,
    mode,
    thinkingLevel: value.thinkingLevel === undefined
      ? undefined
      : normalizeThinkingLevel(value.thinkingLevel),
    workspacePath: normalizeWorkspaceBinding(value.workspacePath),
  }
}

export function loadActiveThreadSelection(
  storage: StorageLike | null = browserStorage(),
): ActiveThreadSelection | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return null
    if (parsed.kind === 'persisted' && typeof parsed.threadId === 'string') {
      return { version: STORAGE_VERSION, kind: 'persisted', threadId: parsed.threadId }
    }
    if (parsed.kind === 'draft') {
      const thread = parseDraftThread(parsed.thread)
      return thread ? { version: STORAGE_VERSION, kind: 'draft', thread } : null
    }
    return null
  } catch {
    return null
  }
}

export function saveActiveThreadSelection(
  thread: AiThread,
  isDraft: boolean,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return
  try {
    const selection: ActiveThreadSelection = isDraft
      ? {
          version: STORAGE_VERSION,
          kind: 'draft',
          thread: {
            id: thread.id,
            title: thread.title,
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
            providerConfigId: thread.providerConfigId,
            modelId: thread.modelId,
            mode: thread.mode,
            thinkingLevel: thread.thinkingLevel,
            workspacePath: normalizeWorkspaceBinding(thread.workspacePath),
          },
        }
      : { version: STORAGE_VERSION, kind: 'persisted', threadId: thread.id }
    storage.setItem(STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Selection persistence is best-effort and must never block thread changes.
  }
}

export function clearActiveThreadSelection(
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Selection persistence is best-effort and must never block thread changes.
  }
}

export function resolveInitialThreadSelection(
  selection: ActiveThreadSelection | null,
  backendThreads: AiThread[],
  currentWorkspacePath: string | null,
): InitialThreadSelection {
  if (!selection) {
    return { threads: backendThreads, activeThreadId: null, localDraftThreadId: null }
  }

  if (selection.kind === 'persisted') {
    const selected = backendThreads.find(thread =>
      thread.id === selection.threadId
      && areWorkspacePathsEqual(thread.workspacePath, currentWorkspacePath),
    )
    return {
      threads: backendThreads,
      activeThreadId: selected?.id ?? null,
      localDraftThreadId: null,
    }
  }

  const persistedCopy = backendThreads.find(thread => thread.id === selection.thread.id)
  if (persistedCopy) {
    return {
      threads: backendThreads,
      activeThreadId: areWorkspacePathsEqual(persistedCopy.workspacePath, currentWorkspacePath)
        ? persistedCopy.id
        : null,
      localDraftThreadId: null,
    }
  }

  if (!areWorkspacePathsEqual(selection.thread.workspacePath, currentWorkspacePath)) {
    return { threads: backendThreads, activeThreadId: null, localDraftThreadId: null }
  }

  const mode = normalizeAgentMode(selection.thread.mode)
  const draft: AiThread = {
    ...selection.thread,
    domain: resolveAgentDomain(mode),
    mode,
    messages: [],
    messagesLoaded: false,
  }
  return {
    threads: [draft, ...backendThreads],
    activeThreadId: draft.id,
    localDraftThreadId: draft.id,
  }
}
