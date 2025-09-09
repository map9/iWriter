import { TextSelection } from '@tiptap/pm/state'
import type { Mark, Node } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'

import { iwPopupTool } from '../iwPopupTool.ts'
import type { iwPopupToolOptions } from '../iwPopupTool.ts'
import { iwPopupToolsPluginKey } from '../iwPopupToolsPlugin.ts'
import { EditWidget, ElementDisplayMode, escapeHtml }  from '../utils/EditWidget.ts'

export interface iwMathPopupToolOptions extends iwPopupToolOptions {
}

export class iwMathPopupTool extends iwPopupTool {
  constructor() {
    super({
      type: 'inlineMath',
      createEditWidget: (tool: iwPopupTool, from: number, _to: number, element: Mark | Node, editor: Editor): EditWidget => {
        const latex: string = element.attrs.latex || ''
        const editWidget = new EditWidget()

        // 输入组
        const inputGroup = EditWidget.createGroup({})
        editWidget.appendChildToPanel(inputGroup, ElementDisplayMode.EDITMODE)

        // LaTeX输入框
        const latexInput = EditWidget.createInput({
          placeholder: "E = mc^2",
          value: `${escapeHtml(latex)}`,
        })

        // 实时更新
        const handleInput = () => {
          const newLatex = latexInput.value
          editor.chain()
            .setNodeSelection(from)
            .updateInlineMath({ latex: newLatex })
            .run()
        }

        // 键盘处理
        const handleKeydown = (e: KeyboardEvent) => {
          switch (e.key) {
            case 'Delete':
            case 'Backspace':
              e.stopPropagation()
              break
            case 'Enter':
              e.preventDefault()
              e.stopPropagation()
              closeEdit()
              break
            case 'Escape':
              e.preventDefault()
              e.stopPropagation()
              closeEdit()
              break
          }
        }

        latexInput.addEventListener('input', handleInput) // 临时注释测试
        latexInput.addEventListener('keydown', handleKeydown)
        inputGroup.appendChild(latexInput)

        // 按钮组
        const closeBtn = EditWidget.createButton({
          title: 'Close',
          className: 'confirm-button',
          icon: EditWidget.IconCheck,
        })
        const closeEdit = () => {
          const { state, dispatch } = editor.view
          const tr = state.tr

          // 用 tr.mapping.map(...) 把旧位置映射到当前事务文档；
          const rawPos = state.selection.from
          const mappedPos = tr.mapping.map(rawPos, -1)
          const safePos = Math.max(0, Math.min(mappedPos, tr.doc.content.size))
          // 在 tr.doc 上创建 Selection；
          const selection = TextSelection.create(tr.doc, safePos)
          dispatch(tr.setSelection(selection).setMeta('exitPopupTool', true))
          editor.view.focus()
        }
        closeBtn.addEventListener('click', closeEdit)
        inputGroup.appendChild(closeBtn)
        
        // 编辑模式切换
        const toggleEditMode = (e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          tool.editMode = true
          editWidget.setEditMode(true)
          if (tool.editMode) {
            setTimeout(() => {
              latexInput.select()
              latexInput.focus()
            }, 100)
          }
        }
        editWidget.editBtn.addEventListener('mousedown', toggleEditMode)

        editWidget.setEditMode(tool.editMode)
        if (tool.editMode) {
          setTimeout(() => {
            latexInput.select()
            latexInput.focus()
          }, 100)
        }

        return editWidget
      },

      updateEditWidget: (editWidget: EditWidget, tool: iwPopupTool, from: number, to: number, element: Mark | Node, editor: Editor) => {
        const latex: string = element.attrs.latex || ''
        const latexInput = editWidget.dom.querySelector('input')
        let changed = false
        if (latexInput && latex !== (latexInput as HTMLInputElement).value) {
          latexInput.value = latex
          changed = true
        }

        editWidget.setEditMode(tool.editMode)
        if (tool.editMode && latexInput) {
          setTimeout(() => {
            if (changed) latexInput.select()
            latexInput.focus()
          }, 100)
        }
      }

    })
  }
}

export default iwMathPopupTool
