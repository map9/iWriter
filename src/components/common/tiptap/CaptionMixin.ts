/**
 * 通用Caption功能混入
 * 为TipTap节点添加标题功能的通用数据类型和工具函数
 */

export interface CaptionNodeAttrs {
  caption?: string
  showCaption?: boolean
  captionPosition?: 'top' | 'bottom'
}

/**
 * 为现有节点属性添加Caption相关属性
 */
export const addCaptionAttrs = (originalAttrs: any = {}) => ({
  ...originalAttrs,
  caption: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-caption') || '',
    renderHTML: (attributes: any) => ({
      'data-caption': attributes.caption,
    }),
  },
  showCaption: {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-show-caption') === 'true',
    renderHTML: (attributes: any) => ({
      'data-show-caption': attributes.showCaption,
    }),
  },
  captionPosition: {
    default: 'bottom',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-caption-position') || 'bottom',
    renderHTML: (attributes: any) => ({
      'data-caption-position': attributes.captionPosition,
    }),
  },
})

/**
 * Caption相关的通用命令工厂函数
 * 返回符合TipTap标准的命令函数
 */
export const captionCommands = {
  toggleCaption: (nodeType: string) => ({ tr, state, dispatch, editor }: any) => {
    const { selection } = state
    let targetPos = selection.from
    let node = state.doc.nodeAt(targetPos)
    
    // 如果当前位置不是目标节点，尝试查找父节点
    if (!node || node.type.name !== nodeType) {
      // 向上查找父节点
      const $pos = state.doc.resolve(targetPos)
      for (let i = $pos.depth; i > 0; i--) {
        const parentNode = $pos.node(i)
        if (parentNode.type.name === nodeType) {
          node = parentNode
          targetPos = $pos.start(i) - 1
          break
        }
      }
    }
    
    if (!node || node.type.name !== nodeType) {
      return false
    }
    
    if (dispatch) {
      const attrs = {
        ...node.attrs,
        showCaption: !node.attrs.showCaption,
        caption: !node.attrs.showCaption && !node.attrs.caption ? 'Enter caption...' : node.attrs.caption
      }
      
      tr.setNodeMarkup(targetPos, null, attrs)
      dispatch(tr)
    }
    
    return true
  },
  
  updateCaption: (nodeType: string, caption: string) => ({ tr, state, dispatch, editor }: any) => {
    const { selection } = state
    let targetPos = selection.from
    let node = state.doc.nodeAt(targetPos)
    
    // 如果当前位置不是目标节点，尝试查找父节点
    if (!node || node.type.name !== nodeType) {
      const $pos = state.doc.resolve(targetPos)
      for (let i = $pos.depth; i > 0; i--) {
        const parentNode = $pos.node(i)
        if (parentNode.type.name === nodeType) {
          node = parentNode
          targetPos = $pos.start(i) - 1
          break
        }
      }
    }
    
    if (!node || node.type.name !== nodeType) {
      return false
    }
    
    if (dispatch) {
      const attrs = {
        ...node.attrs,
        caption
      }
      
      tr.setNodeMarkup(targetPos, null, attrs)
      dispatch(tr)
    }
    
    return true
  },
  
  setCaptionPosition: (nodeType: string, position: 'top' | 'bottom') => ({ tr, state, dispatch, editor }: any) => {
    const { selection } = state
    let targetPos = selection.from
    let node = state.doc.nodeAt(targetPos)
    
    // 如果当前位置不是目标节点，尝试查找父节点
    if (!node || node.type.name !== nodeType) {
      const $pos = state.doc.resolve(targetPos)
      for (let i = $pos.depth; i > 0; i--) {
        const parentNode = $pos.node(i)
        if (parentNode.type.name === nodeType) {
          node = parentNode
          targetPos = $pos.start(i) - 1
          break
        }
      }
    }
    
    if (!node || node.type.name !== nodeType) {
      return false
    }
    
    if (dispatch) {
      const attrs = {
        ...node.attrs,
        captionPosition: position
      }
      
      tr.setNodeMarkup(targetPos, null, attrs)
      dispatch(tr)
    }
    
    return true
  }
}

/**
 * Caption输入框的通用样式类名
 */
export const captionClasses = {
  wrapper: 'caption-wrapper',
  editor: 'caption-editor',
  input: 'caption-input',
  controls: 'caption-controls',
  top: 'caption-top',
  bottom: 'caption-bottom',
  visible: 'caption-visible'
}