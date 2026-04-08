import type * as pdfjsLib from 'pdfjs-dist'
import type { TocItem, TocProvider, UnsubscribeFn } from '@/types/toc'

interface OutlineMapping {
  id: string
  pageNumber: number
}

interface OutlineNode {
  title?: string
  dest?: string | unknown[] | null
  items?: OutlineNode[]
}

export class PDFTocProvider implements TocProvider {
  private pdfDocument: pdfjsLib.PDFDocumentProxy
  private navigateToPage: (pageNumber: number) => void
  private tocItems: TocItem[]
  private updateCallbacks: Set<(items: TocItem[]) => void>
  private pageMappings: OutlineMapping[]

  isLoading = true

  constructor(pdfDocument: pdfjsLib.PDFDocumentProxy, navigateToPage: (pageNumber: number) => void) {
    this.pdfDocument = pdfDocument
    this.navigateToPage = navigateToPage
    this.tocItems = []
    this.updateCallbacks = new Set()
    this.pageMappings = []
  }

  async load(): Promise<void> {
    this.isLoading = true
    this.emitUpdate()

    try {
      const outline = await this.pdfDocument.getOutline()
      if (!outline || outline.length === 0) {
        this.tocItems = []
        this.pageMappings = []
        return
      }

      const items = await this.flattenOutline(outline as OutlineNode[])
      this.tocItems = items
      this.pageMappings = items
        .map(item => ({
          id: item.id,
          pageNumber: Number(item.metadata?.pageNumber ?? 0)
        }))
        .filter(item => item.pageNumber > 0)
        .sort((a, b) => a.pageNumber - b.pageNumber)
    } catch (error) {
      console.error('Failed to load PDF outline:', error)
      this.tocItems = []
      this.pageMappings = []
    } finally {
      this.isLoading = false
      this.emitUpdate()
    }
  }

  getTocItems(): TocItem[] {
    return this.tocItems
  }

  navigateToItem(id: string): void {
    const pageNumber = Number(this.tocItems.find(item => item.id === id)?.metadata?.pageNumber ?? 0)
    if (pageNumber > 0) {
      this.navigateToPage(pageNumber)
      this.updateActivePage(pageNumber)
    }
  }

  updateActivePage(pageNumber: number): void {
    if (this.tocItems.length === 0) return

    let activeId = this.pageMappings[0]?.id ?? null
    for (const mapping of this.pageMappings) {
      if (mapping.pageNumber <= pageNumber) {
        activeId = mapping.id
      } else {
        break
      }
    }

    if (!activeId) return

    let changed = false
    const nextItems = this.tocItems.map(item => {
      const isActive = item.id === activeId
      if (item.isActive !== isActive) {
        changed = true
      }
      return {
        ...item,
        isActive
      }
    })

    if (!changed) return
    this.tocItems = nextItems
    this.emitUpdate()
  }

  onTocUpdate(callback: (items: TocItem[]) => void): UnsubscribeFn {
    this.updateCallbacks.add(callback)
    callback(this.tocItems)
    return () => {
      this.updateCallbacks.delete(callback)
    }
  }

  destroy(): void {
    this.updateCallbacks.clear()
    this.tocItems = []
    this.pageMappings = []
  }

  private emitUpdate(): void {
    const items = this.tocItems
    this.updateCallbacks.forEach(callback => callback(items))
  }

  private async flattenOutline(nodes: OutlineNode[], depth = 1, path = '0'): Promise<TocItem[]> {
    const results: TocItem[] = []

    for (const [index, node] of nodes.entries()) {
      const nodePath = `${path}-${index}`
      const childItems = node.items && node.items.length > 0
        ? await this.flattenOutline(node.items, depth + 1, nodePath)
        : []
      const ownPageNumber = await this.resolveDestinationPageNumber(node.dest)
      const fallbackPageNumber = Number(childItems[0]?.metadata?.pageNumber ?? 0)
      const pageNumber = ownPageNumber > 0 ? ownPageNumber : fallbackPageNumber
      const title = (node.title || '').trim() || `Section ${results.length + 1}`

      results.push({
        id: `pdf-outline-${nodePath}`,
        title,
        level: depth,
        isActive: false,
        metadata: {
          pageNumber
        }
      })

      if (childItems.length > 0) {
        results.push(...childItems)
      }
    }

    return results
  }

  private async resolveDestinationPageNumber(dest: string | unknown[] | null | undefined): Promise<number> {
    if (!dest) return 0

    try {
      const resolved = typeof dest === 'string'
        ? await this.pdfDocument.getDestination(dest)
        : dest

      if (!resolved || !Array.isArray(resolved) || resolved.length === 0) {
        return 0
      }

      const target = resolved[0]
      if (typeof target === 'number') {
        return target + 1
      }

      if (target && typeof target === 'object') {
        const cachedPageNumber = this.pdfDocument.cachedPageNumber(
          target as Parameters<pdfjsLib.PDFDocumentProxy['cachedPageNumber']>[0]
        )
        if (cachedPageNumber && cachedPageNumber > 0) {
          return cachedPageNumber
        }

        const pageIndex = await this.pdfDocument.getPageIndex(
          target as Parameters<pdfjsLib.PDFDocumentProxy['getPageIndex']>[0]
        )
        return pageIndex + 1
      }
    } catch (error) {
      console.warn('Failed to resolve PDF outline destination:', error)
    }

    return 0
  }
}
