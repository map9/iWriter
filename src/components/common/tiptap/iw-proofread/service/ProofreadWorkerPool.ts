import workerpool from 'workerpool'
// 使用 Vite 的 ?worker&url 语法获取 Worker URL
import WorkerURL from './workers/proofreadCheckWorker.ts?worker&url'
import type {
  NodeProofreadRequest,
  NodeProofreadResult,
  WorkerPoolConfig,
} from './types'

export class ProofreadWorkerPool {
  private pool: workerpool.Pool
  private config: WorkerPoolConfig
  private initPromise: Promise<void> | null = null
  private initState: 'idle' | 'pending' | 'success' | 'failed' = 'pending'
  private initError: Error | null = null

  constructor(config: WorkerPoolConfig) {
    this.config = config

    try {
      // 使用正确的 Vite workerpool 配置
      this.pool = workerpool.pool(WorkerURL, {
        maxWorkers: config.maxWorkers,
        workerTerminateTimeout: config.workerTimeout || 5000,
        workerOpts: {
          // 开发模式使用 module worker，生产模式使用 classic worker
          type: import.meta.env.PROD ? undefined : "module"
        }
      })

      // 初始化引擎
      this.initPromise = this.initializeEngine()
      .then(() => { this.initState = 'success' })
      .catch(err => {
        this.initState = 'failed'
        this.initError = err
        throw err
      })
    } catch (error) {
      console.error('[ProofreadWorkerPool] Failed to create pool:', error)
      throw error
    }
  }

  private async initializeEngine(): Promise<void> {
    try {
      // 在第一个 worker 中初始化引擎，直接传递完整的引擎配置
      await this.pool.exec('initEngine', [this.config.engineConfig])
    } catch (error) {
      console.error('[ProofreadWorkerPool] Engine initialization failed:', error)
      throw error
    }
  }
  
  private async ensureInitialized(): Promise<void> {
    switch (this.initState) {
      case 'success':
        return
      case 'failed':
        throw this.initError!
      case 'pending':
        await this.initPromise
        break
    }
  }

  async processNodesInParallel(nodes: NodeProofreadRequest[]): Promise<NodeProofreadResult[]> {
    await this.ensureInitialized()

    if (nodes.length === 0) return []

    try {
      // 准备数据
      const nodeData = nodes.map(node => ({
        id: node.id,
        text: node.nodeContent
      }))

      // 使用 workerpool 批量处理
      const results = await this.pool.exec('batchProofread', [nodeData])

      return results
    } catch (error) {
      console.warn('[ProofreadWorkerPool] Error processing nodes:', error)

      // 返回空结果而不是抛出异常
      return nodes.map(node => ({
        id: node.id,
        errors: [],
        checkedAt: Date.now(),
      }))
    }
  }

  getActiveWorkerCount(): number {
    // workerpool 没有直接暴露活跃 worker 数量，返回总数
    return this.config.maxWorkers
  }

  async destroy(): Promise<void> {
    try {
      await this.pool.terminate()
    } catch (error) {
      console.warn('[ProofreadWorkerPool] Error terminating pool:', error)
    }

    this.initPromise = null
    this.initState = 'idle'
    this.initError = null
  }

  // 获取 workerpool 统计信息
  getStats() {
    return this.pool.stats()
  }
}