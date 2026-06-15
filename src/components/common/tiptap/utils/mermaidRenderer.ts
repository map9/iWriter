import mermaid from 'mermaid'
import { nanoid } from 'nanoid'

export type MermaidRenderResult = { svg: string } | { error: string }

/** Return the Mermaid theme that matches the current app theme. */
function getCurrentMermaidTheme(): 'default' | 'dark' {
  const dataTheme = document.documentElement.getAttribute('data-theme') ?? ''
  // Dark daisyUI themes
  const darkThemes = ['dark', 'sunset', 'abyss', 'dracula']
  return darkThemes.includes(dataTheme) ? 'dark' : 'default'
}

let initializedTheme: 'default' | 'dark' | null = null

/** (Re-)initialize Mermaid with the correct theme. Call on mount and on theme change. */
export function initMermaid(): void {
  const theme = getCurrentMermaidTheme()
  if (theme === initializedTheme) return
  initializedTheme = theme
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    // 全局关闭 HTML 标签，避免 foreignObject 文本在 max-width/zoom 缩放下被裁切（影响所有图表类型）
    htmlLabels: false,
  })
}

/**
 * Forces the next initMermaid() call to re-initialize Mermaid.
 * Call after temporarily overriding the global Mermaid config (e.g. for
 * print rendering with a fixed theme) so the editor's theme isn't left stale.
 */
export function resetMermaidInit(): void {
  initializedTheme = null
}

/**
 * Render a Mermaid diagram source string to an SVG string.
 * Returns { svg } on success or { error } on parse/render failure.
 */
export async function renderMermaid(code: string): Promise<MermaidRenderResult> {
  if (!code.trim()) return { error: '' }
  try {
    initMermaid()
    const id = `mermaid-${nanoid(8)}`
    const { svg } = await mermaid.render(id, code)
    return { svg }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
