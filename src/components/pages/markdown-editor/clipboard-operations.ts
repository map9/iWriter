import type { Editor } from '@tiptap/vue-3'
import { generateHTML } from '@tiptap/core'
import TurndownService from 'turndown'
import { gfm } from '@guyplusplus/turndown-plugin-gfm'
import { notify } from '@/utils/notifications'
import { configureAlertTurndown } from '@/utils/markdownAlerts'

// Initialize turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  br: '<br>',
})
turndownService.use(gfm)
configureAlertTurndown(turndownService)
turndownService.addRule('inlineMath', {
  filter: (node) =>
    node.nodeName === 'SPAN' && (node as HTMLElement).getAttribute('data-type') === 'inline-math',
  replacement: (_content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-latex') ?? ''
    return `$${latex}$`
  },
})
turndownService.addRule('blockMath', {
  filter: (node) =>
    node.nodeName === 'DIV' && (node as HTMLElement).getAttribute('data-type') === 'block-math',
  replacement: (_content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-latex') ?? ''
    return `\n\n$$\n${latex}\n$$\n\n`
  },
})

/**
 * 获取选中内容的HTML
 * @param editor TipTap编辑器实例
 * @returns 选中的HTML内容，如果没有选中则返回null
 */
function getSelectedHTML(editor: Editor): string | null {
  const { selection } = editor.state

  // 检查是否有选中内容
  if (selection.empty) {
    return null
  }

  // 获取选中内容的HTML
  const { from, to } = selection
  const slice = editor.state.doc.slice(from, to)

  try {
    // 使用TipTap的generateHTML方法来生成选中内容的HTML
    const extensions = editor.extensionManager.baseExtensions
    const selectedContent = { type: 'doc', content: slice.content.toJSON() }
    return generateHTML(selectedContent, extensions)
  } catch (error) {
    console.error('Error generating HTML from selection:', error)
    return null
  }
}

/**
 * 获取选中内容的纯文本
 * @param editor TipTap编辑器实例
 * @returns 选中的纯文本内容，如果没有选中则返回null
 */
function getSelectedText(editor: Editor): string | null {
  const { selection } = editor.state

  // 检查是否有选中内容
  if (selection.empty) {
    return null
  }

  // 获取选中内容的纯文本
  const { from, to } = selection
  return editor.state.doc.textBetween(from, to, '\n\n')
}

/**
 * 复制选中内容为纯文本
 * @param editor TipTap编辑器实例
 * @returns 操作是否成功
 */
export async function copyAsPlainText(editor: Editor): Promise<boolean> {
  try {
    const selectedText = getSelectedText(editor)

    if (!selectedText) {
      return false
    }

    await navigator.clipboard.writeText(selectedText)
    return true
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '复制失败')
    return false
  }
}

/**
 * 复制选中内容为Markdown格式
 * @param editor TipTap编辑器实例
 * @returns 操作是否成功
 */
export async function copyAsMarkdown(editor: Editor): Promise<boolean> {
  try {
    const selectedHTML = getSelectedHTML(editor)

    if (!selectedHTML) {
      return false
    }

    // 将HTML转换为Markdown
    const markdownContent = turndownService.turndown(selectedHTML)

    // 使用ClipboardItem支持多种格式
    const clipboardItem = new ClipboardItem({
      'text/html': new Blob([selectedHTML], { type: 'text/html' }),
      'text/plain': new Blob([markdownContent], { type: 'text/plain' })
    })

    await navigator.clipboard.write([clipboardItem])
    return true
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '复制失败')
    return false
  }
}

/**
 * 复制选中内容为HTML格式
 * @param editor TipTap编辑器实例
 * @returns 操作是否成功
 */
export async function copyAsHtml(editor: Editor): Promise<boolean> {
  try {
    const selectedHTML = getSelectedHTML(editor)
    const selectedText = getSelectedText(editor)

    if (!selectedHTML || !selectedText) {
      return false
    }

    // 使用ClipboardItem支持多种格式
    const clipboardItem = new ClipboardItem({
      'text/html': new Blob([selectedHTML], { type: 'text/html' }),
      'text/plain': new Blob([selectedText], { type: 'text/plain' })
    })

    await navigator.clipboard.write([clipboardItem])
    return true
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '复制失败')
    return false
  }
}

/**
 * 粘贴纯文本到当前位置
 * @param editor TipTap编辑器实例
 * @returns 操作是否成功
 */
export async function pasteAsText(editor: Editor): Promise<boolean> {
  try {
    // 通过主进程读取剪贴板，避免 renderer clipboard-read 权限问题
    const text = await window.electronAPI.readClipboardText()
    if (!text) {
      return false
    }

    const pasted = editor.view.pasteText(text)
    editor.view.focus()
    return pasted
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '粘贴失败')
    return false
  }
}
