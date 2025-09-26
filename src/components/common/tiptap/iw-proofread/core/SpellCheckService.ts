import hash from 'object-hash'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type {
  SpellServiceConfig,
  NodeCheckRequest,
  NodeSpellResult,
  SpellEngineConfig,
} from './nodeTypes'
import { SpellWorkerPool } from './SpellWorkerPool'

export class SpellCheckService {
  private workerPool: SpellWorkerPool
  private nodeCache: Map<string, NodeSpellResult> = new Map()
  private engineConfig: SpellEngineConfig

  constructor(config: SpellServiceConfig) {
    this.engineConfig = {
      type: config.engineType || 'typo',
      language: config.language || 'en_US',
      dictionaryPath: config.dictionaryPath || '/dictionaries'
    }

    this.workerPool = new SpellWorkerPool({
      maxWorkers: config.maxWorkers || Math.min(navigator.hardwareConcurrency || 2, 4),
      engineConfig: this.engineConfig,
      workerScript: '/workers/spellCheckWorker.js',
      workerTimeout: 5000
    })

    // 初始化清理定时器
    this.setupCacheCleanup(config.cacheExpiry || 300000) // 5分钟过期
  }

  /**
   * 检查单个或多个Node
   * @param nodes - 要检查的Node数组
   * @returns Promise<NodeSpellResult[]> - 每个Node对应一个结果
   */
  async checkNodes(nodes: NodeCheckRequest[]): Promise<NodeSpellResult[]> {
    if (nodes.length === 0) return []

    // 1. 分离缓存命中和未命中的nodes
    const { cachedResults, nodesToCheck } = this.partitionNodes(nodes)

    // 2. 对未命中缓存的nodes进行多线程检查
    const newResults = await this.processNodesInParallel(nodesToCheck)

    // 3. 更新缓存
    this.updateNodeCache(newResults)

    // 4. 合并结果并保持原始顺序
    return this.mergeResults(cachedResults, newResults, nodes)
  }

  private partitionNodes(nodes: NodeCheckRequest[]): {
    cachedResults: Map<string, NodeSpellResult>
    nodesToCheck: NodeCheckRequest[]
  } {
    const cachedResults = new Map<string, NodeSpellResult>()
    const nodesToCheck: NodeCheckRequest[] = []

    for (const nodeRequest of nodes) {
      const nodeKey = this.generateNodeKey(nodeRequest.node)
      const cached = this.nodeCache.get(nodeKey)

      if (cached && !this.isCacheExpired(cached)) {
        cachedResults.set(nodeRequest.id, {
          ...cached,
          nodeId: nodeRequest.id // 更新为当前请求ID
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
        nodeId: node.id,
        nodeKey: this.generateNodeKey(node.node),
        errors: [],
        checkedAt: Date.now(),
        processingTime: 0
      }))
    }
  }

  private generateNodeKey(node: ProseMirrorNode): string {
    // 生成Node的唯一标识，用于缓存
    return hash({
      type: node.type.name,
      content: node.textContent,
      attrs: node.attrs,
      marks: node.marks?.map(mark => ({ type: mark.type.name, attrs: mark.attrs }))
    })
  }

  private isCacheExpired(result: NodeSpellResult, maxAge: number = 300000): boolean {
    return Date.now() - result.checkedAt > maxAge
  }

  private updateNodeCache(results: NodeSpellResult[]): void {
    for (const result of results) {
      this.nodeCache.set(result.nodeKey, result)
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
      resultMap.set(result.nodeId, result)
    }

    // 按原始顺序返回结果
    return originalNodes.map(node =>
      resultMap.get(node.id) || {
        nodeId: node.id,
        nodeKey: this.generateNodeKey(node.node),
        errors: [],
        checkedAt: Date.now(),
        processingTime: 0
      }
    )
  }

  private setupCacheCleanup(maxAge: number): void {
    setInterval(() => {
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