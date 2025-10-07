import type {
  SpellServiceConfig,
  NodeCheckRequest,
  NodeSpellResult,
  SpellEngineConfig,
} from './types'
import { SpellWorkerPool } from './SpellWorkerPool'
import { generateNodeKey } from './utils'

export class SpellCheckService {
  private workerPool: SpellWorkerPool
  private nodeCache: Map<string, NodeSpellResult> = new Map()
  private engineConfig: SpellEngineConfig
  private cacheCleanupInterval: NodeJS.Timeout

  constructor(config: SpellServiceConfig) {
    // 构建引擎配置
    this.engineConfig = {
      type: config.engineType || 'typo',
      language: config.language || 'en',
      engineOptions: config.engineOptions
    }

    // 验证引擎特定配置
    this.validateEngineConfig(this.engineConfig)

    this.workerPool = new SpellWorkerPool({
      maxWorkers: config.maxWorkers || Math.min(navigator.hardwareConcurrency || 2, 4),
      engineConfig: this.engineConfig,
      workerScript: '/workers/spellCheckWorker.js',
      workerTimeout: 10000  // LanguageTool 可能需要更长超时
    })

    // 初始化清理定时器
    this.cacheCleanupInterval = this.setupCacheCleanup(config.cacheExpiry || 300000) // 5分钟过期
  }

  private validateEngineConfig(config: SpellEngineConfig): void {
    if (config.type === 'typo') {
      const options = config.engineOptions as import('./types').TypoEngineOptions | undefined
      if (!options?.dictionaryPath) {
        throw new Error('Typo engine requires dictionaryPath in engineOptions')
      }
    }
    // LanguageTool 的配置都有默认值，不需要强制验证
  }

  /**
   * 检查单个或多个Node
   * @param nodes - 要检查的Node数组
   * @returns Promise<NodeSpellResult[]> - 每个Node对应一个结果
   */
  async checkNodes(nodes: NodeCheckRequest[]): Promise<NodeSpellResult[]> {
    if (nodes.length === 0) return []

    // 为每个node生成nodeKey（如果还没有的话）
    const nodesWithKeys = nodes.map(node => ({
      ...node,
      id: node.id || generateNodeKey(node.node)
    }))

    // 1. 分离缓存命中和未命中的nodes
    const { cachedResults, nodesToCheck } = this.partitionNodes(nodesWithKeys)

    // 2. 对未命中缓存的nodes进行多线程检查
    const newResults = await this.processNodesInParallel(nodesToCheck)

    // 3. 更新缓存
    this.updateNodeCache(newResults)

    // 4. 合并结果并保持原始顺序
    return this.mergeResults(cachedResults, newResults, nodesWithKeys)
  }

  private partitionNodes(nodes: NodeCheckRequest[]): {
    cachedResults: Map<string, NodeSpellResult>
    nodesToCheck: NodeCheckRequest[]
  } {
    const cachedResults = new Map<string, NodeSpellResult>()
    const nodesToCheck: NodeCheckRequest[] = []

    for (const nodeRequest of nodes) {
      const cached = this.nodeCache.get(nodeRequest.id)

      if (cached && !this.isCacheExpired(cached)) {
        console.log('SpellCheckService: get result from cache:', nodeRequest.id)
        cachedResults.set(nodeRequest.id, {
          ...cached,
          id: nodeRequest.id // 更新为当前请求ID
        })
      } else {
        nodesToCheck.push(nodeRequest)
      }
    }

    return { cachedResults, nodesToCheck }
  }

  private async processNodesInParallel(nodes: NodeCheckRequest[]): Promise<NodeSpellResult[]> {
    if (nodes.length === 0) return []

    try {
      return await this.workerPool.processNodesInParallel(nodes)
    } catch (error) {
      console.error('SpellCheckService: Error processing nodes:', error)
      // 返回空错误结果而不是抛出异常
      return nodes.map(node => ({
        id: node.id,
        errors: [],
        checkedAt: Date.now(),
      }))
    }
  }

  private isCacheExpired(result: NodeSpellResult, maxAge: number = 300000): boolean {
    return Date.now() - result.checkedAt > maxAge
  }

  private updateNodeCache(results: NodeSpellResult[]): void {
    for (const result of results) {
      this.nodeCache.set(result.id, result)
    }

    // 限制缓存大小
    if (this.nodeCache.size > 1000) {
      const entries = Array.from(this.nodeCache.entries())
      entries.sort(([, a], [, b]) => a.checkedAt - b.checkedAt)

      // 删除最老的25%条目
      const deleteCount = Math.floor(entries.length * 0.25)
      for (let i = 0; i < deleteCount; i++) {
        this.nodeCache.delete(entries[i]?.[0] || '')
      }
    }
  }

  private mergeResults(
    cachedResults: Map<string, NodeSpellResult>,
    newResults: NodeSpellResult[],
    originalNodes: NodeCheckRequest[]
  ): NodeSpellResult[] {
    const resultMap = new Map<string, NodeSpellResult>()

    // 添加缓存结果
    for (const [id, result] of cachedResults.entries()) {
      resultMap.set(id, result)
    }

    // 添加新结果
    for (const result of newResults) {
      resultMap.set(result.id, result)
    }

    // 按原始顺序返回结果
    return originalNodes.map(node =>
      resultMap.get(node.id) || {
        id: node.id,
        errors: [],
        checkedAt: Date.now(),
      }
    )
  }

  private setupCacheCleanup(maxAge: number): NodeJS.Timeout {
    return setInterval(() => {
      const now = Date.now()
      for (const [key, result] of this.nodeCache.entries()) {
        if (now - result.checkedAt > maxAge) {
          this.nodeCache.delete(key)
        }
      }
    }, maxAge / 2) // 每半个过期时间清理一次
  }

  /**
   * 销毁服务，清理资源
   */
  async destroy(): Promise<void> {
    if (this.cacheCleanupInterval) clearInterval(this.cacheCleanupInterval)
    await this.workerPool.destroy()
    this.nodeCache.clear()
  }

  /**
   * 获取性能统计信息
   */
  getStats(): {
    cacheSize: number
    cacheHitRate: number
    activeWorkers: number
  } {
    return {
      cacheSize: this.nodeCache.size,
      cacheHitRate: 0, // TODO: 实现缓存命中率统计
      activeWorkers: this.workerPool.getActiveWorkerCount()
    }
  }
}