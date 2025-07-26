import { MediaWithCaption, type MediaCaptionOptions } from './MediaWithCaption'

/**
 * 首字母大写工具函数
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * 媒体标题扩展工厂函数
 * 根据指定的媒体类型创建对应的带标题扩展
 */
export function createMediaWithCaptionExtension(
  mediaType: string, 
  options: {
    nodeViewComponent?: any
    contentSchema?: string
    defaultAttributes?: Record<string, any>
    commands?: Record<string, any>
  } = {}
) {
  const { 
    nodeViewComponent, 
    contentSchema, 
    defaultAttributes = {},
    commands = {}
  } = options
  
  return MediaWithCaption.extend({
    name: `${mediaType}WithCaption`,
    
    addOptions() {
      return {
        ...this.parent?.(),
        defaultMediaType: mediaType,
        nodeViewComponent,
      }
    },
    
    // 动态内容模式：根据mediaType决定content结构
    get content() {
      return contentSchema || `caption? ${mediaType} caption?`
    },
    
    addAttributes() {
      return {
        ...this.parent?.(),
        ...defaultAttributes,
        // 确保mediaType默认值正确
        mediaType: {
          ...this.parent?.()?.mediaType,
          default: mediaType,
        },
      }
    },
    
    parseHTML() {
      return [
        {
          tag: `figure[data-type="${mediaType}-with-caption"]`,
        },
        // 保持向后兼容
        ...(this.parent?.() || [])
      ]
    },
    
    renderHTML({ HTMLAttributes }) {
      return ['figure', { 
        ...HTMLAttributes, 
        'data-type': `${mediaType}-with-caption`,
        'data-media-type': mediaType
      }, 0]
    },
    
    addCommands() {
      const parentCommands = this.parent?.() || {}
      
      // 为特定媒体类型创建专用命令
      const specificCommands = {
        [`set${capitalize(mediaType)}WithCaption`]: (options: MediaCaptionOptions) => ({ commands }) => {
          return commands.setMediaWithCaption({
            ...options,
            containerAttrs: {
              ...options.containerAttrs,
              mediaType
            }
          })
        },
        
        [`toggle${capitalize(mediaType)}Caption`]: () => ({ commands }) => {
          return commands.setCaptionPosition('auto')
        },
        
        [`set${capitalize(mediaType)}CaptionText`]: (text: string) => ({ commands }) => {
          return commands.setCaptionText(text)
        },
        
        [`set${capitalize(mediaType)}CaptionPosition`]: (position: 'top' | 'bottom' | 'none') => ({ commands }) => {
          return commands.setCaptionPosition(position)
        },
        
        // 添加自定义命令
        ...commands
      }
      
      return {
        ...parentCommands,
        ...specificCommands
      }
    },
    
    addKeyboardShortcuts() {
      const parentShortcuts = this.parent?.() || {}
      
      return {
        ...parentShortcuts,
        // 通用快捷键：Cmd/Ctrl + Shift + C 切换标题
        'Mod-Shift-c': () => this.editor.commands[`toggle${capitalize(mediaType)}Caption`](),
      }
    }
  })
}

/**
 * 预定义的媒体类型配置
 */
export const MediaTypeConfigs = {
  image: {
    contentSchema: 'caption? image caption?',
    defaultAttributes: {
      alt: {
        default: '',
        parseHTML: element => {
          const img = element.querySelector('img')
          return img?.getAttribute('alt') || ''
        },
        renderHTML: attributes => attributes.alt ? { 'data-alt': attributes.alt } : {},
      },
      src: {
        default: '',
        parseHTML: element => {
          const img = element.querySelector('img')
          return img?.getAttribute('src') || ''
        },
        renderHTML: attributes => attributes.src ? { 'data-src': attributes.src } : {},
      }
    }
  },
  
  video: {
    contentSchema: 'caption? video caption?',
    defaultAttributes: {
      src: {
        default: '',
        parseHTML: element => {
          const video = element.querySelector('video, source')
          return video?.getAttribute('src') || ''
        },
        renderHTML: attributes => attributes.src ? { 'data-src': attributes.src } : {},
      },
      controls: {
        default: true,
        parseHTML: element => {
          const video = element.querySelector('video')
          return video?.hasAttribute('controls') || true
        },
        renderHTML: attributes => ({ 'data-controls': attributes.controls }),
      }
    }
  },
  
  audio: {
    contentSchema: 'caption? audio caption?',
    defaultAttributes: {
      src: {
        default: '',
        parseHTML: element => {
          const audio = element.querySelector('audio, source')
          return audio?.getAttribute('src') || ''
        },
        renderHTML: attributes => attributes.src ? { 'data-src': attributes.src } : {},
      },
      controls: {
        default: true,
        parseHTML: element => {
          const audio = element.querySelector('audio')
          return audio?.hasAttribute('controls') || true
        },
        renderHTML: attributes => ({ 'data-controls': attributes.controls }),
      }
    }
  },
  
  table: {
    contentSchema: 'caption? table caption?',
    defaultAttributes: {
      tableType: {
        default: 'standard',
        parseHTML: element => element.getAttribute('data-table-type') || 'standard',
        renderHTML: attributes => ({ 'data-table-type': attributes.tableType }),
      }
    }
  },
  
  youtube: {
    contentSchema: 'caption? youtube caption?',
    defaultAttributes: {
      src: {
        default: '',
        parseHTML: element => {
          const iframe = element.querySelector('iframe')
          return iframe?.getAttribute('src') || ''
        },
        renderHTML: attributes => attributes.src ? { 'data-src': attributes.src } : {},
      }
    }
  }
}

export default createMediaWithCaptionExtension