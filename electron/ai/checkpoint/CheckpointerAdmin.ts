/**
 * CheckpointerAdmin — typed admin operations for the LangGraph checkpointer.
 *
 * Encapsulates SqliteSaver internal DB access (currently requires `(saver as any).db`
 * casts because @langchain/langgraph-checkpoint-sqlite does not expose a public
 * delete API). Centralizing the cast here keeps `any` confined to this file
 * and gives the rest of the codebase a typed surface.
 *
 * Scope (per refactor.md Phase 4 B4):
 *   - deleteThread(threadId): remove a thread's checkpoints + writes rows
 *   - clearAll(): drop all checkpoint + writes rows
 *   - stripRespondMarkers(threadId): remove local HITL respond markers from persisted rows
 *
 * NOT in scope (intentional):
 *   - getThreadMessages / getCurrentSessionTokens: those read public
 *     checkpoint tuple fields via `checkpointer.get()`, not internal storage
 *   - thread_metadata table: owned by ThreadListQuery
 */
import type { Database } from 'better-sqlite3'
import type { CheckpointerInstance } from './CheckpointerFactory'
import { RESPOND_MARKER } from '../runtime/HumanRespondMessageMiddleware'

export class CheckpointerAdmin {
  private readonly db: Database | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly serde: any

  constructor(instance: CheckpointerInstance) {
    this.db = instance.backend === 'sqlite' && instance.db ? instance.db : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.serde = (instance.checkpointer as any).serde ?? null
  }

  /** Delete all checkpoint + writes rows for a single thread. No-op for MemorySaver. */
  deleteThread(threadId: string): void {
    if (!this.db) return
    try {
      this.db.transaction(() => {
        this.db!.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(threadId)
        this.db!.prepare('DELETE FROM writes WHERE thread_id = ?').run(threadId)
      })()
    } catch (err) {
      console.warn(`[CheckpointerAdmin] deleteThread(${threadId}) failed:`, err)
    }
  }

  private stripRespondMarkersFromValue(value: unknown): boolean {
    const seen = new WeakSet<object>()

    const visit = (node: unknown): [unknown, boolean] => {
      if (typeof node === 'string') {
        return node.startsWith(RESPOND_MARKER)
          ? [node.slice(RESPOND_MARKER.length), true]
          : [node, false]
      }

      if (!node || typeof node !== 'object') return [node, false]
      if (seen.has(node)) return [node, false]
      seen.add(node)

      let changed = false
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          const [next, childChanged] = visit(node[i])
          if (childChanged) {
            node[i] = next
            changed = true
          }
        }
        return [node, changed]
      }

      const record = node as Record<string, unknown>
      for (const key of Object.keys(record)) {
        const [next, childChanged] = visit(record[key])
        if (childChanged) {
          record[key] = next
          changed = true
        }
      }
      return [node, changed]
    }

    return visit(value)[1]
  }

  /**
   * Remove RESPOND_MARKER prefix from ToolMessages stored in this thread's checkpoint.
   * Called asynchronously after a 'responded' HITL decision so checkpoint data stays clean.
   * The HumanRespondMessageMiddleware already strips the marker before every LLM call;
   * this is a housekeeping step so the raw checkpoint rows don't accumulate the marker.
   */
  async stripRespondMarkers(threadId: string): Promise<void> {
    if (!this.db || !this.serde) return
    try {
      const rows = this.db
        .prepare('SELECT thread_id, checkpoint_ns, checkpoint_id, type, checkpoint FROM checkpoints WHERE thread_id = ?')
        .all(threadId) as Array<{ thread_id: string; checkpoint_ns: string; checkpoint_id: string; type: string; checkpoint: Buffer }>

      for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const checkpoint: any = await this.serde.loadsTyped(row.type ?? 'json', row.checkpoint)
        if (!this.stripRespondMarkersFromValue(checkpoint)) continue

        const [type, serialized] = await this.serde.dumpsTyped(checkpoint)
        this.db
          .prepare('UPDATE checkpoints SET type = ?, checkpoint = ? WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?')
          .run(type, Buffer.from(serialized), row.thread_id, row.checkpoint_ns, row.checkpoint_id)
      }

      const writeRows = this.db
        .prepare('SELECT thread_id, checkpoint_ns, checkpoint_id, task_id, idx, type, value FROM writes WHERE thread_id = ?')
        .all(threadId) as Array<{
          thread_id: string
          checkpoint_ns: string
          checkpoint_id: string
          task_id: string
          idx: number
          type: string
          value: Buffer
        }>

      for (const row of writeRows) {
        const value = await this.serde.loadsTyped(row.type ?? 'json', row.value)
        if (!this.stripRespondMarkersFromValue(value)) continue

        const [type, serialized] = await this.serde.dumpsTyped(value)
        this.db
          .prepare(`
            UPDATE writes
            SET type = ?, value = ?
            WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? AND task_id = ? AND idx = ?
          `)
          .run(type, Buffer.from(serialized), row.thread_id, row.checkpoint_ns, row.checkpoint_id, row.task_id, row.idx)
      }
    } catch (err) {
      console.warn(`[CheckpointerAdmin] stripRespondMarkers(${threadId}) failed:`, err)
    }
  }

  /** Drop all checkpoint + writes rows. No-op for MemorySaver. */
  clearAll(): void {
    if (!this.db) return
    try {
      this.db.transaction(() => {
        this.db!.prepare('DELETE FROM checkpoints').run()
        this.db!.prepare('DELETE FROM writes').run()
      })()
    } catch (err) {
      console.warn('[CheckpointerAdmin] clearAll failed:', err)
    }
  }
}
