import { Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'

const defaultCaptionText: string = 'Enter caption...'

export interface MediaCaptionOptions {
  src?: string
  alt?: string
  title?: string
  width?: number
  height?: number
  showCaption?: 'top' | 'bottom' | 'none'
  captionText?: string
  captionClass?: string
  mediaAttrs?: Record<string, any>
  containerAttrs?: Record<string, any>
}

/**
 * 通用媒体标题容器节点
 * 支持Image、Video、Audio、Table等多种媒体类型的标题功能
 */
export const MediaWithCaption = Node.create({
  name: 'mediaWithCaption',
  
  group: 'block',
  
  isolating: true,
  selectable: true,
  defining: true,
  
  addOptions() {
    return {
      supportedMediaTypes: ['image', 'video', 'audio', 'table', 'youtube'],
      defaultMediaType: 'image',
      nodeViewComponent: null, // 将由具体扩展指定
    }
  },
  
  addAttributes() {
    return {
      mediaType: {
        default: 'image',
        parseHTML: element => element.getAttribute('data-media-type') || 'image',
        renderHTML: attributes => ({
          'data-media-type': attributes.mediaType,
        }),
      },
      showCaption: {
        default: 'bottom',
        parseHTML: element => element.getAttribute('data-show-caption') || 'bottom',
        renderHTML: attributes => ({
          'data-show-caption': attributes.showCaption,
        }),
      },
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attributes => attributes.class ? { class: attributes.class } : {},
      },
      textAlign: {
        default: null,
        parseHTML: element => element.style.textAlign || null,
        renderHTML: attributes =>
          attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {},
      },
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'figure[data-type="media-with-caption"]',
      }
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['figure', { ...HTMLAttributes, 'data-type': 'media-with-caption' }, 0]
  },
  
  addNodeView() {
    if (this.options.nodeViewComponent) {
      return VueNodeViewRenderer(this.options.nodeViewComponent)
    }
    return undefined
  },
  
  addCommands() {
    return {
      setMediaWithCaption: (options: MediaCaptionOptions) => ({ commands }: any) => {
        const {
          showCaption = 'bottom',
          captionText = defaultCaptionText,
          captionClass,
          mediaAttrs = {},
          containerAttrs = {}
        } = options
        
        const mediaType = containerAttrs.mediaType || this.options.defaultMediaType
        
        // 构建caption属性
        const captionNodeAttrs: any = {}
        if (captionClass) captionNodeAttrs.class = captionClass
        
        // 构建内容结构
        const content: any[] = []
        
        const captionNode = {
          type: 'caption',
          attrs: captionNodeAttrs,
          content: [{ type: 'text', text: captionText }],
        }

        // 顶部caption
        if (showCaption === 'top') {
          content.push(captionNode)
        }
        
        // 媒体节点
        content.push({
          type: mediaType,
          attrs: mediaAttrs
        })
        
        // 底部caption
        if (showCaption === 'bottom') {
          content.push(captionNode)
        }
        
        return commands.insertContent({
          type: this.name,
          attrs: { 
            mediaType, 
            showCaption,
            ...containerAttrs 
          },
          content
        })
      },
      
      setCaptionPosition: (position: 'top' | 'bottom' | 'none' | 'auto' = 'auto') => ({ tr, state, dispatch }: any) => {
        if (!dispatch) return false
        
        const { schema, selection } = state
        const { from } = selection
        const $from = state.doc.resolve(from)
        
        let containerPos = null
        let containerNode = null
        
        // 查找媒体容器节点
        for (let i = $from.depth; i >= 0; i--) {
          const node = $from.node(i)
          if (node.type.name === this.name || node.type.name.endsWith('WithCaption')) {
            containerPos = $from.start(i) - 1
            containerNode = node
            break
          }
        }
        
        if (!containerNode || containerPos === null) return false

        const contentNodes = containerNode.content.content
        const mediaType = containerNode.attrs.mediaType
        const mediaNode = contentNodes.find(n => n.type.name === mediaType)
        let captionNode = contentNodes.find(n => n.type.name === 'caption')

        const currentPosition = containerNode.attrs.showCaption
        let newPosition: 'top' | 'bottom' | 'none'
        let newContent = []

        if ((position === currentPosition) || (position === 'auto' && currentPosition === 'none')) return false

        if (!captionNode) {
          captionNode = schema.nodes.caption?.create(
            {},
            schema.text(containerNode.attrs.title || containerNode.attrs.alt || defaultCaptionText)
          )
        }

        if (position === 'bottom' || (position === 'auto' && currentPosition === 'top')) {
          newPosition = 'bottom'
          newContent = [mediaNode, captionNode]
        } else if (position === 'top' || (position === 'auto' && currentPosition === 'bottom')) {
          newPosition = 'top'
          newContent = [captionNode, mediaNode]
        } else if (position === 'none') {
          newPosition = 'none'
          newContent = [mediaNode]
        } else {
          return false
        }

        const nodeType = schema.nodes[containerNode.type.name]
        const newNode = nodeType.create(
          {...containerNode.attrs, showCaption: newPosition},
          newContent
        )

        dispatch?.(tr.replaceWith(containerPos, containerPos + containerNode.nodeSize, newNode).scrollIntoView())          
        return true
      },

      getCaptionPosition: () => ({ state }: any) => {
        const { doc, selection } = state
        const { from } = selection

        let position: 'top' | 'bottom' | 'none' = 'none'

        doc.descendants((node, pos) => {
          if ((node.type.name === this.name || node.type.name.endsWith('WithCaption')) 
              && pos <= from && from <= pos + node.nodeSize) {
            const children = node.content.content

            const topCaption = children[0]?.type.name === 'caption'
            const bottomCaption = children[children.length - 1]?.type.name === 'caption'

            if (topCaption) position = 'top'
            else if (bottomCaption) position = 'bottom'
            else position = 'none'

            return false
          }
          return true
        })

        return position
      },

      setCaptionText: (captionText: string) => ({ tr, state, dispatch }: any) => {
        if (!dispatch) return false

        const { selection, doc, schema } = state
        const { from } = selection

        let found = false

        doc.descendants((node, pos) => {
          if ((node.type.name === this.name || node.type.name.endsWith('WithCaption')) 
              && pos <= from && from <= pos + node.nodeSize) {
            const captionIndex = node.content.findIndex(child => child.type.name === 'caption')
            if (captionIndex === -1) return false

            const captionNode = node.content.child(captionIndex)
            const captionPos = pos + 1 + node.content.offsetAt(captionIndex)

            const newCaption = schema.nodes.caption.create(captionNode.attrs, schema.text(captionText))

            tr.replaceWith(captionPos, captionPos + captionNode.nodeSize, newCaption)
            found = true
            return false
          }
          return true
        })

        if (found) {
          dispatch(tr)
          return true
        }

        return false
      }
    }
  }
})

export default MediaWithCaption