/**
 * SnapshotBroker — requests document snapshots from the renderer process via IPC.
 *
 * When a document tool needs to query the document, it calls requestSnapshot().
 * The broker sends 'ai:request-snapshot' to the renderer and waits for
 * 'ai:snapshot-response' with the matching requestId.
 */

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { SerializedSnapshot, SnapshotRequestEvent, SnapshotResponse } from '../ipc/protocol'

const SNAPSHOT_TIMEOUT_MS = 10_000 // 10 seconds

export class SnapshotBroker {
  private pendingRequests = new Map<
    string,
    { resolve: (s: SerializedSnapshot | null) => void; timer: NodeJS.Timeout }
  >()

  private listenerRegistered = false

  constructor(private getWebContents: () => WebContents | null) {
    this.registerResponseListener()
  }

  private registerResponseListener(): void {
    if (this.listenerRegistered) return
    this.listenerRegistered = true

    // Listen for renderer's snapshot responses
    ipcMain.on('ai:snapshot-response', (_, resp: SnapshotResponse) => {
      const pending = this.pendingRequests.get(resp.requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pendingRequests.delete(resp.requestId)
      pending.resolve(resp.snapshot)
    })
  }

  /**
   * Request a document snapshot from the renderer.
   *
   * @param filePath - null = active editor, string = specific disk file
   * @param tabId - when set, target the open tab with this FileTab.id (in-memory unsaved_new document)
   * @returns SerializedSnapshot, or null on timeout/error
   */
  async requestSnapshot(filePath: string | null, tabId?: string): Promise<SerializedSnapshot | null> {
    const webContents = this.getWebContents()
    if (!webContents) {
      console.warn('[SnapshotBroker] No webContents available')
      return null
    }

    const requestId = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          console.warn(`[SnapshotBroker] Snapshot request timed out (${requestId})`)
          resolve(null)
        }
      }, SNAPSHOT_TIMEOUT_MS)

      this.pendingRequests.set(requestId, { resolve, timer })

      const event: SnapshotRequestEvent = { requestId, filePath, tabId }
      webContents.send('ai:request-snapshot', event)
    })
  }
}
