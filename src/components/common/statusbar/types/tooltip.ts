/**
 * Tooltip renderer types
 */
export enum TooltipRendererType {
  TEXT = 'text',
  MARKDOWN = 'markdown',
  HTML = 'html',
  CUSTOM = 'custom'
}

/**
 * Command handler interface for processing custom protocol commands
 */
export interface CommandHandler {
  (protocol: string, command: string, args?: any[]): void
}

/**
 * Cleanup function type returned by renderers
 */
export type CleanupFunction = () => void

/**
 * Unified tooltip renderer interface
 */
export interface TooltipRenderer {
  type: TooltipRendererType
  render(container: HTMLElement, commandHandler?: CommandHandler): CleanupFunction | void
}

/**
 * External library adapter interface for markdown and HTML processing
 */
export interface TooltipContentParseAdapter {
  parseMarkdown(content: string): string
  sanitizeHtml(html: string): string
}

/**
 * Unified tooltip content type
 */
export type TooltipContent =
  | string  // Auto-detected as TEXT
  | { type: 'text', content: string }
  | { type: 'markdown', content: string }
  | { type: 'html', content: string }
  | { type: 'custom', renderer: TooltipRenderer }