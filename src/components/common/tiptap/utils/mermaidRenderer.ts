import mermaid from 'mermaid'
import { nanoid } from 'nanoid'
import type { MarkdownMermaidTheme } from '@/types'
import { buildMermaidThemeConfig, type ResolvedMermaidColorScheme } from './mermaidTheme'

export type MermaidRenderResult = { svg: string } | { error: string }

let colorCanvas: HTMLCanvasElement | null = null
let colorCanvasContext: CanvasRenderingContext2D | null = null

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function getDynamicColorScheme(): ResolvedMermaidColorScheme {
  const root = document.documentElement
  if (root.dataset.resolvedTheme === 'dark') return 'dark'
  if (root.dataset.resolvedTheme === 'light') return 'light'
  return getComputedStyle(root).colorScheme.includes('dark') ? 'dark' : 'light'
}

/** Resolve CSS variables and CSS Color 4 values to Mermaid-compatible hex. */
export function resolveMermaidCssColor(value: string, scope?: Element | null): string {
  const colorScope = scope ?? document.body
  let resolvedValue = value.trim()

  // Palette variables are commonly declared on the scoped Markdown theme
  // container, rather than on :root. Resolve whole-value var() references from
  // that element before asking Canvas to normalize modern CSS color syntax.
  for (let depth = 0; depth < 8; depth += 1) {
    const variable = resolvedValue.match(/^var\(\s*(--[-\w]+)\s*(?:,\s*(.+))?\)$/)
    if (!variable) break
    const [, name, fallback] = variable
    const customProperty = getComputedStyle(colorScope).getPropertyValue(name!).trim()
    if (!customProperty && !fallback) {
      throw new Error(`Unable to resolve Mermaid color variable ${name}`)
    }
    resolvedValue = customProperty || fallback!.trim()
  }

  if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(resolvedValue)) return resolvedValue

  const probe = document.createElement('span')
  probe.style.position = 'fixed'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.color = resolvedValue
  colorScope.appendChild(probe)
  const computedColor = getComputedStyle(probe).color
  probe.remove()

  colorCanvas ??= document.createElement('canvas')
  colorCanvas.width = 1
  colorCanvas.height = 1
  colorCanvasContext ??= colorCanvas.getContext('2d', { willReadFrequently: true })
  if (!colorCanvasContext) return computedColor

  colorCanvasContext.clearRect(0, 0, 1, 1)
  colorCanvasContext.fillStyle = computedColor
  colorCanvasContext.fillRect(0, 0, 1, 1)
  const [red, green, blue, alpha] = colorCanvasContext.getImageData(0, 0, 1, 1).data
  const hex = `#${toHexByte(red!)}${toHexByte(green!)}${toHexByte(blue!)}`
    + (alpha === 255 ? '' : toHexByte(alpha!))
  return hex
}

let initializedThemeKey: string | null = null
let renderQueue: Promise<void> = Promise.resolve()

/** (Re-)initialize Mermaid from the active Markdown theme. */
export function initMermaid(theme: MarkdownMermaidTheme, colorScope?: Element | null): void {
  const resolved = buildMermaidThemeConfig(theme, {
    dynamicColorScheme: getDynamicColorScheme(),
    resolveColor: value => resolveMermaidCssColor(value, colorScope),
  })
  if (resolved.cacheKey === initializedThemeKey) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    ...resolved.config,
    // 全局关闭 HTML 标签，避免 foreignObject 文本在 max-width/zoom 缩放下被裁切（影响所有图表类型）
    htmlLabels: false,
  })
  initializedThemeKey = resolved.cacheKey
}

function enqueueRender<T>(task: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(task, task)
  renderQueue = result.then(() => undefined, () => undefined)
  return result
}

/**
 * Render a Mermaid diagram source string to an SVG string.
 * Returns { svg } on success or { error } on parse/render failure.
 */
export async function renderMermaid(
  code: string,
  theme: MarkdownMermaidTheme,
  colorScope?: Element | null,
): Promise<MermaidRenderResult> {
  if (!code.trim()) return { error: '' }
  return enqueueRender(async () => {
    try {
      initMermaid(theme, colorScope)
      const id = `mermaid-${nanoid(8)}`
      const { svg } = await mermaid.render(id, code)
      return { svg }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
}
