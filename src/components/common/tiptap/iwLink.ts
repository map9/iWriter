import { Link } from '@tiptap/extension-link'
import type { LinkOptions } from '@tiptap/extension-link'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Mark } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'

import { findMarkRange } from '../utils/findMarkRange'

interface LinkEditState {
  editingLink: {
    from: number
    to: number 
    mark: Mark
  } | null
  shouldShowToolbar: boolean
}

interface IwLinkOptions extends LinkOptions {
  editOnFocus: boolean
  editDelay: number
  autoExitOnValid: boolean
  linkOnPaste: boolean
  autolink: boolean
  HTMLAttributes: Record<string, any>
}

const markTypeName = 'iwLink'
const iwLinkPluginKey = new PluginKey(`${markTypeName}Edit`)

// 辅助函数
const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const createEditWidget = (textContent: string, href: string, from: number, to: number, mark: Mark, editor: Editor): HTMLElement => {
  const editWidget = document.createElement('span')
  editWidget.className = 'iw-link-edit-popup'
  editWidget.contentEditable = 'false'
  
  editWidget.innerHTML = `
    <div class="iw-link-editor-panel">
      <div class="iw-link-editor-inputs">
        <input class="iw-link-text-input" value="${escapeHtml(textContent)}" placeholder="Link text">
        <input class="iw-link-href-input" value="${escapeHtml(href)}" placeholder="https://...">
      </div>
      <div class="iw-link-editor-actions">
        <button class="iw-link-confirm" title="Confirm" type="button">✓</button>
        <button class="iw-link-cancel" title="Cancel" type="button">✕</button>
      </div>
    </div>
  `
  
  const textInput = editWidget.querySelector('.iw-link-text-input') as HTMLInputElement
  const hrefInput = editWidget.querySelector('.iw-link-href-input') as HTMLInputElement
  const confirmBtn = editWidget.querySelector('.iw-link-confirm') as HTMLButtonElement
  const cancelBtn = editWidget.querySelector('.iw-link-cancel') as HTMLButtonElement
  
  // 确认修改
  const confirmEdit = () => {
    const newText = textInput.value.trim()
    const newHref = hrefInput.value.trim()
    
    if (!newText || !newHref) return
    
    const { state, dispatch } = editor.view
    const tr = state.tr
    
    
    // 替换文本内容（如果改变了）
    const oldText = state.doc.textBetween(from, to, ' ')
    if (newText !== oldText) {
      tr.replaceWith(from, to, state.schema.text(newText))
      // 重新计算范围
      const newTo = from + newText.length
      tr.addMark(from, newTo, mark.type.create({ 
        ...mark.attrs, 
        href: newHref 
      }))
    } else {
      // 先移除旧的mark
      tr.removeMark(from, to, mark.type)
      // 只更新href
      tr.addMark(from, to, mark.type.create({ 
        ...mark.attrs, 
        href: newHref 
      }))
    }
    
    // 用 tr.mapping.map(...) 把旧位置映射到当前事务文档；
    const rawPos = state.selection.from
    const mappedPos = tr.mapping.map(rawPos, -1)
    const safePos = Math.max(0, Math.min(mappedPos, tr.doc.content.size))
    // 在 tr.doc 上创建 Selection；
    const selection = TextSelection.create(tr.doc, safePos)
    dispatch(tr.setSelection(selection).setMeta('exitLinkEdit', true))
    editor.view.focus()
  }
  
  // 取消编辑
  const cancelEdit = () => {
    const { state, dispatch } = editor.view
    
    const tr = state.tr
    const selection = TextSelection.create(state.doc, from)
    dispatch(tr.setSelection(selection).setMeta('exitLinkEdit', true))
    editor.view.focus()
  }
  
  // 键盘事件
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
      case 'Tab':
        e.preventDefault()
        e.stopPropagation()
        if (e.target === textInput) {
          hrefInput.focus()
        } else {
          textInput.focus()
        }
        break
    }
  }
  
  textInput.addEventListener('keydown', handleKeydown)
  hrefInput.addEventListener('keydown', handleKeydown)
  confirmBtn.addEventListener('click', confirmEdit)
  cancelBtn.addEventListener('click', cancelEdit)
  
  // 自动聚焦到文本输入
  setTimeout(() => textInput.focus(), 100)
  
  return editWidget
}

export const iwLink = Link.extend<IwLinkOptions>({
  name: markTypeName,

  addOptions() {
    return {
      ...this.parent?.(),
      editOnFocus: true,
      editDelay: 300,
      autoExitOnValid: true,
      linkOnPaste: true,
      autolink: true,
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
        class: 'iw-link',
      },
    }
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || []
    
    return [
      ...parentPlugins,
      new Plugin({
        key: iwLinkPluginKey,
        
        state: {
          init(): LinkEditState {
            return {
              editingLink: null,
              shouldShowToolbar: false
            }
          },
          
          apply(tr, prev, oldState, newState): LinkEditState {
            /*
            console.log('iwLink apply in', {
              editingLink: prev.editingLink, 
              shouldShowToolbar: prev.shouldShowToolbar,
              exitLinkEdit: tr.getMeta('exitLinkEdit'),
            })
            */
            // 计算当前光标所处 link
            const cur = findMarkRange(newState, newState.selection.$from.pos, markTypeName)

            // 处理退出编辑的meta
            if (
              tr.getMeta('exitLinkEdit') ||
              !newState.selection.empty
            ) {
                return { editingLink: cur, shouldShowToolbar: false }
            }

            // 1) 是否“进入”新的 link（从无到有，或者从一个 link 跳到另一个 link）
            const prevLink = prev.editingLink
            const enteringNewLink =
              (!prevLink && !!cur) ||
              (prevLink && cur && (prevLink.from !== cur.from || prevLink.to !== cur.to))

            // 2) 是否“离开” link（从有到无）
            const leavingLink = !!prevLink && !cur

            // 基于之前的 shouldShowToolbar 做增量更新，避免被焦点变化误关
            let shouldShow = prev.shouldShowToolbar
            if (enteringNewLink) shouldShow = true
            if (leavingLink) shouldShow = false

            // 其余情况（仍在同一个 link 内移动、DOM 聚焦变化等） => 保持现状
            return {
              editingLink: cur,
              shouldShowToolbar: shouldShow,
            }
          }
        },

        props: {
          decorations: (state: EditorState): DecorationSet | null => {
            const pluginState = iwLinkPluginKey.getState(state) as LinkEditState
            /*
            console.log('iwLink decorations', {
              editingLink: pluginState.editingLink, 
              shouldShowToolbar: pluginState.shouldShowToolbar
            })
            */
            if (!pluginState.shouldShowToolbar || !pluginState.editingLink) {
              return null
            }
            
            const { from, to, mark } = pluginState.editingLink
            
            // 获取被标记的文本内容
            const textContent = state.doc.textBetween(from, to, ' ')
            const href = mark.attrs.href || ''
            
            // 创建编辑widget
            const editWidget = createEditWidget(textContent, href, from, to, mark, this.editor)
            return DecorationSet.create(state.doc, [
              // 高亮当前编辑的链接
              Decoration.inline(from, to, {
                class: 'iw-link-editing-highlight'
              }),
              // 编辑面板 - 始终在最后一个字符位置
              Decoration.widget(Math.max(from, to), editWidget, {
                side: 1, // 显示在位置右侧
                key: 'iw-link-editor'
              })
            ])
          },
        },

      })
    ]
  }
})