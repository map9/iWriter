import katex from 'katex'

const KATEX_OPTIONS = {
  throwOnError: false,
  macros: {
    '\\R': '\\mathbb{R}',
    '\\N': '\\mathbb{N}',
  },
} as const

/**
 * Re-renders KaTeX math nodes in TipTap-serialised HTML.
 *
 * `editor.getHTML()` outputs empty containers for math nodes:
 *   block:  <div  data-type="block-math"  data-latex="..."></div>
 *   inline: <span data-type="inline-math" data-latex="..."></span>
 *
 * This function fills them with actual KaTeX HTML so print/PDF contexts
 * that don't run the Vue NodeView can display formulas correctly.
 */
export function renderMathInHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const blocks = doc.querySelectorAll<HTMLElement>('[data-type="block-math"]')
  const inlines = doc.querySelectorAll<HTMLElement>('[data-type="inline-math"]')

  const render = (el: HTMLElement, displayMode: boolean) => {
    const latex = el.getAttribute('data-latex') ?? ''
    try {
      el.innerHTML = katex.renderToString(latex, { ...KATEX_OPTIONS, displayMode })
    } catch {
      el.textContent = latex
      el.classList.add(displayMode ? 'block-math-error' : 'inline-math-error')
    }
    // Required so theme CSS selectors (.tiptap-mathematics-render) apply
    el.classList.add('tiptap-mathematics-render')
  }

  blocks.forEach(el => render(el, true))
  inlines.forEach(el => render(el, false))

  return doc.body.innerHTML
}
