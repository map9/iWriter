import type { TooltipContentParseAdapter } from '../types/tooltip'

/**
 * Default external library adapter implementation
 * Provides markdown parsing and HTML sanitization with graceful fallbacks
 */
export class DefaultTooltipContentParseAdapter implements TooltipContentParseAdapter {
  private marked: { parse: (content: string) => string } | null = null
  private DOMPurify: { sanitize: (html: string, config?: Record<string, unknown>) => string } | null = null
  private initialized = false

  constructor() {
    this.initializeLibraries()
  }

  private async initializeLibraries(): Promise<void> {
    if (this.initialized) return

    // For now, just use fallback implementations
    // External libraries can be added later by users if needed
    this.marked = null
    this.DOMPurify = null
    this.initialized = true
  }

  parseMarkdown(content: string): string {
    if (this.marked) {
      try {
        return this.marked!.parse(content)
      } catch (error) {
        console.error('Marked parsing failed, falling back to basic parser:', error)
      }
    }

    // Fallback to basic markdown parsing
    return this.basicMarkdownParse(content)
  }

  sanitizeHtml(html: string): string {
    if (this.DOMPurify) {
      try {
        return this.DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 'del', 'code', 'pre',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'blockquote', 'hr',
            'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'div', 'span', 'button'
          ],
          ALLOWED_ATTR: [
            'href', 'title', 'alt', 'src', 'width', 'height',
            'class', 'id', 'data-command', 'role', 'tabindex',
            'target', 'rel', 'style'
          ],
          ALLOW_DATA_ATTR: true,
          ADD_ATTR: ['target', 'rel'],
          ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|xxx):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
        })
      } catch (error) {
        console.error('DOMPurify sanitization failed, falling back to basic sanitizer:', error)
      }
    }

    // Fallback to basic HTML sanitization
    return this.basicHtmlSanitize(html)
  }

  private basicMarkdownParse(content: string): string {
    let html = content

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')

    // Bold, italic, strikethrough
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>')

    // Code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
    html = html.replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```(\w+)?\n?/, '').replace(/```$/, '')
      return `<pre><code>${this.escapeHtml(code.trim())}</code></pre>`
    })

    // Links and images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width: 100%; height: auto;">')
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

    // Lists
    html = html.replace(/^\* (.*)$/gim, '<li>$1</li>')
    html = html.replace(/^(\d+)\. (.*)$/gim, '<li>$2</li>')
    html = html.replace(/(<li>.*<\/li>)/s, (match) => {
      // Simple heuristic to determine if it's ordered or unordered
      return content.includes('1. ') ? `<ol>${match}</ol>` : `<ul>${match}</ul>`
    })

    // Blockquotes
    html = html.replace(/^> (.*)$/gim, '<blockquote>$1</blockquote>')

    // Horizontal rules
    html = html.replace(/^---$/gim, '<hr>')

    // Line breaks
    html = html.replace(/\n/g, '<br>')

    return html
  }

  private basicHtmlSanitize(html: string): string {
    // Remove dangerous tags and attributes
    let sanitized = html

    // Remove script tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

    // Remove dangerous event handlers
    sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')

    // Remove javascript: and data: protocols (except images)
    sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '')
    sanitized = sanitized.replace(/src\s*=\s*["'](?!data:image\/)[^"']*data:[^"']*["']/gi, '')

    // Remove style attributes that might contain dangerous CSS
    sanitized = sanitized.replace(/style\s*=\s*["'][^"']*(?:expression|javascript|behavior)[^"']*["']/gi, '')

    return sanitized
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

// Global adapter instance
let globalAdapter: TooltipContentParseAdapter | null = null

/**
 * Get the current external library adapter
 */
export function getTooltipContentParseAdapter(): TooltipContentParseAdapter {
  if (!globalAdapter) {
    globalAdapter = new DefaultTooltipContentParseAdapter()
  }
  return globalAdapter
}

/**
 * Set a custom external library adapter
 */
export function setTooltipContentParseAdapter(adapter: TooltipContentParseAdapter): void {
  globalAdapter = adapter
}

/**
 * Initialize the default adapter with external libraries
 * This can be called during app startup to preload libraries
 */
export async function initializeDefaultTooltipContentParseAdapter(): Promise<void> {
  const adapter = new DefaultTooltipContentParseAdapter()
  setTooltipContentParseAdapter(adapter)
}