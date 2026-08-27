/**
 * ThreadListQuery — thread metadata persistence layer.
 *
 * When SqliteSaver is available (backend === 'sqlite'), stores thread metadata
 * in a `thread_metadata` table in the same SQLite DB file as the checkpoints.
 * This avoids maintaining a separate electron-store.
 *
 * When backend === 'memory', metadata is kept in-memory only.
 * We intentionally do NOT persist thread metadata across app restarts in this
 * mode, because the checkpointer messages themselves are not durable either.
 * Persisting only the thread list creates "ghost sessions" that reopen with
 * 0 messages after restart.
 */

import type { Database } from 'better-sqlite3'
import type { CheckpointerInstance } from '../checkpoint/CheckpointerFactory'
import type {
  AiThread,
  AiAgentMode,
  AiAgentDomain,
  AiThinkingLevel,
  ThreadRuntimeSelection,
  TurnRuntimeSnapshot,
} from '../../../shared/ai/contracts'
import { normalizeAgentMode, normalizeThinkingLevel } from '../../../shared/ai/contracts'

const MAX_THREADS = 100

export interface ThreadMeta {
  id: string
  title: string
  domain: AiAgentDomain
  mode: AiAgentMode
  modelId: string
  providerConfigId: string
  createdAt: number
  updatedAt: number
  hasError?: boolean
  thinkingLevel?: AiThinkingLevel
  workspacePath?: string | null
  activeRuntime?: TurnRuntimeSnapshot
  pendingRuntime?: ThreadRuntimeSelection
}

// ─── SQLite helpers ──────────────────────────────────────────────────────────

/** Mirror of the thread_metadata table columns returned by SELECT *. */
interface RawThreadMetaRow {
  thread_id: string
  title: string
  domain: string
  mode: string
  model_id: string
  provider_config_id: string
  created_at: number
  updated_at: number
  has_error: number   // SQLite stores boolean as 0/1
  thinking_level: string | null
  workspace_path: string | null
  active_runtime_json: string | null
  pending_runtime_json: string | null
}

function ensureTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_metadata (
      thread_id         TEXT PRIMARY KEY,
      title             TEXT NOT NULL DEFAULT 'New conversation',
      domain            TEXT NOT NULL DEFAULT 'editing',
      mode              TEXT NOT NULL,
      model_id          TEXT NOT NULL,
      provider_config_id TEXT NOT NULL,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      has_error         INTEGER DEFAULT 0,
      thinking_level        TEXT,
      workspace_path        TEXT,
      active_runtime_json   TEXT,
      pending_runtime_json  TEXT
    )
  `)
  try {
    const cols = (db.prepare('PRAGMA table_info(thread_metadata)').all() as Array<{ name: string }>)
      .map(col => col.name)
    if (!cols.includes('domain')) {
      db.exec(`ALTER TABLE thread_metadata ADD COLUMN domain TEXT NOT NULL DEFAULT 'editing'`)
    }
    if (!cols.includes('thinking_level')) {
      db.exec('ALTER TABLE thread_metadata ADD COLUMN thinking_level TEXT')
    }
    if (!cols.includes('workspace_path')) {
      db.exec('ALTER TABLE thread_metadata ADD COLUMN workspace_path TEXT')
    }
    if (!cols.includes('active_runtime_json')) {
      db.exec('ALTER TABLE thread_metadata ADD COLUMN active_runtime_json TEXT')
    }
    if (!cols.includes('pending_runtime_json')) {
      db.exec('ALTER TABLE thread_metadata ADD COLUMN pending_runtime_json TEXT')
    }
  } catch {
    // ignore migration errors; CREATE TABLE path already covers new installs
  }
}

function parseJsonObject<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as T
      : undefined
  } catch {
    return undefined
  }
}

function rowToMeta(row: RawThreadMetaRow): ThreadMeta {
  return {
    id: row.thread_id,
    title: row.title,
    domain: (row.domain ?? 'editing') as AiAgentDomain,
    mode: normalizeAgentMode(row.mode) as AiAgentMode,
    modelId: row.model_id,
    providerConfigId: row.provider_config_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasError: !!row.has_error,
    thinkingLevel: row.thinking_level ? normalizeThinkingLevel(row.thinking_level) : undefined,
    workspacePath: row.workspace_path ?? null,
    activeRuntime: parseJsonObject<TurnRuntimeSnapshot>(row.active_runtime_json),
    pendingRuntime: parseJsonObject<ThreadRuntimeSelection>(row.pending_runtime_json),
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class ThreadListQuery {
  private db: Database | null
  private memoryMetas = new Map<string, ThreadMeta>()

  constructor(ci: CheckpointerInstance) {
    if (ci.backend === 'sqlite' && ci.db) {
      this.db = ci.db
      ensureTable(this.db)
    } else {
      this.db = null
    }
  }

  loadMetas(): ThreadMeta[] {
    try {
      if (this.db) {
        const rows = this.db
          .prepare('SELECT * FROM thread_metadata ORDER BY updated_at DESC LIMIT ?')
          .all(MAX_THREADS) as RawThreadMetaRow[]
        return rows.map(rowToMeta)
      }
      return Array.from(this.memoryMetas.values()).sort((a, b) => b.updatedAt - a.updatedAt)
    } catch (err) {
      console.error('[ThreadListQuery] Failed to load metas:', err)
      return []
    }
  }

  getMeta(id: string): ThreadMeta | null {
    try {
      if (this.db) {
        const row = this.db
          .prepare('SELECT * FROM thread_metadata WHERE thread_id = ?')
          .get(id) as RawThreadMetaRow | undefined
        return row ? rowToMeta(row) : null
      }
      return this.memoryMetas.get(id) ?? null
    } catch {
      return null
    }
  }

  createMeta(params: {
    id?: string
    domain: AiAgentDomain
    mode: AiAgentMode
    modelId: string
    providerConfigId: string
    thinkingLevel?: AiThinkingLevel
    workspacePath?: string | null
    activeRuntime?: TurnRuntimeSnapshot
    pendingRuntime?: ThreadRuntimeSelection
  }): ThreadMeta {
    const now = Date.now()
    const meta: ThreadMeta = {
      id: params.id ?? `thread-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: 'New conversation',
      domain: params.domain,
      mode: params.mode,
      modelId: params.modelId,
      providerConfigId: params.providerConfigId,
      createdAt: now,
      updatedAt: now,
      thinkingLevel: params.thinkingLevel,
      workspacePath: params.workspacePath ?? null,
      activeRuntime: params.activeRuntime,
      pendingRuntime: params.pendingRuntime,
    }
    this._saveMeta(meta)
    return meta
  }

  updateMeta(
    id: string,
    updates: Partial<Pick<
      ThreadMeta,
      'title' | 'hasError' | 'updatedAt' | 'domain' | 'mode' | 'modelId' | 'providerConfigId' | 'thinkingLevel' | 'workspacePath' | 'activeRuntime' | 'pendingRuntime'
    >>,
  ): void {
    const meta = this.getMeta(id)
    if (!meta) return
    Object.assign(meta, updates, { updatedAt: updates.updatedAt ?? Date.now() })
    this._saveMeta(meta)
  }

  setTitle(id: string, title: string): void {
    this.updateMeta(id, { title: title.slice(0, 80) })
  }

  deleteMeta(id: string): void {
    try {
      if (this.db) {
        this.db.prepare('DELETE FROM thread_metadata WHERE thread_id = ?').run(id)
        return
      }
      this.memoryMetas.delete(id)
    } catch (err) {
      console.error('[ThreadListQuery] Failed to delete meta:', err)
    }
  }

  clearMetas(): void {
    try {
      if (this.db) {
        this.db.prepare('DELETE FROM thread_metadata').run()
        return
      }
      this.memoryMetas.clear()
    } catch (err) {
      console.error('[ThreadListQuery] Failed to clear metas:', err)
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _saveMeta(meta: ThreadMeta): void {
    if (this.db) {
      this.db.prepare(`
        INSERT OR REPLACE INTO thread_metadata
          (thread_id, title, domain, mode, model_id, provider_config_id,
           created_at, updated_at, has_error, thinking_level, workspace_path,
           active_runtime_json, pending_runtime_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        meta.id,
        meta.title,
        meta.domain,
        meta.mode,
        meta.modelId,
        meta.providerConfigId,
        meta.createdAt,
        meta.updatedAt,
        meta.hasError ? 1 : 0,
        meta.thinkingLevel ?? null,
        meta.workspacePath ?? null,
        meta.activeRuntime ? JSON.stringify(meta.activeRuntime) : null,
        meta.pendingRuntime ? JSON.stringify(meta.pendingRuntime) : null,
      )
      return
    }
    this.memoryMetas.set(meta.id, meta)
    const metas = Array.from(this.memoryMetas.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_THREADS)
    this.memoryMetas = new Map(metas.map(item => [item.id, item]))
  }
}

// ─── Convert ThreadMeta → AiThread (backward compat for IPC layer) ───────────

/** Converts ThreadMeta to AiThread with empty messages for the IPC layer.
 * Messages are no longer stored in the renderer — they are managed by checkpointer. */
export function metaToAiThread(meta: ThreadMeta): AiThread {
  return {
    id: meta.id,
    title: meta.title,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    messages: [],           // messages live in checkpointer now
    providerConfigId: meta.providerConfigId,
    modelId: meta.modelId,
    domain: meta.domain,
    mode: meta.mode,
    thinkingLevel: meta.thinkingLevel,
    workspacePath: meta.workspacePath ?? null,
    activeRuntime: meta.activeRuntime,
    pendingRuntime: meta.pendingRuntime,
    hasError: meta.hasError,
  }
}
