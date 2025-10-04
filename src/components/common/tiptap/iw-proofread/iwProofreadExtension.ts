import { Extension } from '@tiptap/core'
import { DecorationSet } from '@tiptap/pm/view'
import type { iwProofreadOptions, iwProofreadStorage } from './types'
import { iwProofreadPlugin } from './plugin/iwProofreadPlugin'
import { SpellCheckService } from './spell-check'
import { LockedSharedMap } from './utils'

// 声明命令类型
declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		iwProofread: {
			enableSpellCheck: () => ReturnType
			disableSpellCheck: () => ReturnType
			toggleSpellCheck: () => ReturnType
			checkSpelling: () => ReturnType
			showProofreadErrors: (show: boolean) => ReturnType
			toggleProofreadErrorDisplay: () => ReturnType
		}
	}
}

export const iwProofreadExtension = Extension.create<iwProofreadOptions, iwProofreadStorage>({
	name: 'iwProofread',

	addOptions() {
		return {
			engineType: 'typo' as import('./spell-check').SpellEngineType,
			language: 'en',
			dictionaryPath: '/dictionaries',
			maxWorkers: Math.min(navigator.hardwareConcurrency || 2, 4),
			enabled: true,
			showErrors: true,
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
			spellService: null,
			isEnabled: this.options.enabled ?? true,
			showErrors: this.options.showErrors ?? true,
			nodeProofreadMap: new LockedSharedMap<string, import('./types').NodeProofread>(),
			decorationSet: DecorationSet.empty,
			isProcessing: false,
			debounceTimer: null
    }
	},

	addCommands() {
		return {
			enableSpellCheck: () => () => {
				if (!this.storage.isEnabled) {
					this.storage.isEnabled = true
					this.storage.nodeProofreadMap.clear()
				}
				return true
			},
			disableSpellCheck: () => () => {
				this.storage.isEnabled = false
				this.storage.nodeProofreadMap.clear()
				return true
			},
			toggleSpellCheck: () => ({ commands }) => {
				return this.storage.isEnabled
					? commands.disableSpellCheck()
					: commands.enableSpellCheck()
			},
			checkSpelling: () => () => {
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
		this.storage.spellService = new SpellCheckService({
			engineType: this.options.engineType,
			language: this.options.language,
			dictionaryPath: this.options.dictionaryPath,
			maxWorkers: this.options.maxWorkers,
			cacheSize: this.options.cacheSize,
			cacheExpiry: this.options.cacheExpiry
		})
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