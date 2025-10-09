// 主要导出
export { iwProofreadExtension, default } from './iwProofreadExtension'
export type { iwProofreadOptions, iwProofreadStorage } from './types'

// 核心服务
export { ProofreadService, ProofreadWorkerPool, debounce } from './service'

// 核心类型
export type {
	ProofreadError,
	NodeProofreadRequest,
	NodeProofreadResult,
	ProofreadServiceConfig,
	ProofreadEngineType,
	ProofreadEngineConfig,
	TypoEngineOptions,
	LanguageToolEngineOptions,
	CustomEngineOptions,
	WorkerPoolConfig
} from './service'

// 建议框适配器
export {
	createTipTapSuggestionBox
} from './adapters/suggestionBoxAdapter'