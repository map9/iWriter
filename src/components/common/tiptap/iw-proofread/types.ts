export interface NodeProofread {
	id: string
	node: import('@tiptap/pm/model').Node
	status: 'idle' | 'checking' | 'checked' | 'deleted'
	result?: import('./spell-check').NodeSpellResult
}

export interface iwProofreadOptions {
	// 引擎配置
	engineType?: import('./spell-check').SpellEngineType
	language?: string
	engineOptions?: import('./spell-check').TypoEngineOptions
	              | import('./spell-check').LanguageToolEngineOptions
	              | import('./spell-check').CustomEngineOptions

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
	spellService: import('./spell-check').SpellCheckService | null
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