import { Link } from '@tiptap/extension-link'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Mark } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'

interface LinkEditState {
  editingLink: {
    from: number
    to: number 
    mark: Mark
  } | null
  showEditor: boolean
}

interface IwLinkOptions {
  editOnFocus: boolean
  editDelay: number
  autoExitOnValid: boolean
  linkOnPaste: boolean
  autolink: boolean
  HTMLAttributes: Record<string, any>
}

const iwLinkPluginKey = new PluginKey('iwLinkInlineEdit')

// 辅助函数
const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const isValidUrl = (url: string): boolean => {
  try {
    new URL(url)
    return true
  } catch {
    return url.startsWith('/') || url.startsWith('#')
  }
}

const findCompleteLinkRange = (state: EditorState, pos: number, targetMark: Mark, linkTypeName: string) => {
  const doc = state.doc
  let from = pos
  let to = pos + 1
  
  // 向前扩展
  while (from > 0) {
    const $pos = doc.resolve(from - 1)
    const marks = $pos.marks()
    const linkMark = marks.find(mark => mark.type.name === linkTypeName)
    
    if (!linkMark || !linkMark.eq(targetMark)) break
    from--
  }
  
  // 向后扩展
  while (to < doc.content.size) {
    const $pos = doc.resolve(to)
    const marks = $pos.marks()
    const linkMark = marks.find(mark => mark.type.name === linkTypeName)
    
    if (!linkMark || !linkMark.eq(targetMark)) break
    to++
  }
  
  return { from, to, mark: targetMark }
}

const detectLinkAtCursor = (state: EditorState, linkTypeName: string) => {
  const { selection } = state
  const { $from } = selection
  
  // 获取光标位置的marks
  const marks = $from.marks()
  const linkMark = marks.find(mark => mark.type.name === linkTypeName)
  console.log('detectLinkAtCursor', { linkMark, marks })
  
  if (!linkMark) {
    // 检查光标前后位置是否有link
    const beforeMarks = $from.nodeBefore?.marks || []
    const afterMarks = $from.nodeAfter?.marks || []
    
    const beforeLink = beforeMarks.find(mark => mark.type.name === linkTypeName)
    const afterLink = afterMarks.find(mark => mark.type.name === linkTypeName)
    
    if (beforeLink) {
      return findCompleteLinkRange(state, $from.pos - 1, beforeLink, linkTypeName)
    }
    if (afterLink) {
      return findCompleteLinkRange(state, $from.pos, afterLink, linkTypeName)
    }
    
    return null
  }
  
  return findCompleteLinkRange(state, $from.pos, linkMark, linkTypeName)
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
    
    dispatch(tr.setMeta('exitLinkEdit', true))
  }
  
  // 取消编辑
  const cancelEdit = () => {
    const { state, dispatch } = editor.view
    const tr = state.tr.setMeta('exitLinkEdit', true)
    dispatch(tr)
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
  name: 'iwLink',

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
              showEditor: false
            }
          },
          
          apply(tr, prev, oldState, newState): LinkEditState {
            // 处理退出编辑的meta
            if (tr.getMeta('exitLinkEdit')) {
              return {
                editingLink: null,
                showEditor: false
              }
            }
            
            // 检测光标位置变化
            const newEditingLink = detectLinkAtCursor(newState, 'iwLink')
            
            // 判断是否应该显示编辑器
            const shouldShow = !!newEditingLink
            
            return {
              editingLink: newEditingLink,
              showEditor: shouldShow
            }
          }
        },

        props: {
          decorations: (state: EditorState): DecorationSet | null => {
            const pluginState = iwLinkPluginKey.getState(state) as LinkEditState
            if (!pluginState.showEditor || !pluginState.editingLink) {
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
              Decoration.widget(Math.max(from, to - 1), editWidget, {
                side: 1, // 显示在位置右侧
                key: 'iw-link-editor'
              })
            ])
          },

          handleClick: (view: EditorView, pos: number, event: MouseEvent) => {
            const state = view.state
            const $pos = state.doc.resolve(pos)
            const marks = $pos.marks()
            const linkMark = marks.find(mark => mark.type.name === 'iwLink')
            
            if (linkMark) {
              const linkInfo = findCompleteLinkRange(state, pos, linkMark, 'iwLink')
              
              if (linkInfo) {
                // 设置选区到链接位置
                const tr = state.tr.setSelection(
                  TextSelection.near(state.doc.resolve(linkInfo.from))
                )
                view.dispatch(tr)
                return true
              }
            }
            
            return false
          }
        }
      })
    ]
  }
})