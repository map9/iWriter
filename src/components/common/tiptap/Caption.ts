import { Node } from '@tiptap/core'

/**
 * Caption节点 - 用于图片、视频等媒体的标题
 * 支持inline内容和marks，可用于top/bottom位置
 */
export const Caption = Node.create({
  name: 'caption',
  
  group: 'block',
  
  content: 'inline*', // 支持所有inline内容和marks

  defining: true, // 定义节点，表示该节点是一个标题
  
  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: element => element.getAttribute('class'),
        renderHTML: attributes => attributes.class ? { class: attributes.class } : {},
      }
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'figcaption',
      }
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['figcaption', HTMLAttributes, 0]
  }
})

export default Caption