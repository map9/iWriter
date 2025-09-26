import {
  type NodeCheckRequest,
  type NodeSpellResult,
  type WorkerPoolConfig,
  type WorkerMessage,
  type WorkerResponse,
  type NodeTask,
  type SerializedNode,
  NodePriority
} from './nodeTypes'
import SpellCheckWorker from './workers/spellCheckWorker?worker'

export class SpellWorkerPool {
  private workers: Worker[] = []
  private availableWorkers: Worker[] = []
  private busyWorkers: Map<Worker, string> = new Map()

  // 统一的任务追踪系统
  private allTasks: Map<string, {
    task: NodeTask
    worker?: Worker
    status: 'queued' | 'running' | 'completed' | 'failed'
  }> = new Map()

  // 任务队列相关
  private taskQueue: NodeTask[] = []
  private isProcessingQueue: boolean = false

  private config: WorkerPoolConfig
  private isInitialized: boolean = false

  constructor(config: WorkerPoolConfig) {
    this.config = config
    // Don't await in constructor - use ensureInitialized() instead
    this.initializeWorkers().catch(error => {
      console.error('SpellWorkerPool: Failed to initialize workers:', error)
    })
  }

  async processNodesInParallel(nodes: NodeCheckRequest[]): Promise<NodeSpellResult[]> {
    await this.ensureInitialized()

    if (nodes.length === 0) return []

    // 创建任务并根据优先级排序
    const tasks = nodes
      .map(node => this.createNodeTask(node))
      .sort((a, b) => a.priority - b.priority)

    // 使用任务队列处理所有任务
    return await this.processTasksWithQueue(tasks)
  }

  private async processTasksWithQueue(tasks: NodeTask[]): Promise<NodeSpellResult[]> {
    // 为所有任务创建Promise并注册到统一追踪系统
    const taskPromises: Promise<NodeSpellResult>[] = tasks.map(task => {
      const promise = new Promise<NodeSpellResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const taskInfo = this.allTasks.get(task.id)
          if (taskInfo) {
            taskInfo.status = 'failed'
            this.allTasks.delete(task.id)
          }
          this.removeTaskFromQueue(task.id)
          reject(new Error(`Task ${task.id}, ${this.serializeNode(task.nodeRequest.node)?.textContent} timeout`))
        }, this.config.workerTimeout || 10000)

        // 将resolve/reject保存到task中
        task.resolve = (result: NodeSpellResult) => {
          clearTimeout(timeout)
          const taskInfo = this.allTasks.get(task.id)
          if (taskInfo) {
            taskInfo.status = 'completed'
          }
          resolve(result)
        }
        task.reject = (error: Error) => {
          clearTimeout(timeout)
          const taskInfo = this.allTasks.get(task.id)
          if (taskInfo) {
            taskInfo.status = 'failed'
          }
          reject(error)
        }
        task.timeout = timeout
      })

      // 注册任务到统一追踪系统
      this.allTasks.set(task.id, {
        task,
        status: 'queued'
      })

      return promise
    })

    // 将所有任务加入队列
    this.taskQueue.push(...tasks)

    // 开始处理队列
    this.processQueue()

    try {
      return await Promise.all(taskPromises)
    } catch (error) {
      console.error('SpellWorkerPool: Error in queue processing:', error)
      throw error
    }
  }

  private async initializeWorkers(): Promise<void> {
    const workerCount = this.config.maxWorkers

    // 创建Worker实例
    for (let i = 0; i < workerCount; i++) {
      try {
        const worker = new SpellCheckWorker()
        
        worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
          this.handleWorkerMessage(worker, event.data)
        })

        worker.addEventListener('error', (error) => {
          console.error('Worker error:', error.message, error.filename, error.lineno, error.colno)
          console.error(`SpellWorkerPool: Worker ${i} error:`, error)
          this.handleWorkerErrorEvent(worker, error)
        })

        this.workers.push(worker)
        this.availableWorkers.push(worker)
      } catch (error) {
        console.error(`SpellWorkerPool: Failed to create worker ${i}:`, error)
      }
    }

    // 初始化所有Workers
    await this.initializeAllWorkers()
  }

  private async initializeAllWorkers(): Promise<void> {
    const initPromises = this.workers.map(worker => this.initializeWorker(worker))

    try {
      await Promise.all(initPromises)
      this.isInitialized = true
    } catch (error) {
      console.error('SpellWorkerPool: Failed to initialize workers:', error)
      throw error
    }
  }

  private async initializeWorker(worker: Worker): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const taskId = `init_${Date.now()}_${Math.random()}`
      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'))
      }, 10000)

      // 使用 allTasks 存储初始化任务
      this.allTasks.set(taskId, {
        task: {
          id: taskId,
          // 初始化任务不需要 nodeRequest，填入空对象
          nodeRequest: {} as NodeCheckRequest,
          priority: NodePriority.LOW,
          estimatedTime: 0,
          resolve: () => {
            clearTimeout(timeout)
            resolve()
          },
          reject: (error: Error) => {
            clearTimeout(timeout)
            reject(error)
          },
          timeout
        },
        status: 'running',
        worker
      })

      const message: WorkerMessage = {
        type: 'INIT_ENGINE',
        taskId,
        payload: {
          engineConfig: this.config.engineConfig
        }
      }

      worker.postMessage(message)
    })
  }

  private createNodeTask(nodeRequest: NodeCheckRequest): NodeTask {
    return {
      id: `task_${nodeRequest.id}_${Date.now()}`,
      nodeRequest,
      priority: nodeRequest.priority,
      estimatedTime: this.estimateProcessingTime(nodeRequest.node.textContent?.length || 0)
    }
  }

  private estimateProcessingTime(textLength: number): number {
    // 基于文本长度估算处理时间（毫秒）
    return Math.max(50, Math.min(500, textLength * 0.1))
  }

  private processQueue(): void {
    if (this.isProcessingQueue) return

    this.isProcessingQueue = true
    this.processNextTasks()
  }

  private processNextTasks(): void {
    // 处理队列中的任务，直到所有Worker都被占用或队列为空
    while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.taskQueue.shift()!
      this.executeTask(task)
    }

    this.isProcessingQueue = false
  }

  private executeTask(task: NodeTask): void {
    const worker = this.availableWorkers.shift()
    if (!worker) {
      // 这种情况理论上不应该发生，但保险起见
      task.reject?.(new Error('No available workers'))
      const taskInfo = this.allTasks.get(task.id)
      if (taskInfo) {
        taskInfo.status = 'failed'
      }
      return
    }

    // 更新统一追踪系统
    const taskInfo = this.allTasks.get(task.id)
    if (taskInfo) {
      taskInfo.status = 'running'
      taskInfo.worker = worker
    }

    // 标记Worker为忙碌
    this.busyWorkers.set(worker, task.id)

    // 设置任务超时 (使用更短的超时时间，避免队列堵塞)
    if (task.timeout) {
      clearTimeout(task.timeout)
    }
    task.timeout = setTimeout(() => {
      this.handleTaskTimeout(worker, task)
    }, this.config.workerTimeout || 5000) // 减少到5秒

    // 发送任务到Worker
    const message: WorkerMessage = {
      type: 'CHECK_NODE',
      taskId: task.id,
      payload: {
        nodeData: this.serializeNode(task.nodeRequest.node),
        position: task.nodeRequest.position,
        nodeId: task.nodeRequest.id
      }
    }

    worker.postMessage(message)
  }

  private handleTaskTimeout(worker: Worker, task: NodeTask): void {
    console.error(`SpellWorkerPool: Task ${task.id} timeout`)
    this.releaseWorker(worker)
    task.reject?.(new Error(`Task ${task.id} timeout`))

    // 继续处理队列中的下一个任务
    this.processNextTasks()
  }

  private removeTaskFromQueue(taskId: string): void {
    const index = this.taskQueue.findIndex(task => task.id === taskId)
    if (index > -1) {
      const task = this.taskQueue[index]
      if (task?.timeout) {
        clearTimeout(task.timeout)
      }
      this.taskQueue.splice(index, 1)
    }
  }


  private handleWorkerMessage(worker: Worker, response: WorkerResponse): void {
    switch (response.type) {
      case 'ENGINE_READY':
        this.handleEngineReady(worker, response.taskId)
        break

      case 'NODE_RESULT':
        this.handleNodeResult(worker, response)
        break

      case 'ERROR':
        this.handleWorkerError(worker, response)
        break

      default:
        console.warn(`SpellWorkerPool: Unknown response type: ${response.type}`)
        this.releaseWorkerAndContinueQueue(worker)
    }
  }

  private handleEngineReady(worker: Worker, taskId: string): void {
    const taskInfo = this.allTasks.get(taskId)
    if (taskInfo) {
      this.allTasks.delete(taskId)
      this.releaseWorker(worker)
      // 调用任务的 resolve 方法
      taskInfo.task.resolve?.({} as NodeSpellResult)
    }
  }

  private handleNodeResult(worker: Worker, response: WorkerResponse): void {
    const taskId = response.taskId

    // 使用统一追踪系统查找任务
    const taskInfo = this.allTasks.get(taskId)

    if (taskInfo && taskInfo.task) {
      const task = taskInfo.task

      // 清理任务的超时器
      if (task.timeout) {
        clearTimeout(task.timeout)
      }

      // 更新任务状态
      taskInfo.status = 'completed'

      // 处理结果
      if (response.result) {
        task.resolve?.(response.result)
      } else {
        task.reject?.(new Error('No result received from worker'))
      }

      // 从追踪系统中移除已完成的任务
      this.allTasks.delete(taskId)
    } else {
      console.warn(`SpellWorkerPool: Received result for unknown task: ${taskId}`)
    }

    // 释放Worker并处理队列中的下一个任务
    this.releaseWorkerAndContinueQueue(worker)
  }

  private handleWorkerError(worker: Worker, response: WorkerResponse): void {
    const taskId = response.taskId
    const taskInfo = this.allTasks.get(taskId)

    const error = new Error(response.error || 'Unknown worker error')

    if (taskInfo && taskInfo.task) {
      const task = taskInfo.task

      // 清理超时器
      if (task.timeout) {
        clearTimeout(task.timeout)
      }

      // 更新状态并拒绝任务
      taskInfo.status = 'failed'
      task.reject?.(error)

      // 从追踪系统中移除
      this.allTasks.delete(taskId)
    }

    this.releaseWorkerAndContinueQueue(worker)
  }

  private releaseWorkerAndContinueQueue(worker: Worker): void {
    this.releaseWorker(worker)
    // 继续处理队列中的下一个任务
    this.processNextTasks()
  }

  private handleWorkerErrorEvent(worker: Worker, error: ErrorEvent): void {
    console.error('SpellWorkerPool: Worker error event:', error)

    // 清理与该Worker相关的任务
    const taskId = this.busyWorkers.get(worker)
    if (taskId) {
      // 查找对应的任务
      const queuedTask = this.taskQueue.find(task => task.id === taskId)
      const taskInfo = this.allTasks.get(taskId)

      const errorMessage = new Error(`Worker error: ${error.message}`)

      if (queuedTask) {
        if (queuedTask.timeout) {
          clearTimeout(queuedTask.timeout)
        }
        this.removeTaskFromQueue(taskId)
        queuedTask.reject?.(errorMessage)
      } else if (taskInfo) {
        this.allTasks.delete(taskId)
        taskInfo.task.reject?.(errorMessage)
      }
    }

    this.releaseWorkerAndContinueQueue(worker)
  }

  private releaseWorker(worker: Worker): void {
    this.busyWorkers.delete(worker)
    if (!this.availableWorkers.includes(worker)) {
      this.availableWorkers.push(worker)
    }
  }

  private serializeNode(node: any): SerializedNode {
    return {
      type: node.type.name,
      text: node.text,
      textContent: node.textContent,
      attrs: node.attrs,
      marks: node.marks?.map((mark: any) => ({
        type: mark.type.name,
        attrs: mark.attrs
      }))
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      // 等待初始化完成
      let retries = 50 // 最多等待5秒
      while (!this.isInitialized && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retries--
      }

      if (!this.isInitialized) {
        throw new Error('SpellWorkerPool: Initialization timeout')
      }
    }
  }

  getActiveWorkerCount(): number {
    return this.busyWorkers.size
  }

  async destroy(): Promise<void> {
    // 清理所有待处理的任务
    for (const [, taskInfo] of this.allTasks.entries()) {
      const task = taskInfo.task
      if (task.timeout) {
        clearTimeout(task.timeout)
      }
      task.reject?.(new Error('Worker pool is being destroyed'))
    }
    this.allTasks.clear()

    // 清理统一追踪系统中的所有任务
    for (const [, taskInfo] of this.allTasks.entries()) {
      const task = taskInfo.task
      if (task.timeout) {
        clearTimeout(task.timeout)
      }
      task.reject?.(new Error('Worker pool is being destroyed'))
    }
    this.allTasks.clear()

    // 清理任务队列
    this.taskQueue = []

    // 终止所有Workers
    const terminatePromises = this.workers.map(worker => {
      return new Promise<void>(resolve => {
        worker.postMessage({
          type: 'TERMINATE',
          taskId: `terminate_${Date.now()}`,
          payload: {}
        })

        // 给Worker一些时间优雅关闭
        setTimeout(() => {
          worker.terminate()
          resolve()
        }, 100)
      })
    })

    await Promise.all(terminatePromises)

    // 清理数据
    this.workers = []
    this.availableWorkers = []
    this.busyWorkers.clear()
    this.isInitialized = false
    this.isProcessingQueue = false
  }
}