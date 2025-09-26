import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet, Decoration } from '@tiptap/pm/view'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Transaction } from '@tiptap/pm/state'
import hash from 'object-hash'
import { SpellCheckService } from './core/SpellCheckService.js'
import { createTipTapSuggestionBox } from './adapters/suggestionBoxAdapter.js'
import type {
	SpellEngineType,
	NodeCheckRequest,
	NodeSpellResult,
	SpellError
} from './core/nodeTypes.js'
import { NodePriority } from './core/nodeTypes.js'
import { debounce } from './core/utils.js'

// TipTap Extension 配置接口
export interface iwProofreadOptions {
	engineType?: SpellEngineType
	language?: string
	dictionaryPath?: string
	maxWorkers?: number
	enabled?: boolean
	showErrors?: boolean
	debounceTime?: number
	cacheSize?: number
	cacheExpiry?: number
}

// Extension Storage 类型
export interface iwProofreadStorage {
	spellService: SpellCheckService | null
	isEnabled: boolean
	showErrors: boolean
	nodeResults: Map<string, NodeSpellResult>
	decorationSet: DecorationSet
	changedNodes: Set<string>
	isProcessing: boolean
	lastDoc: ProseMirrorNode | null
	debounceTimer: NodeJS.Timeout | null
}

// 声明命令类型
declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		iwProofread: {
			enableSpellCheck: () => ReturnType
			disableSpellCheck: () => ReturnType
			toggleSpellCheck: () => ReturnType
			checkSpelling: () => ReturnType
			checkChangedOnly: () => ReturnType
			checkRange: (from: number, to: number) => ReturnType
			showErrors: (show: boolean) => ReturnType
			toggleErrorDisplay: () => ReturnType
		}
	}
}

// 插件状态和核心逻辑
const spellCheckPluginKey = new PluginKey('iwProofread')

// 工具函数
const shouldCheckNode = (node: ProseMirrorNode): boolean => {
	const textContainerTypes = ['paragraph', 'heading', 'blockquote', 'listItem']
	return textContainerTypes.includes(node.type.name) &&
		   Boolean(node.textContent) &&
		   node.textContent.length > 0
}

const calculateNodePriority = (_node: ProseMirrorNode, pos: number): NodePriority => {
	if (pos < 1000) return NodePriority.HIGH
	if (pos < 5000) return NodePriority.NORMAL
	return NodePriority.LOW
}

const generateNodeKey = (node: ProseMirrorNode): string => {
	return hash({
		type: node.type.name,
		content: node.textContent,
		attrs: node.attrs,
		marks: node.marks?.map(mark => ({ type: mark.type.name, attrs: mark.attrs }))
	})
}

const detectChangedNodes = (
	_oldDoc: ProseMirrorNode,
	newDoc: ProseMirrorNode,
	transaction: Transaction
): Set<string> => {
	const changedNodes = new Set<string>()

	transaction.steps.forEach((step) => {
		const stepMap = step.getMap()
		stepMap.forEach((_oldStart: number, _oldEnd: number, newStart: number, newEnd: number) => {
			newDoc.nodesBetween(newStart, newEnd, (node: ProseMirrorNode) => {
				if (shouldCheckNode(node)) {
					changedNodes.add(generateNodeKey(node))
				}
			})
		})
	})

	return changedNodes
}

const collectNodesToCheck = (doc: ProseMirrorNode, changedNodes?: Set<string>): NodeCheckRequest[] => {
	const nodes: NodeCheckRequest[] = []

	doc.descendants((node, pos) => {
		if (shouldCheckNode(node)) {
			const nodeKey = generateNodeKey(node)
			if (!changedNodes || changedNodes.has(nodeKey)) {
				nodes.push({
					id: `node_${pos}_${Date.now()}_${Math.random()}`,
					node,
					position: pos,
					priority: calculateNodePriority(node, pos)
				})
			}
		}
	})

	return nodes
}

const collectAllNodes = (doc: ProseMirrorNode): NodeCheckRequest[] => {
	const nodes: NodeCheckRequest[] = []
	doc.descendants((node, pos) => {
		if (shouldCheckNode(node)) {
			nodes.push({
				id: `node_${pos}_${Date.now()}_${Math.random()}`,
				node,
				position: pos,
				priority: calculateNodePriority(node, pos)
			})
		}
	})
	return nodes
}

const updateNodeResults = (
	oldResults: Map<string, NodeSpellResult>,
	newResults: NodeSpellResult[]
): Map<string, NodeSpellResult> => {
	const updatedResults = new Map(oldResults)
	for (const result of newResults) {
		updatedResults.set(result.nodeKey, result)
	}
	return updatedResults
}

const createNodeDecorations = (doc: ProseMirrorNode, results: NodeSpellResult[]): DecorationSet => {
	const decorations: Decoration[] = []

	for (const result of results) {
		doc.descendants((node, pos) => {
			if (generateNodeKey(node) === result.nodeKey) {
				for (const error of result.errors) {
					const from = pos + 1 + error.offset
					const to = from + error.length

					if (from >= 0 && to <= doc.content.size && from < to) {
						decorations.push(
							Decoration.inline(
								from,
								to,
								{ class: getErrorClass(error.type) },
								{
									error,
									nodeId: result.nodeId,
									key: `${result.nodeId}_${error.offset}`
								}
							)
						)
					}
				}
			}
		})
	}

	return DecorationSet.create(doc, decorations)
}

const getErrorClass = (errorType: string): string => {
	switch (errorType) {
		case 'spelling':
			return 'spelling-error'
		case 'grammar':
			return 'grammar-error'
		default:
			return 'spell-error'
	}
}

const handleErrorClick = (
	view: { state: { tr: Transaction, schema: { text: (value: string) => any } }, dispatch: (tr: Transaction) => void },
	pos: number,
	event: MouseEvent,
	storage: iwProofreadStorage
): boolean => {
	if (!storage.showErrors || !storage.isEnabled) return false

	const decorations = storage.decorationSet.find(pos, pos)

	if (decorations.length > 0) {
		const decoration = decorations[0]
		if (decoration) {
			const error = decoration.spec.error

			if (error) {
				showSuggestionPopup(error, event, view, decoration, storage)
				return true
			}
		}
	}

	const existingBox = document.querySelector('.proofread-suggestion')
	if (existingBox) {
		existingBox.remove()
	}

	return false
}

const showSuggestionPopup = (
	error: SpellError,
	event: MouseEvent,
	view: { state: { tr: Transaction, schema: { text: (value: string) => any } }, dispatch: (tr: Transaction) => void },
	decoration: Decoration,
	storage: iwProofreadStorage
): void => {
	const rect = (event.target as HTMLElement).getBoundingClientRect()

	const suggestionBox = createTipTapSuggestionBox({
		noSuggestions: 'No suggestions found'
	})

	const app = suggestionBox({
		error: {
			from: decoration.from,
			to: decoration.to,
			msg: error.message,
			shortmsg: error.message,
			type: error.type,
			replacements: error.suggestions
		},
		position: { x: rect.left, y: rect.bottom },
		onReplace: (value: string) => {
			const { from, to } = decoration
			const tr = view.state.tr
			tr.replaceWith(from, to, view.state.schema.text(value))

			// 移除该装饰
			removeDecorationAt(from, to, storage, view)

			view.dispatch(tr)
			app.destroy()
		},
		onIgnore: () => {
			const { from, to } = decoration
			removeDecorationAt(from, to, storage, view)
			app.destroy()
		},
		onClose: () => {
			app.destroy()
		}
	})
}

const removeDecorationAt = (from: number, to: number, storage: iwProofreadStorage, view: { dispatch?: (tr: Transaction) => void, state: { tr: Transaction, schema: { text: (value: string) => any } } }) => {
	const toRemove = storage.decorationSet.find(from, to)
	if (toRemove.length > 0) {
		storage.decorationSet = storage.decorationSet.remove(toRemove)
		if (view?.dispatch) {
			view.dispatch(view.state.tr.setMeta('forceUpdate', true))
		}
	}
}

const performSpellCheck = async (
	storage: iwProofreadStorage,
	editor: { state: { doc: ProseMirrorNode }, view?: { dispatch: (tr: Transaction) => void, state: { tr: Transaction, schema: { text: (value: string) => any } } } }
) => {
	if (!storage.spellService || !storage.isEnabled) return

	const nodes = collectNodesToCheck(editor.state.doc, storage.changedNodes)
	if (nodes.length === 0) return

	storage.isProcessing = true

	try {
		const results = await storage.spellService.checkNodes(nodes)

		storage.nodeResults = updateNodeResults(storage.nodeResults, results)

		const decorations = createNodeDecorations(editor.state.doc, results)
		storage.decorationSet = decorations

		if (editor.view?.dispatch) {
			editor.view.dispatch(
				editor.view.state.tr.setMeta('forceUpdate', true)
			)
		}

	} catch (error) {
		console.error('Spell check error:', error)
	} finally {
		storage.isProcessing = false
	}
}

export const iwProofreadExtension = Extension.create<iwProofreadOptions, iwProofreadStorage>({
	name: 'iwProofread',

	addOptions() {
		return {
			engineType: 'typo' as SpellEngineType,
			language: 'en_US',
			dictionaryPath: '/dictionaries',
			maxWorkers: Math.min(navigator.hardwareConcurrency || 2, 4),
			enabled: true,
			showErrors: true,
			debounceTime: 1000,
			cacheSize: 1000,
			cacheExpiry: 300000
		}
	},

	addStorage() {
		return {
			spellService: null,
			isEnabled: this.options.enabled ?? true,
			showErrors: this.options.showErrors ?? true,
			nodeResults: new Map<string, NodeSpellResult>(),
			decorationSet: DecorationSet.empty,
			changedNodes: new Set<string>(),
			isProcessing: false,
			lastDoc: null,
			debounceTimer: null
		}
	},

	addCommands() {
		return {
			enableSpellCheck: () => ({ editor }) => {
				this.storage.isEnabled = true
				return editor.commands.checkSpelling()
			},
			disableSpellCheck: () => () => {
				this.storage.isEnabled = false
				this.storage.decorationSet = DecorationSet.empty
				return true
			},
			toggleSpellCheck: () => ({ commands }) => {
				return this.storage.isEnabled
					? commands.disableSpellCheck()
					: commands.enableSpellCheck()
			},
			checkSpelling: () => () => {
				if (this.storage.isEnabled) {
					const allNodes = collectAllNodes(this.editor.state.doc)
					this.storage.changedNodes = new Set(allNodes.map(n => generateNodeKey(n.node)))
					performSpellCheck(this.storage, this.editor)
				}
				return true
			},
			checkChangedOnly: () => () => {
				if (this.storage.isEnabled && this.storage.changedNodes.size > 0) {
					performSpellCheck(this.storage, this.editor)
				}
				return true
			},
			checkRange: (from: number, to: number) => () => {
				if (this.storage.isEnabled) {
					const rangeNodes = new Set<string>()
					this.editor.state.doc.nodesBetween(from, to, (node: ProseMirrorNode) => {
						if (shouldCheckNode(node)) {
							rangeNodes.add(generateNodeKey(node))
						}
					})
					this.storage.changedNodes = rangeNodes
					performSpellCheck(this.storage, this.editor)
				}
				return true
			},
			showErrors: (show: boolean) => () => {
				this.storage.showErrors = show
				return true
			},
			toggleErrorDisplay: () => ({ commands }) => {
				return commands.showErrors(!this.storage.showErrors)
			}
		}
	},

	addProseMirrorPlugins() {
		// 创建防抖检查函数
		const debouncedCheck = debounce(() => {
			performSpellCheck(this.storage, this.editor)
		}, this.options.debounceTime || 1000)

		return [
			new Plugin({
				key: spellCheckPluginKey,
				state: {
					init: () => ({
						nodeResults: new Map(),
						decorations: DecorationSet.empty,
						lastDoc: null
					}),
					apply: (tr, oldState, oldEditorState, newEditorState) => {
						// 检测文档变更
						if (tr.docChanged && this.storage.isEnabled) {
							const changedNodes = detectChangedNodes(
								this.storage.lastDoc || oldEditorState.doc,
								newEditorState.doc,
								tr
							)

							if (changedNodes.size > 0) {
								this.storage.changedNodes = changedNodes
								this.storage.decorationSet = DecorationSet.empty
								debouncedCheck()
							}

							this.storage.lastDoc = newEditorState.doc
						}

						return oldState
					}
				},
				props: {
					decorations: () => {
						return this.storage.showErrors ?
							this.storage.decorationSet :
							DecorationSet.empty
					},

					handleClick: (view, pos, event) => {
						return handleErrorClick(view, pos, event, this.storage)
					},

					handleKeyDown: () => {
						const existingBox = document.querySelector('.proofread-suggestion')
						if (existingBox) {
							existingBox.remove()
						}
						return false
					}
				}
			})
		]
	},

	onCreate() {
		// 初始化拼写检查服务
		this.storage.spellService = new SpellCheckService({
			engineType: this.options.engineType,
			language: this.options.language,
			dictionaryPath: this.options.dictionaryPath,
			maxWorkers: this.options.maxWorkers,
			cacheSize: this.options.cacheSize,
			cacheExpiry: this.options.cacheExpiry
		})

		// 初始化状态
		this.storage.lastDoc = this.editor.state.doc
	},

	onDestroy() {
		if (this.storage.spellService) {
			this.storage.spellService.destroy()
		}
		if (this.storage.debounceTimer) {
			clearTimeout(this.storage.debounceTimer)
		}
	}
})

export default iwProofreadExtension