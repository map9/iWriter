import type { Editor } from '@tiptap/vue-3'
import { generateHTML } from '@tiptap/core'
import html2canvas from 'html2canvas'
import TurndownService from 'turndown'
import { gfm } from '@guyplusplus/turndown-plugin-gfm'
import { notify } from '@/utils/notifications'

// Initialize turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})
turndownService.use(gfm)

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
    const extensions = editor.extensionManager.extensions
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
    ///*
    const clipboardItems = await navigator.clipboard.read();
    // 遍历所有剪贴板项，查找 HTML 类型
    for (const item of clipboardItems) {
      console.log('ClipboardItem types:', item.types);

      if (item.types.includes('text/html')) {
        const htmlBlob = await item.getType('text/html');
        const htmlContent = await htmlBlob.text();
        console.log('Pasted HTML content:', htmlContent);
      }
      
      if (item.types.includes('text/plain')) {
        const textBlob = await item.getType('text/plain');
        const textContent = await textBlob.text();
        console.log('Pasted plain text content:', textContent);
      }
    }
    //*/

    // 从剪贴板读取纯文本
    const text = await navigator.clipboard.readText()
    if (!text) {
      return false
    }

    // 清理文本，移除可能的HTML标签和特殊格式
    const cleanText = text.replace(/<[^>]*>/g, '').trim()
    if (!cleanText) {
      return false
    }

    // 插入纯文本到当前位置
    editor.chain().focus().insertContent(cleanText).run()
    return true
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '粘贴失败')
    return false
  }
}