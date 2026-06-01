import type { TooltipContent, CommandHandler, CleanupFunction } from '../types/tooltip'
import { TooltipContentParser } from './tooltipRenderers'

/**
 * Enhanced Tooltip Manager
 * Complete tooltip implementation with support for multiple content types and command handling
 */
export class TooltipManager {
  private tooltipEl: HTMLElement | null = null
  private showTimer: number | null = null
  private hideTimer: number | null = null
  private currentTarget: HTMLElement | null = null
  private currentCleanup: CleanupFunction | null = null
  private isLocked = false
  private commandHandler?: CommandHandler
  
  private readonly GAP = 8 // Gap between tooltip and target
  private readonly ARROW_GUTTER = 8 // Minimum distance from arrow to tooltip edge
  private readonly SHOW_DELAY = 750 // VSCode-like delay
  private readonly HIDE_DELAY = 100
  
  constructor(commandHandler?: CommandHandler) {
    this.commandHandler = commandHandler
    this.setupKeyListener()
    this.setupScrollListener()
    this.injectTooltipCSS()
  }

  /**
   * Show tooltip for target element
   */
  show(content: TooltipContent, targetElement: HTMLElement): void {
    this.clearTimers()
    this.currentTarget = targetElement
    
    this.showTimer = window.setTimeout(() => {
      this.displayTooltip(content, targetElement)
    }, this.SHOW_DELAY)
  }

  /**
   * Hide tooltip
   */
  hide(): void {
    // Don't hide if locked or has links
    if (this.isLocked/* || this.hasLinks()*/) {
      return
    }
    
    this.clearTimers()
    this.hideTimer = window.setTimeout(() => {
      this.hideTooltip()
    }, this.HIDE_DELAY)
  }

  /**
   * Force hide tooltip
   */
  forceHide(): void {
    this.isLocked = false
    this.clearTimers()
    this.hideTooltip()
  }

  /**
   * Lock tooltip (Alt key behavior)
   */
  lock(): void {
    this.isLocked = true
  }

  /**
   * Unlock tooltip
   */
  unlock(): void {
    this.isLocked = false
    // Auto hide if should not stay visible
    if (true/*!this.hasLinks()*/) {
      this.hide()
    }
  }

  /**
   * Create or get tooltip element
   */
  private createTooltipElement(): HTMLElement {
    if (this.tooltipEl) {
      return this.tooltipEl
    }
      
    const tooltip = document.createElement('div')
    tooltip.innerHTML = `
      <div class="iw-tooltip">
        <div class="iw-tooltip-content"></div>
      </div>
    `

    // Add to body
    document.body.appendChild(tooltip)
    this.tooltipEl = tooltip
    
    // Add mouse events for persistent tooltips
    tooltip.addEventListener('mouseenter', () => {
      this.clearTimers()
    })
    
    tooltip.addEventListener('mouseleave', () => {
      this.hide()
    })

    return tooltip
  }

  /**
   * Delete tooltip element
   */
  private deleteTooltipElement() {
    if (this.tooltipEl) {
      document.body.removeChild(this.tooltipEl)
      this.tooltipEl = null
    }
  }

  /**
   * Inject CSS styles for tooltip
   */
  private injectTooltipCSS(): void {
    if (document.getElementById('iw-tooltip-styles')) {
      return
    }

    const style = document.createElement('style')
    style.id = 'iw-tooltip-styles'
    style.textContent = `
      .iw-tooltip {
        position: fixed;
        z-index: 10000;
        max-width: 400px;
        min-width: 100px;
        background: var(--color-neutral, rgba(30, 30, 30, 0.95));
        color: var(--color-neutral-content, #cccccc);
        border: var(--border, 1px) solid color-mix(in oklab, var(--color-neutral-content, #cccccc) 15%, transparent);
        border-radius: var(--radius-field, 4px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.5;
        pointer-events: auto;
        opacity: 0;
        transition: opacity 150ms ease-out, transform 150ms ease-out;
        --arrow-left: 50%;
        --arrow-top: 50%;
      }
      /* Arrow using pseudo-element */
      .iw-tooltip::after {
        content: "";
        position: absolute;
        width: 0;
        height: 0;
        pointer-events: none;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
      }

      /* Top placement: tooltip above target, arrow points down */
      .iw-tooltip[data-placement="top"]::after {
        bottom: -6px;
        left: var(--arrow-left);
        transform: translateX(-50%);
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid var(--color-neutral, rgba(30, 30, 30, 0.95));
      }

      /* Bottom placement: tooltip below target, arrow points up */
      .iw-tooltip[data-placement="bottom"]::after {
        top: -6px;
        left: var(--arrow-left);
        transform: translateX(-50%);
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-bottom: 6px solid var(--color-neutral, rgba(30, 30, 30, 0.95));
      }

      /* Left placement: tooltip left of target, arrow points right */
      .iw-tooltip[data-placement="left"]::after {
        right: -6px;
        top: var(--arrow-top);
        transform: translateY(-50%);
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
        border-left: 6px solid var(--color-neutral, rgba(30, 30, 30, 0.95));
      }

      /* Right placement: tooltip right of target, arrow points left */
      .iw-tooltip[data-placement="right"]::after {
        left: -6px;
        top: var(--arrow-top);
        transform: translateY(-50%);
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
        border-right: 6px solid var(--color-neutral, rgba(30, 30, 30, 0.95));
      }

      /* Markdown content styles */
      .iw-tooltip-content {
        padding: 8px 12px;
        word-wrap: break-word;
      }

      /* Markdown content styles */
      .iw-tooltip-content .text-content {
        white-space: pre-wrap;
      }

      .iw-tooltip-content a {
        color: var(--color-neutral-content, #4fc3f7);
        text-decoration: underline;
      }

      .iw-tooltip-content a:hover {
        text-decoration: underline;
      }

      .iw-tooltip-content strong {
        font-weight: 600;
      }

      .iw-tooltip-content em {
        font-style: italic;
      }

      .iw-tooltip-content code {
        background: color-mix(in oklab, var(--color-neutral-content) 15%, transparent);
        border: 1px solid color-mix(in oklab, var(--color-neutral-content) 25%, transparent);
        border-radius: 3px;
        padding: 1px 4px;
        font-family: var(--font-mono, Consolas, "Courier New", monospace);
        font-size: 10px;
      }

      .iw-tooltip-content .codicon {
        font-family: codicon;
        display: inline-block;
        vertical-align: middle;
        font-size: 14px;
        margin-right: 4px;
      }

      .iw-tooltip.show {
        opacity: 1 !important;
      }
      
      .iw-tooltip:not(.show) {
        pointer-events: none;
      }
    `
    
    document.head.appendChild(style)
  }

  /**
   * Set or update the command handler
   */
  setCommandHandler(handler: CommandHandler): void {
    this.commandHandler = handler
  }

  /**
   * Display tooltip with content
   */
  private displayTooltip(content: TooltipContent, targetElement: HTMLElement): void {
    const tooltip = this.createTooltipElement()
    const container = tooltip.firstElementChild as HTMLElement
    const contentEl = container.querySelector('.iw-tooltip-content') as HTMLElement

    // Clear previous content and cleanup
    if (this.currentCleanup) {
      this.currentCleanup()
      this.currentCleanup = null
    }
    contentEl.innerHTML = ''

    // Parse content to renderer and render with command handler
    try {
      const renderer = TooltipContentParser.parse(content)
      const cleanup = renderer.render(contentEl, this.commandHandler)

      // Store cleanup function
      if (cleanup) {
        this.currentCleanup = cleanup
      }
    } catch (error) {
      console.error('Tooltip rendering failed:', error)
      // Fallback to simple text
      contentEl.textContent = typeof content === 'string' ? content : 'Error rendering tooltip'
    }

    // Position tooltip off-screen for measurement
    container.style.left = '0px'
    container.style.top = '-9999px'

    // Force reflow to get accurate measurements
    void container.offsetHeight

    // Calculate position and placement
    const rect = container.getBoundingClientRect()

    const { position, placement, arrowLeft, arrowTop } = this.calculatePosition(
      targetElement, 
      rect.width, 
      rect.height
    )

    // Apply final position
    container.style.left = `${position.x}px`
    container.style.top = `${position.y}px`
    container.setAttribute('data-placement', placement)

    // Set arrow position
    if (arrowLeft !== undefined) {
      container.style.setProperty('--arrow-left', `${arrowLeft}px`)
    }
    if (arrowTop !== undefined) {
      container.style.setProperty('--arrow-top', `${arrowTop}px`)
    }

    // Show with animation
    requestAnimationFrame(() => {
      container.classList.add('show')
    })
  }

  /**
   * Calculate optimal position and placement
   */
  private calculatePosition(targetElement: HTMLElement, tooltipWidth: number, tooltipHeight: number) {
    const targetRect = targetElement.getBoundingClientRect()
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)

    // Calculate available space in each direction
    const space = {
      top: targetRect.top,
      bottom: vh - targetRect.bottom,
      left: targetRect.left,
      right: vw - targetRect.right
    }

    // Choose placement based on available space
    const preferOrder = ['top', 'bottom', 'right', 'left'] as const
    let placement = preferOrder.find(p => {
      if (p === 'top') return space.top >= tooltipHeight + this.GAP
      if (p === 'bottom') return space.bottom >= tooltipHeight + this.GAP
      if (p === 'left') return space.left >= tooltipWidth + this.GAP
      if (p === 'right') return space.right >= tooltipWidth + this.GAP
      return false
    })

    // If no space is enough, choose the largest available
    if (!placement) {
      placement = Object.keys(space).reduce((a, b) => 
        space[a as keyof typeof space] > space[b as keyof typeof space] ? a : b
      ) as typeof preferOrder[number]
    }

    // Calculate tooltip position
    let left = 0, top = 0
    const centerX = targetRect.left + targetRect.width / 2
    const centerY = targetRect.top + targetRect.height / 2

    if (placement === 'top') {
      top = targetRect.top - tooltipHeight - this.GAP
      left = centerX - tooltipWidth / 2
    } else if (placement === 'bottom') {
      top = targetRect.bottom + this.GAP
      left = centerX - tooltipWidth / 2
    } else if (placement === 'left') {
      left = targetRect.left - tooltipWidth - this.GAP
      top = centerY - tooltipHeight / 2
    } else { // right
      left = targetRect.right + this.GAP
      top = centerY - tooltipHeight / 2
    }

    // Keep inside viewport with margin
    const MARGIN = 8
    left = Math.max(MARGIN, Math.min(left, vw - tooltipWidth - MARGIN))
    top = Math.max(MARGIN, Math.min(top, vh - tooltipHeight - MARGIN))

    // Calculate arrow position AFTER viewport constraining
    let arrowLeft: number | undefined
    let arrowTop: number | undefined

    if (placement === 'top' || placement === 'bottom') {
      const targetCenterX = targetRect.left + targetRect.width / 2
      arrowLeft = this.clamp(targetCenterX - left, this.ARROW_GUTTER, tooltipWidth - this.ARROW_GUTTER)
    } else {
      const targetCenterY = targetRect.top + targetRect.height / 2
      arrowTop = this.clamp(targetCenterY - top, this.ARROW_GUTTER, tooltipHeight - this.ARROW_GUTTER)
    }

    return {
      position: { x: Math.round(left), y: Math.round(top) },
      placement,
      arrowLeft,
      arrowTop
    }
  }

  /**
   * Hide tooltip
   */
  private hideTooltip(): void {
    // Call cleanup function if exists
    if (this.currentCleanup) {
      this.currentCleanup()
      this.currentCleanup = null
    }

    if (this.tooltipEl) {
      const container = this.tooltipEl.firstElementChild as HTMLElement
      container.classList.remove('show')
      
      /*
      // Remove from DOM after animation
      setTimeout(() => {
        if (this.tooltipEl && !container.classList.contains('show')) {
          this.deleteTooltipElement()
        }
      }, 200)
      */
    }
    
    this.currentTarget = null
  }

  /**
   * Check if current tooltip has links
   */
  private hasLinks(): boolean {
    if (!this.tooltipEl) return false
    
    const content = this.tooltipEl.querySelector('.iw-tooltip-content')
    return content ? content.querySelectorAll('a').length > 0 : false
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer)
      this.showTimer = null
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }

  /**
   * Setup keyboard listener for Alt key
   */
  private setupKeyListener(): void {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && !this.isLocked && this.tooltipEl) {
        this.lock()
      }
    })

    document.addEventListener('keyup', (e) => {
      if (!e.altKey && this.isLocked) {
        this.unlock()
      }
    })

    // Hide on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.tooltipEl) {
        this.forceHide()
      }
    })
  }

  /**
   * Setup scroll/resize listener for repositioning
   */
  private setupScrollListener(): void {
    let rafId: number | null = null
    
    const reposition = () => {
      if (this.tooltipEl && this.currentTarget) {
        // 检查目标元素是否还在DOM中
        if (!document.contains(this.currentTarget)) {
          // 即使在锁定状态下也强制隐藏
          this.forceHide()
          return
        }
        
        // Recalculate position
        const container = this.tooltipEl.firstElementChild as HTMLElement
        const rect = container.getBoundingClientRect()
        const { position, arrowLeft, arrowTop } = this.calculatePosition(
          this.currentTarget,
          rect.width,
          rect.height
        )
        
        container.style.left = `${position.x}px`
        container.style.top = `${position.y}px`
        
        if (arrowLeft !== undefined) {
          container.style.setProperty('--arrow-left', `${arrowLeft}px`)
        }
        if (arrowTop !== undefined) {
          container.style.setProperty('--arrow-top', `${arrowTop}px`)
        }
      }
    }

    const scheduleReposition = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        reposition()
        rafId = null
      })
    }

    window.addEventListener('resize', scheduleReposition, { passive: true })
    window.addEventListener('scroll', scheduleReposition, { passive: true })
  }

  /**
   * Utility functions
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Cleanup on destroy
   */
  dispose(): void {
    this.clearTimers()
    this.hideTooltip()
    this.deleteTooltipElement()

    // Remove global styles
    const styles = document.getElementById('iw-tooltip-styles')
    if (styles) {
      document.head.removeChild(styles)
    }
  }
}

// Export singleton instance (backward compatibility)
export const tooltipManager = new TooltipManager()

// Export factory function for creating instances with command handlers
export function createTooltipManager(commandHandler?: CommandHandler): TooltipManager {
  return new TooltipManager(commandHandler)
}