import type { DocumentType } from '@/types'
import { DocumentType as DocType, IMAGE_EXTENSIONS, PDF_EXTENSIONS, TEXT_EXTENSIONS, CODE_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from '@/types'
import {
  IconFile,
  IconFileCode,
  IconPhoto,
  IconFileMusic,
  IconVideo,
  IconFileText,
  IconMarkdown,
  IconFileTypeTxt,
  IconFileTypeDoc,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileZip,
  IconBrandJavascript,
  IconBrandHtml5,
  IconBrandCss3,
  IconBrandPython,
  IconDatabase,
  IconSettings
} from '@tabler/icons-vue'

/**
 * 文档类型检测器
 * 根据文件路径、扩展名或MIME类型检测文档类型
 */
export class DefaultDocumentTypeDetector {
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
    const extension = this.extractExtension(filePath)
    return this.detectFromExtension(extension)
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
      ...IMAGE_EXTENSIONS,
      ...PDF_EXTENSIONS,
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
  getIconByType(documentType: DocumentType) {
    switch (documentType) {
      case DocType.TEXT_EDITOR:
        return IconFileText
      case DocType.PDF_VIEWER:
        return IconFileTypePdf
      case DocType.IMAGE_VIEWER:
        return IconPhoto
      case DocType.UNKNOWN:
      default:
        return IconFile
    }
  }

  getIconByExtension(extension: string) {
    switch (extension) {
      // Code files
      case 'js':
      case 'mjs':
        return IconBrandJavascript
      case 'ts':
      case 'tsx':
        return IconFileCode
      case 'html':
      case 'htm':
        return IconBrandHtml5
      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return IconBrandCss3
      case 'py':
        return IconBrandPython
      case 'java':
      case 'c':
      case 'cpp':
      case 'h':
      case 'cs':
      case 'php':
      case 'rb':
      case 'go':
      case 'rs':
      case 'swift':
      case 'kt':
        return IconFileCode
      
      // Images
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'svg':
      case 'webp':
      case 'ico':
        return IconPhoto
      
      // Audio
      case 'mp3':
      case 'wav':
      case 'flac':
      case 'aac':
      case 'ogg':
      case 'm4a':
        return IconFileMusic
      
      // Video
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
      case 'flv':
      case 'webm':
      case 'mkv':
        return IconVideo
      
      // Documents
      case 'txt':
        return IconFileTypeTxt

      case 'md':
        return IconMarkdown
        
      case 'rtf':
        return IconFileText

      case 'doc':
        return IconFileTypeDoc

      case 'docx':
        return IconFileTypeDocx

      case 'pdf':
        return IconFileTypePdf
      
      // Archives
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
      case 'bz2':
        return IconFileZip
      
      // Database
      case 'db':
      case 'sqlite':
      case 'sql':
        return IconDatabase
      
      // Config
      case 'json':
      case 'xml':
      case 'yml':
      case 'yaml':
      case 'toml':
      case 'ini':
      case 'cfg':
      case 'conf':
        return IconSettings
      
      default:
        return IconFile
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
    getIconByType: detector.getIconByType.bind(detector),
    getIconByExtension: detector.getIconByExtension.bind(detector),
    isEditable: detector.isEditable.bind(detector),
    isReadOnly: detector.isReadOnly.bind(detector)
  }
}