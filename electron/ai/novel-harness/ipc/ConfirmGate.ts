import type { NovelConfirmRequest, NovelConfirmResponse, NovelConfirmType } from '../../ipc/protocol'
import { RendererEventBridge } from '../../ipc/RendererEventBridge'

const DEFAULT_CONFIRM_TIMEOUT_MS = 120_000

interface PendingConfirm {
  type: NovelConfirmType
  resolve: (resp: NovelConfirmResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export class ConfirmGate {
  private pending = new Map<string, PendingConfirm>()

  constructor(
    private readonly rendererEventBridge: RendererEventBridge,
    private readonly timeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS,
  ) {}

  waitForConfirm(request: NovelConfirmRequest): Promise<NovelConfirmResponse> {
    if (this.pending.has(request.sessionId)) {
      return Promise.reject(new Error(`Novel confirm already pending: ${request.sessionId}`))
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.sessionId)
        reject(new Error(`Novel confirm timed out: ${request.sessionId}`))
      }, this.timeoutMs)

      this.pending.set(request.sessionId, {
        type: request.type,
        resolve,
        reject,
        timer,
      })

      this.rendererEventBridge.sendNovelConfirm(request)
    })
  }

  resolve(resp: NovelConfirmResponse): boolean {
    const pending = this.pending.get(resp.sessionId)
    if (!pending || pending.type !== resp.type) return false

    clearTimeout(pending.timer)
    this.pending.delete(resp.sessionId)
    pending.resolve(resp)
    return true
  }

  cancelAll(reason = 'Novel confirm gate disposed'): void {
    for (const [sessionId, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`${reason}: ${sessionId}`))
    }
    this.pending.clear()
  }
}
