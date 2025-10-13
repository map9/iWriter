export interface TextNodesWithPosition {
	text: string
	from: number
	to: number  // -1 表示 inlineMath 占位符
}

export interface NodeProofread {
	id: string
	node: import('@tiptap/pm/model').Node
	nodeContent: string
	status: 'idle' | 'checking' | 'checked' | 'deleted'
	result?: import('./service').NodeProofreadResult

	// 位置缓存优化
	pos?: number  // 节点在文档中的起始位置
	textNodesWithPosition?: TextNodesWithPosition[]  // 文本节点的详细位置信息
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