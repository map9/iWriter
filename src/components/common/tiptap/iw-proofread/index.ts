// 主要导出
export { iwProofreadExtension, default } from './iwProofreadExtension'
export type { iwProofreadOptions, iwProofreadStorage } from './types'

// 核心服务
export { SpellCheckService, SpellWorkerPool, debounce } from './spell-check'

// 核心类型
export type {
	SpellError,
	NodeCheckRequest,
	NodeSpellResult,
	NodePriority,
	SpellServiceConfig,
	SpellEngineType,
	SpellEngineConfig,
	TypoEngineOptions,
	LanguageToolEngineOptions,
	CustomEngineOptions,
	WorkerPoolConfig
} from './spell-check'

// 建议框适配器
export {
	createTipTapSuggestionBox,
	defaultSuggestionBoxCSS
} from './adapters/suggestionBoxAdapter'