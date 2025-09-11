import type { Mark, Node } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'

import type { EditableFeature } from '../types.js'
import { findMarkRange, findNodeRange } from '../../utils'
import type { EditWidget }  from './utils/edit-widget.ts'

export interface iwPopupToolOptions {
  type: string
  createEditWidget: (options: iwPopupTool, from: number, to: number, element: Mark | Node, editor: Editor) => EditWidget
  updateEditWidget?: (editWidget: EditWidget, options: iwPopupTool, from: number, to: number, element: Mark | Node, editor: Editor) => void
}

export class iwPopupTool {
  private _editMode: boolean
  private _feature: EditableFeature | null
  private _editWidget: EditWidget | null
  options: iwPopupToolOptions

  constructor(options: iwPopupToolOptions, editMode: boolean = false) {
    this.options = options
    this._editMode = editMode
    this._feature = null
    this._editWidget = null
  }

  get editMode() {
    return this._editMode
  }
  
  set editMode(value: boolean) {
    this._editMode = value
  }

  getEditableFeatureType(state: EditorState): 'mark' | 'node' | null {
    if (state.schema.marks[this.options.type]) {
      return 'mark'
    } else if (state.schema.nodes[this.options.type]) {
      return 'node'
    } else {
      return null
    }
  }

  getEditableFeature(state: EditorState, pos: number) {
    if (state.schema.marks[this.options.type]) {
      return findMarkRange(state, pos, this.options.type) as EditableFeature | null
    } else if (state.schema.nodes[this.options.type]) {
      return findNodeRange(state, pos, this.options.type) as EditableFeature | null
    } else {
      console.warn(`Unknown type: ${this.options.type}`)
      return null
    }
  }

  createDecoration(feature: EditableFeature, state: EditorState, editor: Editor): DecorationSet | null {
    if (feature) {
      if (this._feature === null ||
        this._feature.from !== feature.from ||
        this._editWidget === null ||
        this.options.updateEditWidget === undefined
      ) {
        // 创建编辑widget
        const editWidget = this.options.createEditWidget(this, feature.from, feature.to, feature.element, editor)
        this._feature = feature
        this._editWidget = editWidget
      } else {
        // 避免在editMode下，实时更新编辑内容后，频繁创建widget，导致在编辑模式下光标位置一直在尾部
        this.options.updateEditWidget(this._editWidget, this, feature.from, feature.to, feature.element, editor)
      }

      return DecorationSet.create(state.doc, [
        // 高亮当前编辑的链接
        Decoration.inline(feature.from, feature.to, {
          class: 'floating-editor-highlight'
        }),
        // 编辑面板 - 对于Node，放在Node后面以避免事件冲突
        Decoration.widget(feature.to, this._editWidget?.dom, {
          side: 1, // 显示在位置右侧
          key: 'popop-editor',
          stopEvent: () => true, // 阻止事件传播到Node
        })
      ])
    }

    return null
  }
}

export default iwPopupTool