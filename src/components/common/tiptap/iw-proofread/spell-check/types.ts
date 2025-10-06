import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface SpellError {
  offset: number // 相对于node开始位置的偏移
  length: number
  word: string
  suggestions: string[]
  message?: string
  type?: 'spelling' | 'grammar'
}

export enum NodePriority {
  HIGH = 1,    // 用户正在编辑的区域
  NORMAL = 2,  // 可见区域
  LOW = 3      // 不可见区域
}

export interface NodeCheckRequest {
  id: string        // 唯一标识符
  node: ProseMirrorNode
}

export interface NodeSpellResult {
  id: string        // 唯一标识符
  errors: SpellError[]
  checkedAt: number
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

export interface WorkerPoolConfig {
  maxWorkers: number
  engineConfig: SpellEngineConfig
  workerScript?: string
  workerTimeout?: number
}