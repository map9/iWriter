import type TurndownService from 'turndown'

export const GITHUB_ALERT_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const
export const IWRITER_ALERT_TYPES = ['BEAT', 'COMMENT'] as const
const SUPPORTED_ALERT_TYPES = new Set<string>([
  ...GITHUB_ALERT_TYPES,
  ...IWRITER_ALERT_TYPES,
])

export const ALERT_MARKER_REGEX = /^\s*\[!([A-Za-z][A-Za-z0-9_-]{0,31})\](?:\s+([\s\S]*))?\s*$/
const ALERT_TYPE_REGEX = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/

const DISPLAY_LABELS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
  BEAT: 'Beat',
  COMMENT: 'Comment',
}

export function normalizeAlertType(type: string | null | undefined): string | null {
  const trimmed = String(type ?? '').trim()
  if (!ALERT_TYPE_REGEX.test(trimmed)) return null
  const normalized = trimmed.toUpperCase()
  return SUPPORTED_ALERT_TYPES.has(normalized) ? normalized : null
}

export function alertTypeToClass(type: string): string {
  const normalized = normalizeAlertType(type)
  const slug = (normalized ?? 'alert').toLowerCase().replace(/_/g, '-')
  return `markdown-alert-${slug}`
}

export function getAlertDisplayLabel(type: string): string {
  const normalized = normalizeAlertType(type)
  if (!normalized) return 'Alert'
  if (DISPLAY_LABELS[normalized]) return DISPLAY_LABELS[normalized]
  return 'Alert'
}

export function parseAlertMarker(text: string): { type: string; rest: string } | null {
  const match = ALERT_MARKER_REGEX.exec(text)
  if (!match) return null

  const type = normalizeAlertType(match[1])
  if (!type) return null

  return {
    type,
    rest: match[2]?.trimStart() ?? '',
  }
}

function closestBlockquote(element: Element): Element | null {
  let current = element.parentElement
  while (current) {
    if (current.tagName === 'BLOCKQUOTE') return current
    current = current.parentElement
  }
  return null
}

function addAlertAttributes(blockquote: Element, type: string): void {
  const classes = new Set((blockquote.getAttribute('class') ?? '').split(/\s+/).filter(Boolean))
  classes.add('markdown-alert')
  classes.add(alertTypeToClass(type))
  blockquote.setAttribute('class', [...classes].join(' '))
  blockquote.setAttribute('data-alert-type', type)
}

function transformBlockquote(blockquote: Element): void {
  const firstElement = blockquote.firstElementChild
  if (!firstElement || firstElement.tagName !== 'P') return

  const marker = parseAlertMarker(firstElement.textContent ?? '')
  if (!marker) return

  addAlertAttributes(blockquote, marker.type)

  if (marker.rest) {
    firstElement.textContent = marker.rest
    return
  }

  if (blockquote.children.length > 1) {
    firstElement.remove()
  } else {
    firstElement.textContent = ''
  }
}

export function transformAlertBlockquotesInHtml(html: string): string {
  if (!html.trim()) return html
  if (typeof document === 'undefined') return html

  const template = document.createElement('template')
  template.innerHTML = html

  const blockquotes = [...template.content.querySelectorAll('blockquote')]
  for (const blockquote of blockquotes) {
    if (closestBlockquote(blockquote)) continue
    transformBlockquote(blockquote)
  }

  return template.innerHTML
}

function prefixBlockquoteLines(markdown: string): string {
  const normalized = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\([\[\]])/g, '$1')
    .trim()
  if (!normalized) return '>'
  return normalized
    .split('\n')
    .map(line => line.trim().length ? `> ${line}` : '>')
    .join('\n')
}

export function configureAlertTurndown(turndownService: TurndownService): void {
  turndownService.addRule('markdownAlert', {
    filter(node) {
      if (node.nodeName !== 'BLOCKQUOTE') return false
      const element = node as HTMLElement
      return !!normalizeAlertType(element.getAttribute('data-alert-type'))
    },
    replacement(content, node) {
      const element = node as HTMLElement
      const type = normalizeAlertType(element.getAttribute('data-alert-type')) ?? 'NOTE'
      const body = prefixBlockquoteLines(content)
      return `\n\n> [!${type}]\n${body}\n\n`
    },
  })
}
