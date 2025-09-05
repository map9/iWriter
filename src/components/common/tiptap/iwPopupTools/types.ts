import type { Mark, Node } from '@tiptap/pm/model'
import type { iwPopupTool } from './plugin/iwPopupTool.ts'

export interface iwPopupToolsOptions {
  visible: boolean
  tools: Array<iwPopupTool>
}

export interface EditableFeature {
  from: number
  to: number
  element: Mark | Node  // 支持Mark或Node
}

export interface PluginState {
  visible: boolean
  feature: EditableFeature | null
  popupTool: iwPopupTool | null
  shouldShowToolbar: boolean
}