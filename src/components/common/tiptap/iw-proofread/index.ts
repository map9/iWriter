// 主要导出
export { iwProofreadExtension, default } from './iwProofreadExtension'
export type { iwProofreadOptions, iwProofreadStorage } from './iwProofreadExtension'

// 核心服务
export { SpellCheckService } from './core/SpellCheckService'
export { SpellWorkerPool } from './core/SpellWorkerPool'

// 核心类型
export type {
	SpellError,
	NodeCheckRequest,
	NodeSpellResult,
	NodePriority,
	SpellServiceConfig,
	SpellEngineType,
	SpellEngineConfig,
	WorkerPoolConfig
} from './core/nodeTypes.js'

// 工具函数
export { debounce } from './core/utils'

// 建议框适配器
export {
	createTipTapSuggestionBox,
	defaultSuggestionBoxCSS
} from './adapters/suggestionBoxAdapter'