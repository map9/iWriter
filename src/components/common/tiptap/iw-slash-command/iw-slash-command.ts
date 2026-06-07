import { Extension } from '@tiptap/core'
import { Suggestion } from '@tiptap/suggestion'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { SlashCommandItem } from './commands'
import { createSlashCommandSuggestion } from './suggestion'

export interface IwSlashCommandOptions {
  suggestion: Partial<SuggestionOptions<SlashCommandItem, SlashCommandItem>>
}

export const iwSlashCommand = Extension.create<IwSlashCommandOptions>({
  name: 'iwSlashCommand',

  addOptions() {
    return {
      suggestion: createSlashCommandSuggestion(),
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
