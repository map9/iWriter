/**
 * ThreadListQuery — thread metadata persistence layer.
 *
 * When SqliteSaver is available (backend === 'sqlite'), stores thread metadata
 * in a `thread_metadata` table in the same SQLite DB file as the checkpoints.
 * This avoids maintaining a separate electron-store.
 *
 * When backend === 'memory', falls back to an in-memory Map plus electron-store
 * for cross-session durability (same approach as the old ThreadPersistence but
 * metadata-only — no messages).
 */

import Store from 'electron-store'
import type { CheckpointerInstance } from '../checkpoint/CheckpointerFactory'
import type { AiThread, AiAgentProfile } from '../../../src/types/ai'

const MAX_THREADS = 100

export interface ThreadMeta {
  id: string
  title: string
  profile: AiAgentProfile
  modelId: string
  providerConfigId: string
  originFilePath: string | null
  createdAt: number
  updatedAt: number
  hasError?: boolean
  thinkMode?: string
}

interface FallbackSchema {
  threads: ThreadMeta[]
}

// ─── SQLite helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureTable(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_metadata (
      thread_id         TEXT PRIMARY KEY,
      title             TEXT NOT NULL DEFAULT 'New conversation',
      profile           TEXT NOT NULL,
      model_id          TEXT NOT NULL,
      provider_config_id TEXT NOT NULL,
      origin_file_path  TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      has_error         INTEGER DEFAULT 0,
      think_mode        TEXT
    )
  `)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMeta(row: any): ThreadMeta {
  return {
    id: row.thread_id,
    title: row.title,
    profile: row.profile as AiAgentProfile,
    modelId: row.model_id,
    providerConfigId: row.provider_config_id,
    originFilePath: row.origin_file_path ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasError: !!row.has_error,
    thinkMode: row.think_mode ?? undefined,
  }
}

// ─── Fallback (electron-store) helpers ───────────────────────────────────────

let _fallbackStore: Store<FallbackSchema> | null = null

function getFallbackStore(): Store<FallbackSchema> {
  if (!_fallbackStore) {
    _fallbackStore = new Store<FallbackSchema>({
      name: 'ai-thread-meta',
      defaults: { threads: [] },
    })
  }
  return _fallbackStore
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class ThreadListQuery {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any | null

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
          .all(MAX_THREADS)
        return rows.map(rowToMeta)
      }
      const store = getFallbackStore()
      const threads = store.get('threads') as ThreadMeta[] | undefined
      if (!Array.isArray(threads)) return []
      return threads.sort((a, b) => b.updatedAt - a.updatedAt)
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
          .get(id)
        return row ? rowToMeta(row) : null
      }
      return getFallbackStore().get('threads', []).find((t: ThreadMeta) => t.id === id) ?? null
    } catch {
      return null
    }
  }

  createMeta(params: {
    id?: string
    profile: AiAgentProfile
    modelId: string
    providerConfigId: string
    originFilePath?: string | null
    thinkMode?: string
  }): ThreadMeta {
    const now = Date.now()
    const meta: ThreadMeta = {
      id: params.id ?? `thread-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: 'New conversation',
      profile: params.profile,
      modelId: params.modelId,
      providerConfigId: params.providerConfigId,
      originFilePath: params.originFilePath ?? null,
      createdAt: now,
      updatedAt: now,
      thinkMode: params.thinkMode,
    }
    this._saveMeta(meta)
    return meta
  }

  updateMeta(
    id: string,
    updates: Partial<Pick<
      ThreadMeta,
      'title' | 'hasError' | 'updatedAt' | 'profile' | 'modelId' | 'providerConfigId' | 'thinkMode' | 'originFilePath'
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
      const store = getFallbackStore()
      const threads = (store.get('threads', []) as ThreadMeta[]).filter(t => t.id !== id)
      store.set('threads', threads)
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
      getFallbackStore().set('threads', [])
    } catch (err) {
      console.error('[ThreadListQuery] Failed to clear metas:', err)
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _saveMeta(meta: ThreadMeta): void {
    if (this.db) {
      this.db.prepare(`
        INSERT OR REPLACE INTO thread_metadata
          (thread_id, title, profile, model_id, provider_config_id,
           origin_file_path, created_at, updated_at, has_error, think_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        meta.id,
        meta.title,
        meta.profile,
        meta.modelId,
        meta.providerConfigId,
        meta.originFilePath,
        meta.createdAt,
        meta.updatedAt,
        meta.hasError ? 1 : 0,
        meta.thinkMode ?? null,
      )
      return
    }
    const store = getFallbackStore()
    const threads = store.get('threads', []) as ThreadMeta[]
    const idx = threads.findIndex(t => t.id === meta.id)
    if (idx >= 0) {
      threads[idx] = meta
    } else {
      threads.unshift(meta)
    }
    store.set('threads', threads.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_THREADS))
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
    profile: meta.profile,
    thinkMode: meta.thinkMode,
    hasError: meta.hasError,
    originFilePath: meta.originFilePath,
  }
}
