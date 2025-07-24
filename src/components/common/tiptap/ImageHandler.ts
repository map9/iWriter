/**
 * 图片处理工具类
 * 提供图片复制、刷新、拖拽处理等功能
 */

export interface ImageHandlerResult {
  success: boolean
  data?: any
  error?: string
}

export interface ImageInfo {
  src: string
  alt?: string
  title?: string
  width?: number
  height?: number
}

export class ImageHandler {
  /**
   * 复制图片到剪贴板
   */
  static async copyImage(src: string): Promise<ImageHandlerResult> {
    try {
      // 检查剪贴板API支持
      if (!navigator.clipboard || !navigator.clipboard.write) {
        return {
          success: false,
          error: 'Clipboard API not supported'
        }
      }

      // 创建canvas来处理图片
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      return new Promise((resolve) => {
        img.onload = async () => {
          try {
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            ctx?.drawImage(img, 0, 0)
            
            // 转换为blob
            canvas.toBlob(async (blob) => {
              if (!blob) {
                resolve({
                  success: false,
                  error: 'Failed to convert image to blob'
                })
                return
              }
              
              try {
                // 写入剪贴板
                await navigator.clipboard.write([
                  new ClipboardItem({
                    [blob.type]: blob
                  })
                ])
                
                resolve({
                  success: true,
                  data: 'Image copied to clipboard'
                })
              } catch (error) {
                resolve({
                  success: false,
                  error: `Failed to copy image: ${error instanceof Error ? error.message : String(error)}`
                })
              }
            }, 'image/png')
          } catch (error) {
            resolve({
              success: false,
              error: `Failed to process image: ${error instanceof Error ? error.message : String(error)}`
            })
          }
        }
        
        img.onerror = () => {
          resolve({
            success: false,
            error: 'Failed to load image for copying'
          })
        }
        
        // 处理跨域问题
        img.crossOrigin = 'anonymous'
        img.src = src
      })
    } catch (error) {
      return {
        success: false,
        error: `Copy failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 刷新图片资源
   */
  static async refreshImage(src: string): Promise<ImageHandlerResult> {
    try {
      // 添加时间戳避免缓存
      const refreshUrl = src.includes('?') 
        ? `${src}&_refresh=${Date.now()}` 
        : `${src}?_refresh=${Date.now()}`
      
      // 预载图片验证是否可用
      const img = new Image()
      
      return new Promise((resolve) => {
        img.onload = () => {
          resolve({
            success: true,
            data: {
              refreshedSrc: refreshUrl,
              originalSrc: src,
              width: img.naturalWidth,
              height: img.naturalHeight
            }
          })
        }
        
        img.onerror = () => {
          resolve({
            success: false,
            error: 'Failed to refresh image - image may not exist'
          })
        }
        
        img.src = refreshUrl
      })
    } catch (error) {
      return {
        success: false,
        error: `Refresh failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 处理拖拽文件
   */
  static async handleDropFiles(files: FileList): Promise<ImageHandlerResult> {
    try {
      if (!files || files.length === 0) {
        return {
          success: false,
          error: 'No files provided'
        }
      }

      const file = files[0]
      
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        return {
          success: false,
          error: 'File is not an image'
        }
      }

      // 检查文件大小 (限制为 5MB)
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        return {
          success: false,
          error: 'Image file too large (max 5MB)'
        }
      }

      // 创建本地URL或base64
      const imageUrl = URL.createObjectURL(file)
      
      // 获取图片尺寸
      const img = new Image()
      
      return new Promise((resolve) => {
        img.onload = () => {
          resolve({
            success: true,
            data: {
              src: imageUrl,
              alt: file.name.replace(/\.[^/.]+$/, ''), // 移除扩展名作为alt
              title: file.name,
              width: img.naturalWidth,
              height: img.naturalHeight,
              fileSize: file.size,
              fileType: file.type,
              fileName: file.name
            }
          })
        }
        
        img.onerror = () => {
          URL.revokeObjectURL(imageUrl)
          resolve({
            success: false,
            error: 'Invalid image file'
          })
        }
        
        img.src = imageUrl
      })
    } catch (error) {
      return {
        success: false,
        error: `Drop handling failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 获取默认占位符图片
   */
  static getPlaceholderImage(): string {
    // 使用SVG创建默认占位符
    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f3f4f6" stroke="#d1d5db" stroke-width="2" stroke-dasharray="8,4"/>
        <g transform="translate(200,150)">
          <circle r="30" fill="#9ca3af"/>
          <path d="M-12,-8 L12,-8 L8,8 L-8,8 Z" fill="#6b7280"/>
          <circle r="4" cx="-6" cy="-4" fill="#4b5563"/>
          <text y="60" text-anchor="middle" font-family="system-ui" font-size="14" fill="#6b7280">
            Drop image here or click to upload
          </text>
        </g>
      </svg>
    `
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  /**
   * 验证图片URL是否有效
   */
  static async validateImageUrl(src: string): Promise<ImageHandlerResult> {
    try {
      const img = new Image()
      
      return new Promise((resolve) => {
        img.onload = () => {
          resolve({
            success: true,
            data: {
              src,
              width: img.naturalWidth,
              height: img.naturalHeight,
              valid: true
            }
          })
        }
        
        img.onerror = () => {
          resolve({
            success: false,
            error: 'Image URL is not valid or not accessible'
          })
        }
        
        // 处理跨域
        img.crossOrigin = 'anonymous'
        img.src = src
      })
    } catch (error) {
      return {
        success: false,
        error: `URL validation failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 压缩图片 (如果文件过大)
   */
  static async compressImage(file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.8): Promise<ImageHandlerResult> {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      return new Promise((resolve) => {
        img.onload = () => {
          // 计算新尺寸
          let { width, height } = img
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height)
            width *= ratio
            height *= ratio
          }
          
          canvas.width = width
          canvas.height = height
          
          // 绘制压缩后的图片
          ctx?.drawImage(img, 0, 0, width, height)
          
          canvas.toBlob((blob) => {
            if (!blob) {
              resolve({
                success: false,
                error: 'Failed to compress image'
              })
              return
            }
            
            const compressedFile = new File([blob], file.name, {
              type: blob.type,
              lastModified: Date.now()
            })
            
            resolve({
              success: true,
              data: {
                file: compressedFile,
                originalSize: file.size,
                compressedSize: blob.size,
                compressionRatio: Math.round((1 - blob.size / file.size) * 100)
              }
            })
          }, file.type, quality)
        }
        
        img.onerror = () => {
          resolve({
            success: false,
            error: 'Failed to load image for compression'
          })
        }
        
        img.src = URL.createObjectURL(file)
      })
    } catch (error) {
      return {
        success: false,
        error: `Image compression failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 清理创建的URL对象
   */
  static revokeObjectURL(url: string): void {
    try {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.warn('Failed to revoke object URL:', error)
    }
  }

  /**
   * 获取支持的图片格式
   */
  static getSupportedImageTypes(): string[] {
    return [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml'
    ]
  }

  /**
   * 检查文件类型是否支持
   */
  static isSupportedImageType(type: string): boolean {
    return this.getSupportedImageTypes().includes(type.toLowerCase())
  }
}

export default ImageHandler