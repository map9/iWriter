import { Editor } from '@tiptap/core'
import { marked } from 'marked'
import type { Tokens } from 'marked'
import TurndownService from 'turndown'
import { gfm } from '@guyplusplus/turndown-plugin-gfm'
import { renderInlineMathHtml, renderBlockMathHtml } from '@/utils/mathDelimiters'

import { TEXT_MD_EXTENSIONS, TEXT_TXT_EXTENSIONS, TEXT_IWT_EXTENSIONS, CODE_EXTENSIONS } from '@/types'

const iwtVersion = '1.0.0'

function mathRenderer(render: (latex: string) => string) {
  return (t: Tokens.Generic) => render(String(t['latex'] ?? ''))
}

// Register math delimiter extensions for marked (block rules must precede inline)
marked.use({
  extensions: [
    {
      name: 'mathBlockBracket',
      level: 'block' as const,
      start(src: string) { return src.indexOf('\\[') },
      tokenizer(src: string) {
        const m = /^\\\[([\s\S]+?)\\\]/.exec(src)
        if (!m) return undefined
        return { type: 'mathBlockBracket', raw: m[0] ?? '', latex: (m[1] ?? '').trim() }
      },
      renderer: mathRenderer((l) => renderBlockMathHtml(l) + '\n'),
    },
    {
      name: 'mathBlockDollar',
      level: 'block' as const,
      start(src: string) { return src.indexOf('$$') },
      tokenizer(src: string) {
        const m = /^\$\$([\s\S]+?)\$\$/.exec(src)
        if (!m) return undefined
        return { type: 'mathBlockDollar', raw: m[0] ?? '', latex: (m[1] ?? '').trim() }
      },
      renderer: mathRenderer((l) => renderBlockMathHtml(l) + '\n'),
    },
    {
      name: 'mathInlineParen',
      level: 'inline' as const,
      start(src: string) { return src.indexOf('\\(') },
      tokenizer(src: string) {
        const m = /^\\\(([^\n]+?)\\\)/.exec(src)
        if (!m) return undefined
        return { type: 'mathInlineParen', raw: m[0] ?? '', latex: m[1] ?? '' }
      },
      renderer: mathRenderer(renderInlineMathHtml),
    },
    {
      name: 'mathInlineDollar',
      level: 'inline' as const,
      start(src: string) { return src.indexOf('$') },
      tokenizer(src: string) {
        const m = /^\$(?!\d+\$)([^\n$]+?)\$(?!\d)/.exec(src)
        if (!m) return undefined
        return { type: 'mathInlineDollar', raw: m[0] ?? '', latex: m[1] ?? '' }
      },
      renderer: mathRenderer(renderInlineMathHtml),
    },
  ],
})

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

function detectLineEnding(text: string): 'LF' | 'CRLF' {
  if (text.includes('\r\n')) return 'CRLF'
  return 'LF'
}

// Load content into editor
export async function convertContentFrom(content: string, extension: string) {
  // @ts-expect-error don't report error
  if (TEXT_MD_EXTENSIONS.includes(extension)) {
    // Convert markdown to HTML for TipTap
    return {
      content: await marked(content),
      lineEnding: detectLineEnding(content)
    }
  // @ts-expect-error don't report error
  } else if (TEXT_IWT_EXTENSIONS.includes(extension)) {
    // iWriter files are stored as JSON with HTML content
    if (content.trim().length === 0) {
      return {
        content: '',
        lineEnding: 'LF' as const
      }
    }

    try {
      const parsed = JSON.parse(content)
      return {
        content: parsed.content || '',
        lineEnding: detectLineEnding(content)
      }
    } catch {
      return null
    }
  // @ts-expect-error don't report error
  } else if (TEXT_TXT_EXTENSIONS.includes(extension)) {
    // 纯文本文件：包裹在 <p> 标签中以便 TipTap 处理
    return {
      content: `<p>${content}</p>`,
      lineEnding: detectLineEnding(content)
    }
  // @ts-expect-error don't report error
  } else if (CODE_EXTENSIONS.includes(extension)) {
    // 代码文件：按纯文本处理（包裹在 <p> 标签中）
    return {
      content: `<p>${content}</p>`,
      lineEnding: detectLineEnding(content)
    }
  } else {
    return null
  }
}

/** Convert HTML string to Markdown using the shared turndown instance (GFM-enabled). */
export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html)
}

 
export function convertContentTo(editorInstance: Editor, extension: string, _lineEnding?: 'LF' | 'CRLF'): string | null {
  if (!editorInstance) return null

  // @ts-expect-error don't report error
  if (TEXT_MD_EXTENSIONS.includes(extension)) {
    // Convert document back to markdown
    // 方案一，采用tiptap自有的转换，目前有不少的错误
    //const json = editor.getJSON()
    //return renderToMarkdown({ content: json, extensions: editor.extensionManager.extensions })
    // 方案二，采用turndown来转换
    const html = editorInstance.getHTML()
    return turndownService.turndown(html)
  // @ts-expect-error don't report error
  } else if (TEXT_IWT_EXTENSIONS.includes(extension)) {
    // Store as JSON + HTML for iWriter files
    const html = editorInstance.getHTML()
    return JSON.stringify({
      version: iwtVersion,
      content: html,
      metadata: {
        lastModified: new Date().toISOString(),
        wordCount: editorInstance.storage.characterCount?.words() || 0
      }
    })
  // @ts-expect-error don't report error
  } else if (TEXT_TXT_EXTENSIONS.includes(extension)) {
    // Plain text - 使用 getText() 保留换行符
    return editorInstance.getText()
  // @ts-expect-error don't report error
  } else if (CODE_EXTENSIONS.includes(extension)) {
    // 代码文件 - 使用 getText() 保留原始格式
    return editorInstance.getText()
  } else {
    return null
  }
}
