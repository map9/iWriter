export interface NodeProofread {
	id: string
	node: import('@tiptap/pm/model').Node
	status: 'idle' | 'checking' | 'checked' | 'deleted'
	result?: import('./spell-check').NodeSpellResult
}

export interface iwProofreadOptions {
	engineType?: import('./spell-check').SpellEngineType
	language?: string
	dictionaryPath?: string
	maxWorkers?: number
	enabled?: boolean
	showErrors?: boolean
	debounceTime?: number
	cacheSize?: number
	cacheExpiry?: number
}

export interface iwProofreadStorage {
	spellService: import('./spell-check').SpellCheckService | null
	isEnabled: boolean
	showErrors: boolean
	nodeProofreadMap: import('./utils').LockedSharedMap<string, import('./types').NodeProofread>
	decorationSet: import('@tiptap/pm/view').DecorationSet
	isProcessing: boolean
	debounceTimer: NodeJS.Timeout | null
}

export interface ProofreadPluginState {
}