import type { TocProvider } from '@/types/toc'

export interface PageSize {
  width: number
  height: number
}

export interface PageRenderProvider {
  load(source: string): Promise<void>
  destroy(): Promise<void>
  getPageCount(): number
  getReferencePageSize(): Promise<PageSize | null>
  renderPage(pageNum: number, zoom: number, renderScale: number): Promise<HTMLCanvasElement | null>
  createTocProvider?(navigateToPage: (pageNumber: number) => void): TocProvider | null
}
