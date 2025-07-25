import { Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ImageWithCaptionView from './ImageWithCaptionView.vue'

const defaultCaptionText: string = 'Image Caption'
/**
 * ImageWithCaption节点 - 图片和标题的容器
 * 结构：caption? + image + caption?
 * 支持top/bottom/none三种caption位置
 */
export const ImageWithCaption = Node.create({
  name: 'imageWithCaption',
  
  group: 'block',
  
  content: 'caption? image caption?', // 可选顶部caption + 图片 + 可选底部caption

  isolating: true,

  selectable: true,

  defining: true,
  
  addAttributes() {
    return {
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
        tag: 'figure[data-type="image-with-caption"]',
      }
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['figure', { ...HTMLAttributes, 'data-type': 'image-with-caption' }, 0]
  },
  
  addNodeView() {
    return VueNodeViewRenderer(ImageWithCaptionView)
  },
  
  addCommands() {
    return {
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
        
        // 构建caption属性
        const captionAttrs: any = {}
        if (captionClass) captionAttrs.class = captionClass
        
        // 构建内容结构
        const content: any[] = []
        
        const captionNode = {
          type: 'caption',
          content: [{ type: 'text', text: captionText || defaultCaptionText }],
        }

        // 顶部caption
        if (showCaption === 'top') {
          content.push(captionNode)
        }
        
        // 图片
        content.push({
          type: 'image',
          attrs: imageAttrs
        })
        
        // 底部caption
        if (showCaption === 'bottom') {
          content.push(captionNode)
        }
        
        return commands.insertContent({
          type: this.name,
          attrs: { showCaption },
          content
        })
      },
      
      setCaptionPosition: (position: 'top' | 'bottom' | 'none' | 'auto' = 'auto') => ({ tr, state, dispatch }) => {
        if (!dispatch) return false
        
        const { schema, selection } = state
        const { from } = selection
        const $from = state.doc.resolve(from)
        
        let containerPos = null
        let containerNode = null
        
        for (let i = $from.depth; i >= 0; i--) {
          const node = $from.node(i)
          if (node.type.name === this.name) {
            containerPos = $from.start(i) - 1
            containerNode = node
            break
          }
        }
        
        if (!containerNode || containerPos === null) return false

        const contentNodes = containerNode.content.content
        const imageNode = contentNodes.find(n => n.type.name === 'image')
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
          newContent = [imageNode, captionNode]
        } else if (position === 'top' || (position === 'auto' && currentPosition === 'bottom')) {
          newPosition = 'top'
          newContent = [captionNode, imageNode]
        } else if (position === 'none') {
          newPosition = 'none'
          newContent = [imageNode]
        } else {
          return false
        }

        const newNode = schema.nodes.imageWithCaption.create(
          {...containerNode.attrs, showCaption: newPosition},
          newContent
        )

        dispatch?.(tr.replaceWith(containerPos, containerPos + containerNode.nodeSize, newNode).scrollIntoView())          
        return true
      },

      getCaptionPosition: () => ({ state }) => {
        const { doc, selection } = state
        const { from } = selection

        let position: 'top' | 'bottom' | 'none' = 'none'

        doc.descendants((node, pos) => {
          if (node.type.name === this.name && pos <= from && from <= pos + node.nodeSize) {
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

      setCaptionText: (captionText: string) => ({ tr, state, dispatch }) => {
        if (!dispatch) return false

        const { selection, doc, schema } = state
        const { from } = selection

        let found = false

        doc.descendants((node, pos) => {
          if (node.type.name === this.name && pos <= from && from <= pos + node.nodeSize) {
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

export default ImageWithCaption