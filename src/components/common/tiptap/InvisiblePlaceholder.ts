import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface InvisiblePlaceholderOptions {
  // Placeholder配置
  placeholder: string | ((node?: ProseMirrorNode, pos?: number) => string)
  showOnlyWhenEditable: boolean
  showOnlyCurrent: boolean
  includeChildren: boolean
  
  // InvisibleCharacters配置
  showInvisibleCharacters: boolean
  showSpace: boolean
  showTab: boolean
  showHardBreak: boolean
  showParagraph: boolean
  
  // 显示优先级
  priorityMode: 'placeholder' | 'invisible' | 'both'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    invisiblePlaceholder: {
      toggleInvisibleCharacters: () => ReturnType
      togglePlaceholder: () => ReturnType
      setPriorityMode: (mode: 'placeholder' | 'invisible' | 'both') => ReturnType
    }
  }
}

/**
 * 检查节点是否为空
 */
function isNodeEmpty(node: ProseMirrorNode): boolean {
  if (node.isText) {
    return !node.text
  }

  if (node.isAtom || node.isLeaf) {
    return false
  }

  if (node.content.childCount === 0) {
    return true
  }

  let isContentEmpty = true
  node.content.forEach(childNode => {
    if (!isNodeEmpty(childNode)) {
      isContentEmpty = false
    }
  })

  return isContentEmpty
}

/**
 * 检查节点是否包含不可见字符
 */
function hasInvisibleCharacters(
  node: ProseMirrorNode, 
  options: InvisiblePlaceholderOptions
): string[] {
  const invisibleChars: string[] = []
  
  if (node.isText && node.text) {
    const text = node.text
    
    // 检查空格
    if (options.showSpace && text.includes(' ')) {
      invisibleChars.push('space')
    }
    
    // 检查制表符
    if (options.showTab && text.includes('\t')) {
      invisibleChars.push('tab')
    }
  }
  
  // 检查硬换行
  if (options.showHardBreak && node.type.name === 'hardBreak') {
    invisibleChars.push('hard-break')
  }
  
  // 检查空段落
  if (options.showParagraph && node.type.name === 'paragraph' && isNodeEmpty(node)) {
    invisibleChars.push('paragraph')
  }
  
  return invisibleChars
}

/**
 * 获取占位符文本
 */
function getPlaceholderText(
  options: InvisiblePlaceholderOptions,
  node?: ProseMirrorNode,
  pos?: number
): string {
  if (typeof options.placeholder === 'function') {
    return options.placeholder(node, pos)
  }
  return options.placeholder
}

/**
 * 计算节点的CSS类和数据属性
 */
function computeNodeDecorations(
  node: ProseMirrorNode,
  pos: number,
  selection: any,
  options: InvisiblePlaceholderOptions
) {
  const classes: string[] = []
  const attrs: Record<string, string> = {}
  
  const isEmpty = isNodeEmpty(node)
  const invisibleChars = options.showInvisibleCharacters 
    ? hasInvisibleCharacters(node, options) 
    : []
  
  const { anchor } = selection
  const hasAnchor = anchor >= pos && anchor <= pos + node.nodeSize
  const shouldShowPlaceholder = isEmpty && 
    (hasAnchor || !options.showOnlyCurrent) &&
    options.priorityMode !== 'invisible'
  
  const shouldShowInvisible = invisibleChars.length > 0 && 
    options.priorityMode !== 'placeholder'

  // 根据优先级模式决定显示内容
  if (options.priorityMode === 'both') {
    // 同时显示模式：空节点显示占位符，有内容节点显示不可见字符
    if (shouldShowPlaceholder) {
      classes.push('has-placeholder')
      attrs['data-placeholder'] = getPlaceholderText(options, node, pos)
    }
    if (shouldShowInvisible) {
      classes.push('has-invisible')
      attrs['data-invisible'] = invisibleChars.join(',')
    }
  } else if (options.priorityMode === 'placeholder') {
    // 占位符优先：只显示占位符
    if (shouldShowPlaceholder) {
      classes.push('has-placeholder')
      attrs['data-placeholder'] = getPlaceholderText(options, node, pos)
    }
  } else {
    // 不可见字符优先：只显示不可见字符
    if (shouldShowInvisible) {
      classes.push('has-invisible')
      attrs['data-invisible'] = invisibleChars.join(',')
    } else if (shouldShowPlaceholder) {
      // 没有不可见字符时才显示占位符
      classes.push('has-placeholder')
      attrs['data-placeholder'] = getPlaceholderText(options, node, pos)
    }
  }
  
  // 添加空节点标记
  if (isEmpty) {
    classes.push('is-empty')
  }
  
  return { classes, attrs }
}

export const InvisiblePlaceholder = Extension.create<InvisiblePlaceholderOptions>({
  name: 'invisiblePlaceholder',

  addOptions() {
    return {
      placeholder: 'Write something...',
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
      includeChildren: false,
      
      showInvisibleCharacters: true,
      showSpace: true,
      showTab: true,
      showHardBreak: true,
      showParagraph: true,
      
      priorityMode: 'both',
    }
  },

  addCommands() {
    return {
      toggleInvisibleCharacters: () => ({ commands, editor }) => {
        const currentState = this.options.showInvisibleCharacters
        this.options.showInvisibleCharacters = !currentState
        
        // 触发重新渲染
        editor.view.dispatch(editor.state.tr)
        return true
      },
      
      togglePlaceholder: () => ({ commands, editor }) => {
        // 切换占位符显示模式
        if (this.options.priorityMode === 'placeholder') {
          this.options.priorityMode = 'invisible'
        } else {
          this.options.priorityMode = 'placeholder'
        }
        
        editor.view.dispatch(editor.state.tr)
        return true
      },
      
      setPriorityMode: (mode) => ({ commands, editor }) => {
        this.options.priorityMode = mode
        editor.view.dispatch(editor.state.tr)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('invisiblePlaceholder'),
        props: {
          decorations: ({ doc, selection }) => {
            const active = this.editor.isEditable || !this.options.showOnlyWhenEditable
            if (!active) return DecorationSet.empty

            const decorations: Decoration[] = []
            
            // 遍历文档节点
            doc.descendants((node, pos) => {
              const { classes, attrs } = computeNodeDecorations(
                node, 
                pos, 
                selection, 
                this.options
              )
              
              // 只为需要装饰的节点创建装饰器
              if (classes.length > 0) {
                const decoration = Decoration.node(pos, pos + node.nodeSize, {
                  class: classes.join(' '),
                  ...attrs,
                })
                decorations.push(decoration)
              }
              
              // 控制是否遍历子节点
              return this.options.includeChildren
            })

            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})