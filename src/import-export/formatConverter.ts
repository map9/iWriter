import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from '@guyplusplus/turndown-plugin-gfm'

import { type FileTab, TEXT_MD_EXTENSIONS, TEXT_TXT_EXTENSIONS, TEXT_IWT_EXTENSIONS } from '@/types'

const iwtVersion = '1.0.0'

// Initialize markdown parser and converter
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})
/*
strikethrough (for converting <strike>, <s>, and <del> elements)
tables
taskListItems
gfm (which applies all of the above)
*/
turndownService.use(gfm)

function detectLineEnding(text: string): 'LF' | 'CRLF' {
  if (text.includes('\r\n')) return 'CRLF'
  return 'LF'
}

// Load content into editor
export async function convertContentFrom(content: string, extension: string) {
  if (TEXT_MD_EXTENSIONS.includes(extension as any)) {
    // Convert markdown to HTML for TipTap
    return {
      content: await marked(content),
      lineEnding: detectLineEnding(content)
    }
  } else if (TEXT_IWT_EXTENSIONS.includes(extension as any)) {
    // iWriter files are stored as JSON with HTML content
    const parsed = JSON.parse(content)
    return {
      content: parsed.content || '',
      lineEnding: detectLineEnding(content)
    }
  } else if (TEXT_TXT_EXTENSIONS.includes(extension as any)) {
    return {
      content: content,
      lineEnding: detectLineEnding(content)
    }
  } else {
    return null
  }
}

export function convertContentTo(tab: FileTab, extension: string, lineEnding?: 'LF' | 'CRLF'): string | null {
  if (!tab.editorInstance) return null

  if (TEXT_MD_EXTENSIONS.includes(extension as any)) {
    // Convert document back to markdown
    // 方案一，采用tiptap自有的转换，目前有不少的错误
    //const json = tab.editorInstance?.getJSON()
    //return renderToMarkdown({ content: json, extensions: tab.editorInstance.extensionManager.extensions })
    // 方案二，采用turndown来转换
    const html = tab.editorInstance.getHTML()
    return turndownService.turndown(html)
  } else if (TEXT_IWT_EXTENSIONS.includes(extension as any)) {
    // Store as JSON + HTML for iWriter files
    const html = tab.editorInstance.getHTML()
    return JSON.stringify({
      version: iwtVersion,
      content: html,
      metadata: {
        lastModified: new Date().toISOString(),
        wordCount: tab.editorInstance?.storage.characterCount?.words() || 0
      }
    })
  } else if (TEXT_TXT_EXTENSIONS.includes(extension as any)) {
    // Plain text
    return tab.editorInstance?.getText()
  } else {
    return null
  }
}
