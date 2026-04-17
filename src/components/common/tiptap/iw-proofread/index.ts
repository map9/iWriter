import './style.scss'
import './../style.scss'

export { iwProofreadExtension, default } from './iwProofreadExtension'
export type { iwProofreadOptions, iwProofreadStorage } from './types'

export { ProofreadService, ProofreadWorkerPool, debounce } from './service'

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

export {
	createTipTapSuggestionBox
} from './adapters/suggestionBoxAdapter'