import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type {
  EditorStateRequestEvent,
  EditorStateResponse,
  EditorStateSnapshot,
} from '../ipc/protocol'

const EDITOR_STATE_TIMEOUT_MS = 10_000

export class EditorStateBroker {
  private pendingRequests = new Map<
    string,
    { resolve: (state: EditorStateSnapshot | null) => void; timer: NodeJS.Timeout }
  >()

  constructor(private readonly getWebContents: () => WebContents | null) {
    ipcMain.on('ai:editor-state-response', (_, response: EditorStateResponse) => {
      const pending = this.pendingRequests.get(response.requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pendingRequests.delete(response.requestId)
      pending.resolve(response.state)
    })
  }

  async requestEditorState(): Promise<EditorStateSnapshot | null> {
    const webContents = this.getWebContents()
    if (!webContents) return null

    const requestId = `editor-state-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (!this.pendingRequests.has(requestId)) return
        this.pendingRequests.delete(requestId)
        resolve(null)
      }, EDITOR_STATE_TIMEOUT_MS)

      this.pendingRequests.set(requestId, { resolve, timer })
      const event: EditorStateRequestEvent = { requestId }
      webContents.send('ai:request-editor-state', event)
    })
  }
}
