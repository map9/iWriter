import { VueNodeViewRenderer } from '@tiptap/vue-3'
import Image from '@tiptap/extension-image'
import { addCaptionAttrs, captionCommands } from './CaptionMixin'
import ImageWithCaption from './ImageWithCaption.vue'

export const ImageCaption = Image.extend({
  name: 'imageCaption',
  
  addAttributes() {
    // 合并原有Image属性和Caption属性
    const originalAttrs = this.parent?.() || {}
    return addCaptionAttrs({
      ...originalAttrs,
      src: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('src') || '',
        renderHTML: (attributes: any) => ({
          src: attributes.src,
        }),
      },
      alt: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('alt') || '',
        renderHTML: (attributes: any) => ({
          alt: attributes.alt,
        }),
      },
      title: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('title') || '',
        renderHTML: (attributes: any) => ({
          title: attributes.title,
        }),
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const width = element.getAttribute('width')
          return width ? parseInt(width, 10) : null
        },
        renderHTML: (attributes: any) => {
          if (!attributes.width) return {}
          return { width: attributes.width }
        },
      },
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const height = element.getAttribute('height')
          return height ? parseInt(height, 10) : null
        },
        renderHTML: (attributes: any) => {
          if (!attributes.height) return {}
          return { height: attributes.height }
        },
      },
      loading: {
        default: 'lazy',
        parseHTML: (element: HTMLElement) => element.getAttribute('loading') || 'lazy',
        renderHTML: (attributes: any) => ({
          loading: attributes.loading,
        }),
      },
      placeholder: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-placeholder') || '',
        renderHTML: (attributes: any) => ({
          'data-placeholder': attributes.placeholder,
        }),
      },
    })
  },
  
  addNodeView() {
    return VueNodeViewRenderer(ImageWithCaption)
  },
  
  addCommands() {
    return {
      // 继承原有Image命令
      ...this.parent?.() || {},
      
      // 设置图片（兼容原有API）
      setImage: (options: { src: string; alt?: string; title?: string; width?: number; height?: number }) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            ...options,
            showCaption: false,
            caption: '',
            captionPosition: 'bottom',
          },
        })
      },
      
      // 设置带标题的图片
      setImageWithCaption: (options: {
        src: string
        alt?: string
        title?: string
        width?: number
        height?: number
        caption?: string
        showCaption?: boolean
        captionPosition?: 'top' | 'bottom'
      }) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            src: options.src || '',
            alt: options.alt || '',
            title: options.title || '',
            width: options.width || null,
            height: options.height || null,
            caption: options.caption || '',
            showCaption: options.showCaption || false,
            captionPosition: options.captionPosition || 'bottom',
          },
        })
      },
      
      // 插入空白图片（用于拖拽或点击上传）
      insertImagePlaceholder: () => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            src: '',
            alt: '',
            title: '',
            caption: '',
            showCaption: false,
            captionPosition: 'bottom',
          },
        })
      },
      
      // Caption相关命令 - 使用标准TipTap命令格式
      toggleImageCaption: () => ({ tr, state, dispatch, editor }) => {
        return captionCommands.toggleCaption(this.name)({ tr, state, dispatch, editor })
      },
      
      setImageCaption: (caption: string) => ({ tr, state, dispatch, editor }) => {
        return captionCommands.updateCaption(this.name, caption)({ tr, state, dispatch, editor })
      },
      
      setImageCaptionPosition: (position: 'top' | 'bottom') => ({ tr, state, dispatch, editor }) => {
        return captionCommands.setCaptionPosition(this.name, position)({ tr, state, dispatch, editor })
      },
      
      // 更新图片属性
      updateImageAttributes: (attributes: Partial<{
        src: string
        alt: string
        title: string
        width: number
        height: number
      }>) => ({ tr, state, dispatch, editor }) => {
        const { selection } = state
        let targetPos = selection.from
        let node = state.doc.nodeAt(targetPos)
        
        // 查找图片节点
        if (!node || node.type.name !== this.name) {
          const $pos = state.doc.resolve(targetPos)
          for (let i = $pos.depth; i > 0; i--) {
            const parentNode = $pos.node(i)
            if (parentNode.type.name === this.name) {
              node = parentNode
              targetPos = $pos.start(i) - 1
              break
            }
          }
        }
        
        if (!node || node.type.name !== this.name) {
          return false
        }
        
        if (dispatch) {
          const newAttrs = {
            ...node.attrs,
            ...attributes
          }
          
          tr.setNodeMarkup(targetPos, null, newAttrs)
          dispatch(tr)
        }
        
        return true
      },
    }
  },
  
  addKeyboardShortcuts() {
    return {
      // 保留原有快捷键
      ...this.parent?.() || {},
      
      // 添加Caption相关快捷键
      'Mod-Shift-i': () => this.editor.commands.toggleImageCaption(),
      
      // 插入图片占位符
      'Mod-Alt-i': () => this.editor.commands.insertImagePlaceholder(),
    }
  },
  
  addInputRules() {
    // 保留原有输入规则
    return this.parent?.() || []
  },
  
  addPasteRules() {
    // 保留原有粘贴规则，但使用新的节点类型
    const originalRules = this.parent?.() || []
    
    // 可以在这里添加自定义的粘贴规则
    // 例如：处理从剪贴板粘贴的图片
    return originalRules
  },
  
  // 添加拖拽处理
  addProseMirrorPlugins() {
    const plugins = this.parent?.() || []
    
    // 可以在这里添加处理拖拽的插件
    // 目前图片拖拽处理在Vue组件中完成
    
    return plugins
  },
})

// 导出默认和命名导出
export default ImageCaption

// 为了兼容性，也导出一个工厂函数
export const createImageCaptionExtension = (options?: any) => {
  return ImageCaption.configure(options)
}