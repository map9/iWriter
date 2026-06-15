import mermaid from 'mermaid'
import { nanoid } from 'nanoid'
import { resetMermaidInit } from '@/components/common/tiptap/utils/mermaidRenderer'

/**
 * Pre-renders Mermaid code blocks in TipTap-serialised HTML into SVG.
 *
 * `editor.getHTML()` outputs Mermaid blocks as plain code:
 *   <pre><code class="language-mermaid">graph TD...</code></pre>
 *
 * Print/PDF contexts don't run the Vue NodeView, so this fills them with
 * actual SVG. Always renders with the light 'default' theme since all print
 * themes use a light page background, regardless of the editor's screen theme.
 */
export async function renderMermaidInHtml(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = Array.from(doc.querySelectorAll<HTMLElement>('pre > code.language-mermaid'))
  if (!blocks.length) return html

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
    htmlLabels: false,
  })

  for (const code of blocks) {
    const pre = code.parentElement
    if (!pre) continue
    const source = code.textContent ?? ''
    const wrapper = doc.createElement('div')
    wrapper.className = 'mermaid-print'
    if (source.trim()) {
      try {
        const { svg } = await mermaid.render(`mermaid-print-${nanoid(8)}`, source)
        wrapper.innerHTML = svg
      } catch (e) {
        wrapper.classList.add('mermaid-print-error')
        wrapper.textContent = e instanceof Error ? e.message : String(e)
      }
    }
    pre.replaceWith(wrapper)
  }

  // Restore the editor's Mermaid theme on next render now that print is done.
  resetMermaidInit()

  return doc.body.innerHTML
}
