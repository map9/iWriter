/**
 * CheckpointerFactory — creates a LangGraph checkpointer for the AgentEngine.
 *
 * Tries SqliteSaver (persistent, file-based) first.
 * Falls back to MemorySaver if better-sqlite3 is not available in the
 * current Electron ABI (common during development with newer Electron versions).
 */

import * as path from 'path'
import { app } from 'electron'
import { MemorySaver } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'

export type CheckpointerBackend = 'sqlite' | 'memory'

export interface CheckpointerInstance {
  checkpointer: BaseCheckpointSaver
  backend: CheckpointerBackend
  /** Raw better-sqlite3 Database instance, only set when backend === 'sqlite' */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: any
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
    saver.setup()

    // Access the underlying DB connection for thread-list queries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (saver as any).db ?? (saver as any).conn

    _instance = { checkpointer: saver, backend: 'sqlite', db }
    console.log('[CheckpointerFactory] Using SqliteSaver at', dbPath)
  } catch (err) {
    console.warn('[CheckpointerFactory] SqliteSaver unavailable, falling back to MemorySaver:', err)
    _instance = { checkpointer: new MemorySaver(), backend: 'memory' }
  }

  return _instance
}

/** Force-reset singleton (tests / config changes). */
export function resetCheckpointer(): void {
  _instance = null
}
