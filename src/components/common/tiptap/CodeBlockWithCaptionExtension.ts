import { VueNodeViewRenderer } from '@tiptap/vue-3'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { addCaptionAttrs, captionCommands } from './CaptionMixin'
import CodeBlockWithCaption from './CodeBlockWithCaption.vue'

export const CodeBlockCaption = CodeBlockLowlight.extend({
  name: 'codeBlockCaption',
  
  addAttributes() {
    // 合并原有CodeBlock属性和Caption属性
    const originalAttrs = this.parent?.() || {}
    return addCaptionAttrs(originalAttrs)
  },
  
  addNodeView() {
    return VueNodeViewRenderer(CodeBlockWithCaption)
  },
  
  addCommands() {
    return {
      // 继承原有CodeBlock命令
      ...this.parent?.() || {},
      
      // 添加Caption相关命令 - 使用标准TipTap命令格式
      toggleCodeBlockCaption: () => ({ tr, state, dispatch, editor }) => {
        return captionCommands.toggleCaption(this.name)({ tr, state, dispatch, editor })
      },
      
      setCodeBlockCaption: (caption: string) => ({ tr, state, dispatch, editor }) => {
        return captionCommands.updateCaption(this.name, caption)({ tr, state, dispatch, editor })
      },
      
      setCodeBlockCaptionPosition: (position: 'top' | 'bottom') => ({ tr, state, dispatch, editor }) => {
        return captionCommands.setCaptionPosition(this.name, position)({ tr, state, dispatch, editor })
      },
    }
  },
  
  addKeyboardShortcuts() {
    return {
      // 保留原有快捷键
      ...this.parent?.() || {},
      
      // 添加Caption相关快捷键
      'Mod-Shift-c': () => this.editor.commands.toggleCodeBlockCaption(),
    }
  },
})

export default CodeBlockCaption