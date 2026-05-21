/**
 * CheckpointerFactory — creates a LangGraph checkpointer for the AgentEngine.
 *
 * Tries SqliteSaver (persistent, file-based) first.
 * Falls back to MemorySaver only in development, where native addon rebuilds
 * can legitimately lag behind the current Electron ABI.
 *
 * In packaged builds we fail fast instead of silently degrading, because
 * non-persistent checkpoints create misleading "history exists but messages
 * are gone" behavior after restart.
 */

import * as path from 'path'
import { app } from 'electron'
import { MemorySaver } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { Database } from 'better-sqlite3'

export type CheckpointerBackend = 'sqlite' | 'memory'

export interface CheckpointerInstance {
  checkpointer: BaseCheckpointSaver
  backend: CheckpointerBackend
  /** Raw better-sqlite3 Database instance, only set when backend === 'sqlite' */
  db: Database | null
}

let _instance: CheckpointerInstance | null = null

export async function getCheckpointer(): Promise<CheckpointerInstance> {
  if (_instance) return _instance

  const dbPath = path.join(app.getPath('userData'), 'ai-checkpoint.db')

  try {
    const { SqliteSaver } = await import('@langchain/langgraph-checkpoint-sqlite')
    // SqliteSaver.fromConnString creates the DB file automatically
    const saver = SqliteSaver.fromConnString(dbPath)

    // Verify it actually works (native addon may fail inside Electron)
    ;(saver as unknown as { setup: () => void }).setup()

    // Access the underlying DB connection for thread-list queries.
    // SqliteSaver does not expose a public accessor; we cast through unknown to
    // keep the `any` surface minimal. If the field name changes in a future
    // upgrade, TypeScript will catch it here (unlike a bare `as any`).
    const rawSaver = saver as unknown as { db?: Database; conn?: Database }
    const db = rawSaver.db ?? rawSaver.conn ?? null

    _instance = { checkpointer: saver, backend: 'sqlite', db }
  } catch (err) {
    const details = formatSqliteInitError(err)
    const payload = {
      dbPath,
      electron: process.versions.electron,
      node: process.versions.node,
      modules: process.versions.modules,
      packaged: app.isPackaged,
      ...details,
    }

    if (!allowMemoryFallback()) {
      console.error('[CheckpointerFactory] SqliteSaver initialization failed in packaged app:', payload)
      throw new Error([
        'Persistent AI checkpoints are unavailable because SqliteSaver failed to initialize.',
        `Reason: ${details.message ?? 'Unknown error'}`,
        'Packaged builds do not allow fallback to MemorySaver.',
      ].join(' '))
    }

    console.warn(
      '[CheckpointerFactory] SqliteSaver unavailable, falling back to MemorySaver:',
      payload,
    )
    _instance = { checkpointer: new MemorySaver(), backend: 'memory', db: null }
  }

  return _instance
}

/** Force-reset singleton (tests / config changes). */
export function resetCheckpointer(): void {
  _instance = null
}

function formatSqliteInitError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { error: String(err) }
  }

  const base: Record<string, unknown> = {
    name: err.name,
    message: err.message,
  }

  const maybeNodeError = err as Error & {
    code?: string
    errno?: number
    path?: string
  }

  if (maybeNodeError.code) {
    base.code = maybeNodeError.code
  }
  if (typeof maybeNodeError.errno === 'number') {
    base.errno = maybeNodeError.errno
  }
  if (maybeNodeError.path) {
    base.path = maybeNodeError.path
  }

  if (err.message.includes('better_sqlite3.node') || err.message.includes('NODE_MODULE_VERSION')) {
    base.hint = 'Native better-sqlite3 addon failed to load. Ensure Electron main build externalizes better-sqlite3 and @langchain/langgraph-checkpoint-sqlite, then rebuild the native module for the current Electron version.'
  }

  return base
}

function allowMemoryFallback(): boolean {
  if (process.env.IWRITER_ALLOW_MEMORY_CHECKPOINTER === '1') {
    return true
  }
  return !app.isPackaged
}
