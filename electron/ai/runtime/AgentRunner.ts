export class AgentRunner {
  private readonly controllers = new Map<string, AbortController>()
  private readonly tasks = new Map<string, Promise<void>>()

  begin(threadId: string): AbortController {
    const controller = new AbortController()
    this.controllers.set(threadId, controller)
    return controller
  }

  controller(threadId: string): AbortController | undefined {
    return this.controllers.get(threadId)
  }

  isActive(threadId: string): boolean {
    return this.controllers.has(threadId)
  }

  track(threadId: string, task: Promise<void>): void {
    this.tasks.set(threadId, task)
    task.finally(() => {
      if (this.tasks.get(threadId) === task) this.tasks.delete(threadId)
    }).catch(() => { /* run owner reports the error */ })
  }

  finish(threadId: string, controller?: AbortController): void {
    if (!controller || this.controllers.get(threadId) === controller) {
      this.controllers.delete(threadId)
    }
  }

  async cancel(threadId: string): Promise<void> {
    const controller = this.controllers.get(threadId)
    controller?.abort()

    const task = this.tasks.get(threadId)
    if (task) {
      try {
        await task
      } catch {
        // The owner reports run failures. Cancellation only waits for cleanup.
      }
    }

    this.finish(threadId, controller)
    if (this.tasks.get(threadId) === task) this.tasks.delete(threadId)
  }

  deleteThread(threadId: string): void {
    this.controllers.delete(threadId)
    this.tasks.delete(threadId)
  }

  clear(): void {
    this.controllers.clear()
    this.tasks.clear()
  }
}
