import { TooltipRendererType } from '../types/tooltip'
import type {
  TooltipRenderer,
  TooltipContent,
  CommandHandler,
  CleanupFunction,
} from '../types/tooltip'

/**
 * Link processor utility class - handles custom protocol links and URL validation
 */
export class LinkProcessor {
  static processCustomLinks(html: string): string {
    const temp = document.createElement('div')
    temp.innerHTML = html

    const links = temp.querySelectorAll('a[href]')
    links.forEach(link => {
      const href = link.getAttribute('href')
      if (href && this.isCustomProtocol(href)) {
        link.setAttribute('data-command', href)
        link.classList.add('tooltip-command-link')
        link.removeAttribute('href')
        link.setAttribute('role', 'button')
        link.setAttribute('tabindex', '0')
      } else if (href && this.isStandardUrl(href)) {
        link.setAttribute('target', '_blank')
        link.setAttribute('rel', 'noopener noreferrer')
      }
    })

    // Process other command elements (for HTML renderer)
    const commandElements = temp.querySelectorAll('[data-command]')
    commandElements.forEach(element => {
      if (!element.classList.contains('tooltip-command-link')) {
        element.classList.add('tooltip-command-element')
        element.setAttribute('role', 'button')
        element.setAttribute('tabindex', '0')
      }
    })

    return temp.innerHTML
  }

  static isCustomProtocol(url: string): boolean {
    const customProtocolRegex = /^[a-z][a-z0-9+.-]*:\/\//i
    const standardProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'ftp:']

    if (!customProtocolRegex.test(url)) {
      return false
    }

    const protocol = url.split('://')[0] + ':'
    return !standardProtocols.includes(protocol)
  }

  static isStandardUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:']
      return allowedProtocols.includes(urlObj.protocol)
    } catch {
      return false
    }
  }
}

/**
 * Command handler setup utility class - manages event listeners for command elements
 */
export class CommandHandlerSetup {
  static setup(container: HTMLElement, commandHandler: CommandHandler): CleanupFunction {
    const commandElements = container.querySelectorAll('.tooltip-command-link, .tooltip-command-element')
    const listeners: Array<{ element: Element, handler: EventListener }> = []

    commandElements.forEach(element => {
      const clickHandler = (e: Event) => {
        e.preventDefault()
        const command = (element as HTMLElement).dataset.command
        if (command) {
          this.handleCommand(command, commandHandler)
        }
      }

      const keyHandler = (e: Event) => {
        const ke = e as KeyboardEvent
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault()
          clickHandler(e)
        }
      }

      element.addEventListener('click', clickHandler)
      element.addEventListener('keydown', keyHandler)

      listeners.push(
        { element, handler: clickHandler },
        { element, handler: keyHandler }
      )
    })

    return () => {
      listeners.forEach(({ element, handler }) => {
        element.removeEventListener('click', handler)
        element.removeEventListener('keydown', handler)
      })
    }
  }

  static handleCommand(url: string, commandHandler: CommandHandler): void {
    try {
      const parsedUrl = new URL(url)
      const protocol = parsedUrl.protocol.slice(0, -1)
      const command = parsedUrl.pathname.slice(1) || parsedUrl.host

      const args: any[] = []
      parsedUrl.searchParams.forEach((value, key) => {
        try {
          const parsed = JSON.parse(value)
          args.push({ [key]: parsed })
        } catch {
          args.push({ [key]: value })
        }
      })

      commandHandler(protocol, command, args.length > 0 ? args : undefined)
    } catch (error) {
      console.error('Failed to parse command URL:', url, error)
    }
  }
}

/**
 * TEXT renderer - supports plain text with line breaks
 */
export class TextRenderer implements TooltipRenderer {
  type = TooltipRendererType.TEXT

  constructor(private content: string) {}

  render(container: HTMLElement, commandHandler?: CommandHandler): void {
    // Handle line breaks
    const lines = this.content.split('\n')

    lines.forEach((line, index) => {
      if (index > 0) {
        container.appendChild(document.createElement('br'))
      }

      if (line.trim()) {
        const textNode = document.createTextNode(line)
        container.appendChild(textNode)
      }
    })
  }
}

/**
 * MARKDOWN renderer - uses external library for parsing, supports custom commands
 */
export class MarkdownRenderer implements TooltipRenderer {
  type = TooltipRendererType.MARKDOWN

  constructor(private content: string) {}

  render(container: HTMLElement, commandHandler?: CommandHandler): CleanupFunction | void {
    try {
      const libAdapter = getTooltipContentParseAdapter()

      // Parse markdown using external library
      const html = libAdapter.parseMarkdown(this.content)

      // Process custom protocol links using utility class
      const processedHtml = LinkProcessor.processCustomLinks(html)

      // Set HTML content
      container.innerHTML = processedHtml

      // Setup command handlers using utility class
      if (commandHandler) {
        return CommandHandlerSetup.setup(container, commandHandler)
      }
    } catch (error) {
      console.error('Markdown rendering failed:', error)
      // Fallback to plain text
      container.textContent = this.content
    }
  }
}

/**
 * HTML renderer - uses external library for sanitization, supports custom commands
 */
export class HtmlRenderer implements TooltipRenderer {
  type = TooltipRendererType.HTML

  constructor(private content: string) {}

  render(container: HTMLElement, commandHandler?: CommandHandler): CleanupFunction | void {
    try {
      const libAdapter = getTooltipContentParseAdapter()

      // Sanitize HTML using external library
      const sanitizedHtml = libAdapter.sanitizeHtml(this.content)

      // Process custom protocol links using utility class
      const processedHtml = LinkProcessor.processCustomLinks(sanitizedHtml)

      // Set sanitized HTML
      container.innerHTML = processedHtml

      // Setup command handlers using utility class
      if (commandHandler) {
        return CommandHandlerSetup.setup(container, commandHandler)
      }
    } catch (error) {
      console.error('HTML rendering failed:', error)
      // Fallback to plain text
      container.textContent = this.stripHtml(this.content)
    }
  }

  private stripHtml(html: string): string {
    const temp = document.createElement('div')
    temp.innerHTML = html
    return temp.textContent || temp.innerText || ''
  }
}

/**
 * Content parser to convert TooltipContent to TooltipRenderer
 */
export class TooltipContentParser {
  static parse(content: TooltipContent): TooltipRenderer {
    if (typeof content === 'string') {
      return new TextRenderer(content)
    }

    switch (content.type) {
      case 'text':
        return new TextRenderer(content.content)
      case 'markdown':
        return new MarkdownRenderer(content.content)
      case 'html':
        return new HtmlRenderer(content.content)
      case 'custom':
        return content.renderer
      default:
        throw new Error(`Unsupported tooltip content type`)
    }
  }
}

// Import external library adapter
import { getTooltipContentParseAdapter } from './tooltipContentParseAdapter.ts'