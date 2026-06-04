import * as pdfjsLib from 'pdfjs-dist'
import { PDFTocProvider } from '@/services/toc/PDFTocProvider'
import type { TocProvider } from '@/types/toc'

// 使用自定义 worker 入口（pdfWorker.ts），在 pdfjs worker 代码求值前注入
// TC39 polyfill（Math.sumPrecise、Map.prototype.getOrInsertComputed）。
// workerPort 方式让我们完全控制 Worker 创建时机和参数。
pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
  new URL('./pdfWorker.ts', import.meta.url),
  { type: 'module' }
)

function resolvePublicUrl(path: string): string {
  return new URL(path, window.location.href).href
}

export class PdfJsPageRenderProvider {
  pdfDocument: pdfjsLib.PDFDocumentProxy | null = null

  async load(source: string): Promise<void> {
    await this.destroy()

    const pdfData = await this.readPdfData(source)
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      cMapUrl: resolvePublicUrl('./cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: resolvePublicUrl('./standard_fonts/'),
      wasmUrl: resolvePublicUrl('./wasm/'),
    })

    const pdf = await loadingTask.promise
    if (!pdf || pdf.numPages === 0) {
      throw new Error('无效的PDF文档')
    }
    this.pdfDocument = pdf
  }

  async destroy(): Promise<void> {
    if (this.pdfDocument) {
      try {
        await this.pdfDocument.destroy()
      } catch {
        // ignore
      } finally {
        this.pdfDocument = null
      }
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
}
