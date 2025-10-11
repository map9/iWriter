export interface NodeProofread {
	id: string
	node: import('@tiptap/pm/model').Node
	nodeContent: string
	status: 'idle' | 'checking' | 'checked' | 'deleted'
	result?: import('./service').NodeProofreadResult
}

export interface iwProofreadOptions {
	// 引擎配置
	engineType?: import('./service').ProofreadEngineType
	language?: string
	engineOptions?: import('./service').TypoEngineOptions
	              | import('./service').LanguageToolEngineOptions
	              | import('./service').CustomEngineOptions

	// Worker 配置
	maxWorkers?: number

	// 功能开关
	enabled?: boolean
	showErrors?: boolean

	// 性能配置
	debounceTime?: number
	cacheSize?: number
	cacheExpiry?: number
}

export interface iwProofreadStorage {
	proofreadService: import('./service').ProofreadService | null
	isEnabled: boolean
	showErrors: boolean
	nodeProofreadMap: import('./utils').LockedSharedMap<string, NodeProofread>
	decorationSet: import('@tiptap/pm/view').DecorationSet
	isProcessing: boolean
	debounceTimer: NodeJS.Timeout | null
	ignoredErrors: import('./utils').LockedSharedMap<string, boolean>
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProofreadPluginState {
}