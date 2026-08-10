import type { MarkdownMermaidTheme } from '@/types'
import { renderMermaid } from '@/components/common/tiptap/utils/mermaidRenderer'

/**
 * Pre-renders Mermaid code blocks in TipTap-serialised HTML into SVG.
 *
 * `editor.getHTML()` outputs Mermaid blocks as plain code:
 *   <pre><code class="language-mermaid">graph TD...</code></pre>
 *
 * Print/PDF contexts don't run the Vue NodeView, so this fills them with
 * actual SVG using the effective Markdown print theme.
 */
export async function renderMermaidInHtml(
  html: string,
  theme: MarkdownMermaidTheme,
): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = Array.from(doc.querySelectorAll<HTMLElement>('pre > code.language-mermaid'))
  if (!blocks.length) return html

  for (const code of blocks) {
    const pre = code.parentElement
    if (!pre) continue
    const source = code.textContent ?? ''
    const wrapper = doc.createElement('div')
    wrapper.className = 'mermaid-print'
    if (source.trim()) {
      const result = await renderMermaid(source, theme)
      if ('svg' in result) {
        wrapper.innerHTML = result.svg
      } else {
        wrapper.classList.add('mermaid-print-error')
        wrapper.textContent = result.error
      }
    }
    pre.replaceWith(wrapper)
  }

  return doc.body.innerHTML
}
