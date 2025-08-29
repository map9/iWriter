import type { Mark } from '@tiptap/pm/model'
import { DecorationSet } from '@tiptap/pm/view'
import type { iwPopupTool } from './plugin/iwPopupTool.ts'

export interface iwPopupToolsOptions {
  visible: boolean
  tools: Array<iwPopupTool>
}

export interface EditableMark {
  from: number
  to: number
  mark: Mark
}

export interface PluginState {
  visible: boolean
  editableMark: EditableMark | null
  popupTool: iwPopupTool | null
  shouldShowToolbar: boolean
}