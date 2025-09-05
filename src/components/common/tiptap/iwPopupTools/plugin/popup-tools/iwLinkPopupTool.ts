import { TextSelection } from '@tiptap/pm/state'
import type { Mark, Node } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'

import { iwPopupTool } from '../iwPopupTool.ts'
import type { iwPopupToolOptions } from '../iwPopupTool.ts'
import { iwPopupToolsPluginKey } from '../iwPopupToolsPlugin.ts'
import { EditWidget, ElementDisplayMode, escapeHtml }  from '../utils/EditWidget.ts'

export interface iwLinkPopupToolOptions extends iwPopupToolOptions {
  openOnClickFun?: (url: string) => void
}

export class iwLinkPopupTool extends iwPopupTool {
  private openOnClickFun?: (url: string) => void

  constructor() {
    super({
      type: "link",
      createEditWidget: (tool: iwPopupTool, from: number, to: number, element: Mark | Node, editor: Editor): EditWidget => {
        const linkMark = element as Mark
        const href: string = linkMark.attrs.href || ''

        const editWidget = new EditWidget()

        const iputGroup = EditWidget.createGroup({})
        editWidget.appendChildToPanel(iputGroup, ElementDisplayMode.EDITMODE)

        const hrefInput = EditWidget.createInput({
          placeholder: "https://...",
          value: `${escapeHtml(href)}`,
        })
        const handleKeydown = (e: KeyboardEvent) => {
          switch (e.key) {
            case 'Delete':
            case 'Backspace':
              e.stopPropagation()
              break
            case 'Enter':
              e.preventDefault()
              e.stopPropagation()
              confirmEdit()
              break
            case 'Escape':
              e.preventDefault()
              e.stopPropagation()
              cancelEdit()
              break
          }
        }
        hrefInput.addEventListener('keydown', handleKeydown)
        iputGroup.appendChild(hrefInput)

        const confirmBtn = EditWidget.createButton({
          className: 'confirm-button',
          title: 'Confirm',
          icon: EditWidget.IconCheck,
        })
        const confirmEdit = (): string => {
          const { state, dispatch } = editor.view
          
          const tr = state.tr
          const pluginState = iwPopupToolsPluginKey.getState(state)
          let href = pluginState?.feature?.element.attrs.href
          if (pluginState?.feature) {
            const newHref = hrefInput.value.trim()
            if (newHref !== href) {
              href = newHref
              tr.removeMark(from, to, linkMark.type)
              tr.addMark(from, to, linkMark.type.create({ 
                ...linkMark.attrs, 
                href: href 
              }))
            }
          }
          
          // 用 tr.mapping.map(...) 把旧位置映射到当前事务文档；
          const rawPos = state.selection.from
          const mappedPos = tr.mapping.map(rawPos, -1)
          const safePos = Math.max(0, Math.min(mappedPos, tr.doc.content.size))
          // 在 tr.doc 上创建 Selection；
          const selection = TextSelection.create(tr.doc, safePos)
          dispatch(tr.setSelection(selection).setMeta('exitPopupTool', true))
          editor.view.focus()

          return href
        }
        confirmBtn.addEventListener('click', confirmEdit)
        iputGroup.appendChild(confirmBtn)

        const cancelEdit = () => {
          const { state, dispatch } = editor.view
          
          const tr = state.tr
          const selection = TextSelection.create(state.doc, from)
          dispatch(tr.setSelection(selection).setMeta('exitPopupTool', true))
          editor.view.focus()
        }

        const unlinkBtn = EditWidget.createButton({
          title: 'Unlink',
          className: 'delete-button',
          icon: EditWidget.IconUnlink,
        })
        const unlink = () => {
          editor.chain().focus().unsetLink().run()
          editor.view.focus()
        }
        unlinkBtn.addEventListener('click', unlink)
        iputGroup.appendChild(unlinkBtn)

                const openBtn = EditWidget.createButton({
          title: 'Open',
          icon: EditWidget.IconOutbound,
        })
        const open = () => {
          const href = confirmEdit()
          if (href) (tool as iwLinkPopupTool).openOnClickFun?.(href)
        }
        openBtn.addEventListener('click', open)
        editWidget.appendChildToPanel(openBtn, ElementDisplayMode.ALWAYS)

        const toggleEditMode = (e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          tool.editMode = true
          editWidget.setEditMode(true)
          if (tool.editMode) {
            setTimeout(() => {
              hrefInput.select()
              hrefInput.focus()
            }, 100)
          }
        }
        editWidget.editBtn.addEventListener('mousedown', toggleEditMode)
        editWidget.setEditMode(tool.editMode)
        if (tool.editMode) {
          setTimeout(() => {
            hrefInput.select()
            hrefInput.focus()
          }, 100)
        }

        return editWidget
      },

      updateEditWidget: (editWidget: EditWidget, tool: iwPopupTool, from: number, to: number, element: Mark | Node, editor: Editor) => {
        const linkMark = element as Mark
        const href: string = linkMark.attrs.href || ''
        const hrefInput = editWidget.dom.querySelector('input')
        let changed = false
        if (hrefInput && href !== (hrefInput as HTMLInputElement).value) {
          hrefInput.value = href
          changed = true
        }

        editWidget.setEditMode(tool.editMode)
        if (tool.editMode && hrefInput) {
          setTimeout(() => {
            if (changed) hrefInput.select()
            hrefInput.focus()
          }, 100)
        }
      }

    })
    
    this.openOnClickFun = (url: string) => {}
  }
}