import { Node } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

/**
 * Caption节点 - 用于图片、视频等媒体的标题
 * 支持inline内容和marks，可用于top/bottom位置
 * 支持回车键退出到下一个节点
 */
export const Caption = Node.create({
  name: 'caption',
  
  group: 'block',
  
  content: 'inline*', // 支持所有inline内容和marks

  defining: true, // 定义节点，表示该节点是一个标题
  
  isolating: true, // 隔离节点，有助于控制编辑行为
  
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
  },

  addKeyboardShortcuts() {
    return {
      'Enter': () => {
        return this.editor.commands.exitCaption()
      }
    }
  },

  addCommands() {
    return {
      exitCaption: () => ({ tr, state, dispatch }) => {
        if (!dispatch) return false

        const { selection, schema } = state
        const { $from } = selection

        // 检查当前是否在caption节点中
        let captionDepth = -1
        let mediaContainerDepth = -1

        for (let i = $from.depth; i >= 0; i--) {
          const node = $from.node(i)
          if (node.type.name === 'caption' && captionDepth === -1) {
            captionDepth = i
          }
          if ((node.type.name.endsWith('WithCaption') || node.type.name === 'mediaWithCaption') && mediaContainerDepth === -1) {
            mediaContainerDepth = i
          }
        }

        // 如果不在caption中，返回false让默认行为处理
        if (captionDepth === -1) {
          return false
        }

        // 如果找到了媒体容器，在容器后插入新段落
        if (mediaContainerDepth !== -1) {
          const containerEnd = $from.end(mediaContainerDepth)
          
          // 创建新的段落节点
          const paragraph = schema.nodes.paragraph.create()
          
          // 在容器结束位置插入新段落
          tr.insert(containerEnd, paragraph)
          
          // 将光标移动到新段落的开始位置
          const newPos = containerEnd + 1
          tr.setSelection(TextSelection.create(tr.doc, newPos))
          
          dispatch(tr.scrollIntoView())
          return true
        }

        // 如果没有找到媒体容器，在caption后插入段落
        const captionEnd = $from.end(captionDepth)
        const paragraph = schema.nodes.paragraph.create()
        
        tr.insert(captionEnd, paragraph)
        tr.setSelection(TextSelection.create(tr.doc, captionEnd + 1))
        
        dispatch(tr.scrollIntoView())
        return true
      },

      // 辅助命令：检查是否在caption中
      isInCaption: () => ({ state }) => {
        const { selection } = state
        const { $from } = selection

        for (let i = $from.depth; i >= 0; i--) {
          if ($from.node(i).type.name === 'caption') {
            return true
          }
        }
        return false
      }
    }
  }
})

export default Caption