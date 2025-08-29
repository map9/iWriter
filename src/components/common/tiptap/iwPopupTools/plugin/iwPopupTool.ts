import type { Mark } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'

import type { EditableMark } from '../types.js'
import { findMarkRange } from '../../utils/findMarkRange'

export interface iwPopupToolOptions {
  type: string
  editMode: boolean
  createEditWidget: (options: iwPopupTool, from: number, to: number, mark: Mark, editor: Editor) => HTMLElement
}

export class iwPopupTool {
  private _editMode: boolean
  options: iwPopupToolOptions

  constructor(options: iwPopupToolOptions, editMode: boolean = false) {
    this.options = options
    this._editMode = editMode
  }

  get editMode() {
    return this._editMode
  }
  
  set editMode(value: boolean) {
    this._editMode = value
  }

  getEditableMark(state: EditorState, pos: number) {
    return findMarkRange(state, pos, this.options.type) as EditableMark | null
  }

  createDecoration(editableMark: EditableMark, state: EditorState, editor: Editor): DecorationSet | null {
    if (editableMark) {
      // 创建编辑widget
      const editWidget = this.options.createEditWidget(this, editableMark.from, editableMark.to, editableMark.mark, editor)
      return DecorationSet.create(state.doc, [
        // 高亮当前编辑的链接
        Decoration.inline(editableMark.from, editableMark.to, {
          class: 'iw-link-editing-highlight'
        }),
        // 编辑面板 - 始终在最后一个字符位置
        Decoration.widget(Math.max(editableMark.from, editableMark.to), editWidget, {
          side: 1, // 显示在位置右侧
          key: 'iw-link-editor'
        })
      ])
    }

    return null
  }
}

export default iwPopupTool