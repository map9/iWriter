import type { Editor } from '@tiptap/core'
import { marked } from 'marked'
import type { Tokens } from 'marked'
import { renderInlineMathHtml, renderBlockMathHtml } from '@/utils/mathDelimiters'
import { transformAlertBlockquotesInHtml } from '@/utils/markdownAlerts'
import { htmlToMarkdown } from './markdownSerializer'

import { TEXT_MD_EXTENSIONS, TEXT_TXT_EXTENSIONS, TEXT_IWT_EXTENSIONS, CODE_EXTENSIONS } from '@/types'

export { htmlToMarkdown } from './markdownSerializer'

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

function detectLineEnding(text: string): 'LF' | 'CRLF' {
  if (text.includes('\r\n')) return 'CRLF'
  return 'LF'
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainTextToHtml(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return normalized
    .split('\n')
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

function applyLineEnding(content: string, lineEnding: 'LF' | 'CRLF' = 'LF'): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return lineEnding === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
}

// marked wraps standalone images as <p><img></p>; since Image is a block node,
// ProseMirror would otherwise split that paragraph and leave an empty one before
// every image. Unwrap paragraphs that contain only a single image to avoid this.
export function unwrapBlockImages(html: string): string {
  return html.replace(/<p>(\s*<img\b[^>]*>\s*)<\/p>/gi, '$1')
}

// marked (per CommonMark) always appends a trailing '\n' to fenced code content.
// TipTap's CodeBlock parses <pre> with preserveWhitespace: 'full', so that newline
// survives as a text node and renders as an empty last line inside the code block.
// Strip the single trailing newline (not trimEnd — keep intentional blank lines).
export function stripCodeBlockTrailingNewline(html: string): string {
  return html.replace(
    /(<pre><code[^>]*>)([\s\S]*?)(<\/code><\/pre>)/gi,
    (_, open, code, close) => open + code.replace(/\n$/, '') + close
  )
}

function prepareMarkdownHtml(html: string): string {
  return transformAlertBlockquotesInHtml(stripCodeBlockTrailingNewline(unwrapBlockImages(html)))
}

// Load content into editor
export async function convertContentFrom(content: string, extension: string) {
  // @ts-expect-error don't report error
  if (TEXT_MD_EXTENSIONS.includes(extension)) {
    // Convert markdown to HTML for TipTap
    return {
      content: prepareMarkdownHtml(await marked(content)),
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
    // Plain text files are represented as one paragraph per source line.
    return {
      content: plainTextToHtml(content),
      lineEnding: detectLineEnding(content)
    }
  // @ts-expect-error don't report error
  } else if (CODE_EXTENSIONS.includes(extension)) {
    // Code files are edited as plain text in the rich editor surface.
    return {
      content: plainTextToHtml(content),
      lineEnding: detectLineEnding(content)
    }
  } else {
    return null
  }
}

export function convertContentTo(editorInstance: Editor, extension: string, lineEnding: 'LF' | 'CRLF' = 'LF'): string | null {
  if (!editorInstance) return null

  // @ts-expect-error don't report error
  if (TEXT_MD_EXTENSIONS.includes(extension)) {
    // Convert document back to markdown
    // 方案一，采用tiptap自有的转换，目前有不少的错误
    //const json = editor.getJSON()
    //return renderToMarkdown({ content: json, extensions: editor.extensionManager.extensions })
    // 方案二，采用turndown来转换
    const html = editorInstance.getHTML()
    return applyLineEnding(htmlToMarkdown(html), lineEnding)
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
    // Plain text - serialize block boundaries as real newlines.
    return applyLineEnding(editorInstance.getText({ blockSeparator: '\n' }), lineEnding)
  // @ts-expect-error don't report error
  } else if (CODE_EXTENSIONS.includes(extension)) {
    // Code files - serialize block boundaries as real newlines.
    return applyLineEnding(editorInstance.getText({ blockSeparator: '\n' }), lineEnding)
  } else {
    return null
  }
}
