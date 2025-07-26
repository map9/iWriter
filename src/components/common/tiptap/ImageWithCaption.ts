import { createMediaWithCaptionExtension, MediaTypeConfigs } from './MediaCaptionFactory'
import MediaWithCaptionView from './MediaWithCaptionView.vue'

const defaultCaptionText: string = 'Image Caption'

/**
 * ImageWithCaption节点 - 图片和标题的容器
 * 使用通用媒体标题架构，专门用于图片
 * 结构：caption? + image + caption?
 * 支持top/bottom/none三种caption位置
 */
export const ImageWithCaption = createMediaWithCaptionExtension('image', {
  nodeViewComponent: MediaWithCaptionView,
  ...MediaTypeConfigs.image,
  
  // 扩展特定于图片的属性
  defaultAttributes: {
    ...MediaTypeConfigs.image.defaultAttributes,
    width: {
      default: null,
      parseHTML: element => {
        const img = element.querySelector('img')
        return img?.getAttribute('width') || null
      },
      renderHTML: attributes => attributes.width ? { 'data-width': attributes.width } : {},
    },
    height: {
      default: null,
      parseHTML: element => {
        const img = element.querySelector('img')
        return img?.getAttribute('height') || null
      },
      renderHTML: attributes => attributes.height ? { 'data-height': attributes.height } : {},
    },
    title: {
      default: '',
      parseHTML: element => {
        const img = element.querySelector('img')
        return img?.getAttribute('title') || ''
      },
      renderHTML: attributes => attributes.title ? { 'data-title': attributes.title } : {},
    }
  },
}).extend({
  // 为了向后兼容，保持原有的节点名和解析规则
  name: 'imageWithCaption',
  
  parseHTML() {
    return [
      {
        tag: 'figure[data-type="image-with-caption"]',
      },
      // 向后兼容旧格式
      ...this.parent?.() || []
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['figure', { 
      ...HTMLAttributes, 
      'data-type': 'image-with-caption',
      'data-media-type': 'image'
    }, 0]
  },
  
  addCommands() {
    const parentCommands = this.parent?.() || {}
    
    return {
      ...parentCommands,
      
      // 保持向后兼容的图片专用命令
      setImageWithCaption: (options: {
        src: string
        alt?: string
        title?: string
        width?: number
        height?: number
        showCaption?: 'top' | 'bottom' | 'none'
        captionText?: string
        captionClass?: string
      }) => ({ commands }) => {
        const {
          src,
          alt,
          title,
          width,
          height,
          showCaption = 'bottom',
          captionText = title || alt || defaultCaptionText,
          captionClass
        } = options
        
        // 构建image属性
        const imageAttrs: any = { src, alt, title }
        if (width) imageAttrs.width = width
        if (height) imageAttrs.height = height
        
        return commands.setMediaWithCaption({
          showCaption,
          captionText,
          captionClass,
          mediaAttrs: imageAttrs,
          containerAttrs: { 
            mediaType: 'image',
            src, alt, title, width, height
          }
        })
      },
      
      // 向后兼容的别名命令
      toggleImageCaption: () => ({ commands }) => {
        return commands.setCaptionPosition('auto')
      }
    }
  }
})

export default ImageWithCaption