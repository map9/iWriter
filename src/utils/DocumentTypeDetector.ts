import type { DocumentType, DocumentTypeDetector } from '@/types'
import { DocumentType as DocType, IMAGE_EXTENSIONS, PDF_EXTENSIONS, TEXT_EXTENSIONS } from '@/types'
import { ErrorHandler } from './ErrorHandler'

/**
 * 文档类型检测器
 * 根据文件路径、扩展名或MIME类型检测文档类型
 */
export class DefaultDocumentTypeDetector implements DocumentTypeDetector {
  private static instance: DefaultDocumentTypeDetector

  private constructor() {}

  static getInstance(): DefaultDocumentTypeDetector {
    if (!DefaultDocumentTypeDetector.instance) {
      DefaultDocumentTypeDetector.instance = new DefaultDocumentTypeDetector()
    }
    return DefaultDocumentTypeDetector.instance
  }

  /**
   * 从文件路径检测文档类型
   */
  detectFromPath(filePath: string): DocumentType {
    try {
      const extension = this.extractExtension(filePath)
      return this.detectFromExtension(extension)
    } catch (error) {
      ErrorHandler.handleValidationError(
        `无法从路径检测文档类型: ${filePath}`,
        'DocumentTypeDetector.detectFromPath'
      )
      return DocType.UNKNOWN
    }
  }

  /**
   * 从文件扩展名检测文档类型
   */
  detectFromExtension(extension: string): DocumentType {
    const normalizedExt = extension.toLowerCase().replace('.', '')

    if (TEXT_EXTENSIONS.includes(normalizedExt as any)) {
      return DocType.TEXT_EDITOR
    }

    if (PDF_EXTENSIONS.includes(normalizedExt as any)) {
      return DocType.PDF_VIEWER
    }

    if (IMAGE_EXTENSIONS.includes(normalizedExt as any)) {
      return DocType.IMAGE_VIEWER
    }

    return DocType.UNKNOWN
  }

  /**
   * 从MIME类型检测文档类型
   */
  detectFromMimeType(mimeType: string): DocumentType {
    const normalizedMime = mimeType.toLowerCase()

    // 文本类型
    if (normalizedMime.startsWith('text/') ||
        normalizedMime === 'application/x-markdown' ||
        normalizedMime === 'text/markdown') {
      return DocType.TEXT_EDITOR
    }

    // PDF类型
    if (normalizedMime === 'application/pdf') {
      return DocType.PDF_VIEWER
    }

    // 图片类型
    if (normalizedMime.startsWith('image/')) {
      return DocType.IMAGE_VIEWER
    }

    return DocType.UNKNOWN
  }

  /**
   * 获取支持的所有文件扩展名
   */
  getSupportedExtensions(): string[] {
    return [
      ...TEXT_EXTENSIONS,
      ...PDF_EXTENSIONS,
      ...IMAGE_EXTENSIONS
    ]
  }

  /**
   * 从文件路径提取扩展名
   */
  private extractExtension(filePath: string): string {
    const lastDotIndex = filePath.lastIndexOf('.')
    if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
      return ''
    }
    return filePath.substring(lastDotIndex + 1)
  }

  /**
   * 检查是否支持指定的文档类型
   */
  isSupported(documentType: DocumentType): boolean {
    return documentType !== DocType.UNKNOWN
  }

  /**
   * 获取文档类型的显示名称
   */
  getDisplayName(documentType: DocumentType): string {
    switch (documentType) {
      case DocType.TEXT_EDITOR:
        return '文本编辑器'
      case DocType.PDF_VIEWER:
        return 'PDF 查看器'
      case DocType.IMAGE_VIEWER:
        return '图片查看器'
      case DocType.UNKNOWN:
      default:
        return '未知类型'
    }
  }

  /**
   * 获取文档类型的图标
   */
  getIcon(documentType: DocumentType): string {
    switch (documentType) {
      case DocType.TEXT_EDITOR:
        return 'file-text'
      case DocType.PDF_VIEWER:
        return 'file-type-pdf'
      case DocType.IMAGE_VIEWER:
        return 'photo'
      case DocType.UNKNOWN:
      default:
        return 'file'
    }
  }

  /**
   * 检查文件是否可编辑
   */
  isEditable(documentType: DocumentType): boolean {
    return documentType === DocType.TEXT_EDITOR
  }

  /**
   * 检查文件是否只读
   */
  isReadOnly(documentType: DocumentType): boolean {
    return documentType === DocType.PDF_VIEWER || documentType === DocType.IMAGE_VIEWER
  }
}

// 导出单例实例
export const documentTypeDetector = DefaultDocumentTypeDetector.getInstance()

// Vue 组合式 API
export function useDocumentTypeDetector() {
  const detector = DefaultDocumentTypeDetector.getInstance()

  return {
    detectFromPath: detector.detectFromPath.bind(detector),
    detectFromExtension: detector.detectFromExtension.bind(detector),
    detectFromMimeType: detector.detectFromMimeType.bind(detector),
    getSupportedExtensions: detector.getSupportedExtensions.bind(detector),
    isSupported: detector.isSupported.bind(detector),
    getDisplayName: detector.getDisplayName.bind(detector),
    getIcon: detector.getIcon.bind(detector),
    isEditable: detector.isEditable.bind(detector),
    isReadOnly: detector.isReadOnly.bind(detector)
  }
}