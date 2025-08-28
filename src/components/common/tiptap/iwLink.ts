import { Link } from '@tiptap/extension-link'
import type { LinkOptions } from '@tiptap/extension-link'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Mark } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'

import { findMarkRange } from '../utils/findMarkRange'

const editSvg = `<svg  xmlns="http://www.w3.org/2000/svg"  class="control-button-icon"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-edit"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" /><path d="M16 5l3 3" /></svg>`
const checkSvg = `<svg  xmlns="http://www.w3.org/2000/svg"  class="control-button-icon" width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-check"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>`
const unlinkSvg = `<svg  xmlns="http://www.w3.org/2000/svg" class="control-button-icon" width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-unlink"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 22v-2" /><path d="M9 15l6 -6" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /><path d="M20 17h2" /><path d="M2 7h2" /><path d="M7 2v2" /></svg>`
const outboundSvg = `<svg  xmlns="http://www.w3.org/2000/svg"  class="control-button-icon" width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-external-link"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" /><path d="M11 13l9 -9" /><path d="M15 4h5v5" /></svg>`

interface LinkEditState {
  editingLink: {
    from: number
    to: number 
    mark: Mark
  } | null
  shouldShowToolbar: boolean
}
let editMode: boolean = false

interface IwLinkOptions extends LinkOptions {
  editOnFocus: boolean
  editDelay: number
  openOnClickFun: (url: string) => {}
}

const markTypeName = 'iwLink'
const iwLinkPluginKey = new PluginKey(`${markTypeName}Edit`)

// 辅助函数
const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const createEditWidget = (
  textContent: string,
  href: string,
  openOnClickFun: (url: string) => {},
  from: number, to: number, mark: Mark,
  editor: Editor
): HTMLElement => {
  const editWidget = document.createElement('span')
  editWidget.className = 'toolbar-warpper inline-block'
  editWidget.contentEditable = 'false'
  
  editWidget.innerHTML = `
    <div class="toolbar-controls floating">
      <div class="control-input-group">
        <input id="href-input" style="display: ${editMode? 'block': 'none'};" class="control-input-field" value="${escapeHtml(href)}" placeholder="https://...">
        <button id="edit" style="display: ${editMode? 'none' : 'block' };"class="control-button" title="Edit" type="button">${editSvg}</button>
        <button id="confirm" style="display: ${editMode? 'block': 'none'};" class="control-button confirm-button" title="Confirm" type="button">${checkSvg}</button>
        <button id="open"  style="display: ${editMode? 'block': 'none'};" class="control-button" title="Open" type="button">${outboundSvg}</button>
        <button id="unlink"  style="display: ${editMode? 'block': 'none'};" class="control-button delete-button" title="Unlink" type="button">${unlinkSvg}</button>
      </div>
    </div>
  `
  const hrefInput = editWidget.querySelector<HTMLInputElement>('#href-input')!
  const editBtn = editWidget.querySelector<HTMLButtonElement>('#edit')!
  const confirmBtn = editWidget.querySelector<HTMLButtonElement>('#confirm')!
  const openBtn = editWidget.querySelector<HTMLButtonElement>('#open')!
  const unlinkBtn = editWidget.querySelector<HTMLButtonElement>('#unlink')!
  
  // edit mode
  const edit = () => {
    hrefInput.style.display = 'block'
    editBtn.style.display = 'none'
    confirmBtn.style.display = 'block'
    openBtn.style.display = 'block'
    unlinkBtn.style.display = 'block'
    editMode = true

    // 自动聚焦到文本输入
    setTimeout(() => hrefInput.focus(), 100)
  }

  // 确认修改
  const confirmEdit = (): string => {
    const { state, dispatch } = editor.view
    
    const tr = state.tr
    const pluginState = iwLinkPluginKey.getState(state)
    let href = pluginState.editingLink.mark.attrs.href
    if (pluginState?.editingLink) {
      const newHref = hrefInput.value.trim()
      if (newHref !== href) {
        href = newHref
        tr.removeMark(from, to, mark.type)
        tr.addMark(from, to, mark.type.create({ 
          ...mark.attrs, 
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
    dispatch(tr.setSelection(selection).setMeta('exitLinkEdit', true))
    editor.view.focus()

    return href
  }
  
  // 取消编辑
  const cancelEdit = () => {
    const { state, dispatch } = editor.view
    
    const tr = state.tr
    const selection = TextSelection.create(state.doc, from)
    dispatch(tr.setSelection(selection).setMeta('exitLinkEdit', true))
    editor.view.focus()
  }
  
  const open = () => {
    const href = confirmEdit()
    openOnClickFun?.(href)
  }

  const unlink = () => {
    editor.chain().focus().unsetLink().run()
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
    }
  }
  
  hrefInput.addEventListener('keydown', handleKeydown)
  //editBtn.addEventListener('click', edit)
  editBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation()
    e.preventDefault()
    edit();
  });
  confirmBtn.addEventListener('click', confirmEdit)
  openBtn.addEventListener('click', open)
  unlinkBtn.addEventListener('click', unlink)
  
  if (editMode) setTimeout(() => hrefInput.focus(), 100)
 
  return editWidget
}

export const iwLink = Link.extend<IwLinkOptions>({
  name: markTypeName,
  // @ts-ignore
  addOptions() {
    return {
      ...this.parent?.(),
      openOnClick: false,
      openOnClickFun: () => {},
      editOnFocus: true,
      editDelay: 300,
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
            editMode = false
            return {
              editingLink: null,
              shouldShowToolbar: false,
            }
          },
          
          apply(tr, prev, oldState, newState): LinkEditState {
            /*
            console.log('iwLink apply in', {
              editingLink: prev.editingLink, 
              shouldShowToolbar: prev.shouldShowToolbar,
              editMode: editMode,
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
                editMode = false
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
            if (enteringNewLink) {
              shouldShow = true
              editMode = false
            }
            if (leavingLink) {
              shouldShow = false
              editMode = false
            }

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
              shouldShowToolbar: pluginState.shouldShowToolbar,
              editMode: editMode
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
            const editWidget = createEditWidget(textContent, href, this.options.openOnClickFun, from, to, mark, this.editor)
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