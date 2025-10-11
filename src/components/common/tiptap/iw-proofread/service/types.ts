// ===== 错误类型定义 =====
export interface ProofreadError {
  offset: number // 相对于node开始位置的偏移
  length: number
  word: string
  suggestions: string[]
  message?: string
  shortMessage?: string
  type?: 'spelling' | 'grammar' | 'style' | 'misc'
}

// ===== 检查请求和结果 =====
export interface NodeProofreadRequest {
  id: string        // 唯一标识符
  nodeContent: string
}

export interface NodeProofreadResult {
  id: string        // 唯一标识符
  errors: ProofreadError[]
  checkedAt: number
}

// ===== 引擎类型枚举 =====
export type ProofreadEngineType = 'typo' | 'languagetool' | 'custom'

// ===== 引擎特定配置 =====

// Typo.js 引擎配置
export interface TypoEngineOptions {
  dictionaryPath: string  // 字典文件路径，如 '/dictionaries'
}

// LanguageTool 引擎配置
export interface LanguageToolEngineOptions {
  apiUrl?: string         // API 端点，默认 'https://api.languagetool.org/v2/check'
  apiKey?: string         // 可选，付费版 API Key
  timeout?: number        // 请求超时时间(ms)，默认 5000
}

// 自定义引擎配置
export interface CustomEngineOptions {
  [key: string]: unknown
}

// ===== 统一引擎配置接口 =====
export interface ProofreadEngineConfig {
  // 通用配置
  type: ProofreadEngineType
  language: string        // 语言代码，如 'en', 'en-US', 'zh-CN'

  // 引擎特定配置（根据 type 选择对应的 options）
  engineOptions?: TypoEngineOptions | LanguageToolEngineOptions | CustomEngineOptions
}

// ===== Service 配置接口 =====
export interface ProofreadServiceConfig {
  // 引擎配置
  engineType?: ProofreadEngineType
  language?: string
  engineOptions?: TypoEngineOptions | LanguageToolEngineOptions | CustomEngineOptions

  // Worker 池配置
  maxWorkers?: number

  // 缓存配置
  cacheSize?: number
  cacheExpiry?: number
}

// ===== Worker 池配置 =====
export interface WorkerPoolConfig {
  maxWorkers: number
  engineConfig: ProofreadEngineConfig
  workerScript?: string
  workerTimeout?: number
}