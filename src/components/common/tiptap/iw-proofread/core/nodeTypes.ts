import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface SpellError {
  offset: number // 相对于node开始位置的偏移
  length: number
  word: string
  message: string
  suggestions: string[]
  type: 'spelling' | 'grammar'
}

export enum NodePriority {
  HIGH = 1,    // 用户正在编辑的区域
  NORMAL = 2,  // 可见区域
  LOW = 3      // 不可见区域
}

export interface NodeCheckRequest {
  id: string // 请求ID，用于结果匹配
  node: ProseMirrorNode
  position: number // 在文档中的位置
  priority: NodePriority
}

export interface NodeSpellResult {
  nodeId: string
  nodeKey: string
  errors: SpellError[]
  checkedAt: number
  processingTime: number
}

export interface SpellServiceConfig {
  engineType?: SpellEngineType
  language?: string
  dictionaryPath?: string
  maxWorkers?: number
  cacheSize?: number
  cacheExpiry?: number
}

export type SpellEngineType = 'typo' | 'languagetool' | 'custom'

export interface SpellEngineConfig {
  type: SpellEngineType
  language: string
  dictionaryPath?: string
  options?: Record<string, any>
}

export interface WordInfo {
  word: string
  offset: number
  length: number
}

export interface SerializedNode {
  type: string
  text?: string
  textContent?: string
  attrs?: any
  marks?: any[]
}

export interface WorkerMessage {
  type: 'INIT_ENGINE' | 'CHECK_NODE' | 'TERMINATE'
  taskId: string
  payload: any
}

export interface WorkerResponse {
  type: 'ENGINE_READY' | 'NODE_RESULT' | 'ERROR'
  taskId: string
  result?: NodeSpellResult
  error?: string
}

export interface NodePayload {
  nodeData: SerializedNode
  position: number
  nodeId: string
}

export interface WorkerPoolConfig {
  maxWorkers: number
  engineConfig: SpellEngineConfig
  workerScript?: string
  workerTimeout?: number
}

export interface NodeTask {
  id: string
  nodeRequest: NodeCheckRequest
  priority: NodePriority
  estimatedTime: number
  // 队列管理相关
  resolve?: (result: NodeSpellResult) => void
  reject?: (error: Error) => void
  timeout?: NodeJS.Timeout
}