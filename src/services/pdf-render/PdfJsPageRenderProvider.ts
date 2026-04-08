import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFTocProvider } from '@/services/toc/PDFTocProvider'
import type { PageRenderProvider, PageSize } from '@/services/pdf-render/types'
import type { TocProvider } from '@/types/toc'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function isRenderCancelled(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'RenderingCancelledException' ||
    error.message.includes('Rendering cancelled')
  )
}

export class PdfJsPageRenderProvider implements PageRenderProvider {
  private pdfDocument: pdfjsLib.PDFDocumentProxy | null = null
  private activeRenderTasks = new Map<number, pdfjsLib.RenderTask>()
  private renderedCanvasCache = new Map<string, HTMLCanvasElement>()

  async load(source: string): Promise<void> {
    await this.destroy()

    const pdfData = await this.readPdfData(source)
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      cMapUrl: '/cmaps/',
      cMapPacked: true
    })

    const pdf = await loadingTask.promise
    if (!pdf || pdf.numPages === 0) {
      throw new Error('无效的PDF文档')
    }

    this.pdfDocument = pdf
  }

  async destroy(): Promise<void> {
    const pendingPages = Array.from(this.activeRenderTasks.keys())
    await Promise.allSettled(pendingPages.map(pageNum => this.cancelRenderTask(pageNum)))

    if (this.pdfDocument) {
      try {
        await this.pdfDocument.destroy()
      } catch (error) {
        console.warn('Error destroying PDF document:', error)
      } finally {
        this.pdfDocument = null
      }
    }

    this.renderedCanvasCache.clear()
  }

  getPageCount(): number {
    return this.pdfDocument?.numPages ?? 0
  }

  async getReferencePageSize(): Promise<PageSize | null> {
    if (!this.pdfDocument) return null

    const page = await this.pdfDocument.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    return {
      width: viewport.width,
      height: viewport.height
    }
  }

  async renderPage(pageNum: number, zoom: number, renderScale: number): Promise<HTMLCanvasElement | null> {
    if (!this.pdfDocument) return null
    if (pageNum < 1 || pageNum > this.pdfDocument.numPages) return null

    const cacheKey = `${pageNum}@${zoom}@${renderScale}`
    const cachedCanvas = this.renderedCanvasCache.get(cacheKey)
    if (cachedCanvas) {
      return this.cloneCanvas(cachedCanvas)
    }

    await this.cancelRenderTask(pageNum)

    try {
      const page = await this.pdfDocument.getPage(pageNum)
      const viewport = page.getViewport({ scale: zoom * renderScale })
      const bufferCanvas = document.createElement('canvas')
      bufferCanvas.width = viewport.width
      bufferCanvas.height = viewport.height

      const bufferContext = bufferCanvas.getContext('2d', { willReadFrequently: true })
      if (!bufferContext) return null

      const renderTask = page.render({
        canvasContext: bufferContext,
        canvas: bufferCanvas,
        viewport
      })
      this.activeRenderTasks.set(pageNum, renderTask)

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Page render timeout')), 10000)
      })

      await Promise.race([renderTask.promise, timeoutPromise])
      page.cleanup()

      this.renderedCanvasCache.set(cacheKey, this.cloneCanvas(bufferCanvas))
      return bufferCanvas
    } catch (error) {
      if (!isRenderCancelled(error)) {
        console.error(`Error rendering page ${pageNum}:`, error)
      }
      return null
    } finally {
      this.activeRenderTasks.delete(pageNum)
    }
  }

  createTocProvider(navigateToPage: (pageNumber: number) => void): TocProvider | null {
    if (!this.pdfDocument) return null
    return new PDFTocProvider(this.pdfDocument, navigateToPage)
  }

  private async readPdfData(source: string): Promise<ArrayBuffer> {
    if (source.startsWith('/') || source.match(/^[A-Z]:\\/)) {
      if (!window.electronAPI) {
        throw new Error('Electron API 不可用')
      }

      const base64Content = await window.electronAPI.readFileBinary(source)
      if (!base64Content) {
        throw new Error('无法读取PDF文件')
      }

      const binaryString = atob(base64Content)
      const bytes = new Uint8Array(binaryString.length)
      for (let index = 0; index < binaryString.length; index++) {
        bytes[index] = binaryString.charCodeAt(index)
      }
      return bytes.buffer
    }

    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.arrayBuffer()
  }

  private async cancelRenderTask(pageNum: number): Promise<void> {
    const existingTask = this.activeRenderTasks.get(pageNum)
    if (!existingTask) return

    existingTask.cancel()
    this.activeRenderTasks.delete(pageNum)

    try {
      await existingTask.promise
    } catch (error) {
      if (!isRenderCancelled(error)) {
        console.warn(`Unexpected error while cancelling page ${pageNum} render:`, error)
      }
    }
  }

  private cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
    const target = document.createElement('canvas')
    target.width = source.width
    target.height = source.height
    const context = target.getContext('2d', { willReadFrequently: true })
    context?.drawImage(source, 0, 0)
    return target
  }
}
