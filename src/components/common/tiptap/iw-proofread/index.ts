// 主要导出
export { iwProofreadExtension, default } from './iwProofreadExtension.js'
export type { iwProofreadOptions, iwProofreadStorage } from './iwProofreadExtension.js'

// 核心服务
export { SpellCheckService } from './core/SpellCheckService.js'
export { SpellWorkerPool } from './core/SpellWorkerPool.js'

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
export { debounce } from './core/utils.js'

// 建议框适配器
export {
	createTipTapSuggestionBox,
	defaultSuggestionBoxCSS
} from './adapters/suggestionBoxAdapter.js'

// LanguageTool 适配器（保留兼容性）
export {
	createLanguageToolAdapter,
	LanguageToolAdvancedAdapter,
	LanguageToolPresets,
	createLocalLanguageToolAdapter
} from './adapters/languageToolAdapter.js'