import { Extension } from '@tiptap/core'
import { DecorationSet } from '@tiptap/pm/view'
import type { iwProofreadOptions, iwProofreadStorage } from './types'
import { iwProofreadPlugin, performProofread } from './plugin/iwProofreadPlugin'
import { ProofreadService } from './service'
import { LockedSharedMap } from './utils'

// 声明命令类型
declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		iwProofread: {
			enableProofread: () => ReturnType
			disableProofread: () => ReturnType
			toggleProofread: () => ReturnType
			proofreadWhole: () => ReturnType
			showProofreadErrors: (show: boolean) => ReturnType
			toggleProofreadErrorDisplay: () => ReturnType
			reinitializeEngine: (config: {
				engineType: import('./service').ProofreadEngineType
				language: string
				engineOptions?: import('./service').TypoEngineOptions | import('./service').LanguageToolEngineOptions
			}) => ReturnType
		}
	}
}

export const iwProofreadExtension = Extension.create<iwProofreadOptions, iwProofreadStorage>({
	name: 'iwProofread',

	addOptions() {
		return {
			// 引擎配置
			engineType: 'typo' as import('./service').ProofreadEngineType,
			language: 'en',
			engineOptions: {
				dictionaryPath: '/dictionaries'
			} as import('./service').TypoEngineOptions,

			// Worker 配置
			maxWorkers: Math.min(navigator.hardwareConcurrency || 2, 4),

			// 功能开关
			enabled: true,
			showErrors: true,

			// 性能配置
			debounceTime: 1000,
			cacheSize: 1000,
			cacheExpiry: 300000
		}
	},

	addProseMirrorPlugins() {
		return [iwProofreadPlugin(this.editor, this.options, this.storage)]
	},

	addStorage() {
    return {
			proofreadService: null,
			isEnabled: this.options.enabled ?? true,
			showErrors: this.options.showErrors ?? true,
			nodeProofreadMap: new LockedSharedMap<string, import('./types').NodeProofread>(),
			decorationSet: DecorationSet.empty,
			isProcessing: false,
			debounceTimer: null,
			ignoredErrors: new LockedSharedMap<string, boolean>()
    }
	},

	addCommands() {
		return {
			enableProofread: () => () => {
				if (!this.storage.isEnabled) {
					this.storage.isEnabled = true
					this.storage.nodeProofreadMap.clear()
				}
				return true
			},
			disableProofread: () => () => {
				this.storage.isEnabled = false
				this.storage.nodeProofreadMap.clear()
				return true
			},
			toggleProofread: () => ({ commands }) => {
				return this.storage.isEnabled
					? commands.disableProofread()
					: commands.enableProofread()
			},
			proofreadWhole: () => () => {
				performProofread(this.storage, this.editor)
				return true
			},
			showProofreadErrors: (show: boolean) => () => {
				this.storage.showErrors = show
				return true
			},
			toggleProofreadErrorDisplay: () => ({ commands }) => {
				return commands.showProofreadErrors(!this.storage.showErrors)
			},
			reinitializeEngine: (config) => () => {
				// 1. 清理防抖定时器
				if (this.storage.debounceTimer) {
					clearTimeout(this.storage.debounceTimer)
					this.storage.debounceTimer = null
				}
				// 2. 销毁旧的 ProofreadService
				if (this.storage.proofreadService) {
					this.storage.proofreadService.destroy()
					this.storage.proofreadService = null
				}
				// 3. 清空所有缓存状态
				this.storage.nodeProofreadMap.clear()
				this.storage.decorationSet = DecorationSet.empty
				this.storage.ignoredErrors.clear()
				this.storage.isProcessing = false
				// 4. dispatch 空事务让视图立即清除 decorations
				if (this.editor.view?.dispatch) {
					this.editor.view.dispatch(this.editor.view.state.tr.setMeta('forceUpdate', true))
				}
				// 5. 若 proofread 未启用则无需重建
				if (!this.storage.isEnabled) return true
				// 6. 用新配置创建 ProofreadService 并全文重新检查
				try {
					this.storage.proofreadService = new ProofreadService({
						engineType: config.engineType,
						language: config.language,
						engineOptions: config.engineOptions,
						maxWorkers: this.options.maxWorkers,
						cacheSize: this.options.cacheSize,
						cacheExpiry: this.options.cacheExpiry
					})
					performProofread(this.storage, this.editor, true)
				} catch (error) {
					console.warn('[iwProofreadExtension] Engine reinitialization failed:', error)
					this.storage.isEnabled = false
				}
				return true
			}
		}
	},

	onCreate() {
		try {
			this.storage.proofreadService = new ProofreadService({
				engineType: this.options.engineType,
				language: this.options.language,
				engineOptions: this.options.engineOptions,
				maxWorkers: this.options.maxWorkers,
				cacheSize: this.options.cacheSize,
				cacheExpiry: this.options.cacheExpiry
			})
		} catch (error) {
			this.storage.proofreadService = null
			this.storage.isEnabled = false
			console.warn('[iwProofreadExtension] Proofread initialization skipped:', error)
		}
	},

	onDestroy() {
		if (this.storage.proofreadService) {
			this.storage.proofreadService.destroy()
		}
		if (this.storage.debounceTimer) {
			clearTimeout(this.storage.debounceTimer)
		}
	}
})

export default iwProofreadExtension
