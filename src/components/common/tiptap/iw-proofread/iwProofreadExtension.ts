import { Extension } from '@tiptap/core'
import { DecorationSet } from '@tiptap/pm/view'
import type { iwProofreadOptions, iwProofreadStorage } from './types'
import { iwProofreadPlugin } from './plugin/iwProofreadPlugin'
import { ProofreadService } from './service'
import { LockedSharedMap } from './utils'
import './styles/style.scss'

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
				// TODO
				return true
			},
			showProofreadErrors: (show: boolean) => () => {
				this.storage.showErrors = show
				return true
			},
			toggleProofreadErrorDisplay: () => ({ commands }) => {
				return commands.showProofreadErrors(!this.storage.showErrors)
			}
		}
	},

	onCreate() {
		this.storage.proofreadService = new ProofreadService({
			engineType: this.options.engineType,
			language: this.options.language,
			engineOptions: this.options.engineOptions,
			maxWorkers: this.options.maxWorkers,
			cacheSize: this.options.cacheSize,
			cacheExpiry: this.options.cacheExpiry
		})
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