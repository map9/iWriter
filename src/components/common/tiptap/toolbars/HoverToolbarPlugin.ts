import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface HoverToolbarPluginState {
  hoveredNodePos: number | null
  hoveredNodeType: string | null
  toolbarVisible: boolean
  hoveredNode: ProseMirrorNode | null
  hoveredDomNode: HTMLElement | null
}

export const HoverToolbarPluginKey = new PluginKey<HoverToolbarPluginState>('hoverToolbar')

export interface HoverToolbarOptions {
  supportedNodeTypes?: string[]
  hoverDelay?: number
  hideDelay?: number
}

export const HoverToolbarExtension = Extension.create<HoverToolbarOptions>({
  name: 'hoverToolbar',

  addOptions() {
    return {
      supportedNodeTypes: ['heading', 'codeBlock', 'blockquote', 'image'],
      hoverDelay: 100,
      hideDelay: 200
    }
  },

  addProseMirrorPlugins() {
    return [createHoverToolbarPlugin(this.options)]
  }
})

function createHoverToolbarPlugin(options: HoverToolbarOptions = {}) {
  const {
    supportedNodeTypes = ['heading', 'codeBlock', 'blockquote', 'image'],
    hoverDelay = 100,
    hideDelay = 200
  } = options

  let hoverTimeout: number | null = null
  let hideTimeout: number | null = null

  function shouldShowToolbar(nodeType: string): boolean {
    return supportedNodeTypes.includes(nodeType)
  }

  function findNodeAtPos(view: EditorView, pos: number): { node: ProseMirrorNode; pos: number; domNode?: HTMLElement } | null {
    const $pos = view.state.doc.resolve(pos)
    
    // 向上查找第一个支持的节点类型
    for (let depth = $pos.depth; depth >= 0; depth--) {
      const node = $pos.node(depth)
      const nodePos = $pos.start(depth)
      
      if (shouldShowToolbar(node.type.name)) {
        // 尝试获取对应的DOM节点
        let domNode: HTMLElement | undefined
        try {
          const domPos = view.domAtPos(nodePos)
          if (domPos.node) {
            // 如果是文本节点，获取其父元素
            let currentNode = domPos.node.nodeType === Node.TEXT_NODE 
              ? domPos.node.parentElement as HTMLElement
              : domPos.node as HTMLElement
            
            // 向上查找到实际的节点容器
            while (currentNode && currentNode !== view.dom) {
              // 检查是否是我们要查找的节点类型
              if (currentNode.matches && (
                currentNode.matches('p, h1, h2, h3, h4, h5, h6, blockquote, pre') ||
                currentNode.hasAttribute('data-node-view-root') ||
                currentNode.matches('[data-type]') ||
                currentNode.classList.contains('ProseMirror-node')
              )) {
                domNode = currentNode
                break
              }
              currentNode = currentNode.parentElement as HTMLElement
            }
          }
        } catch (error) {
          console.warn('Failed to get DOM node:', error)
        }
        
        return { node, pos: nodePos, domNode }
      }
    }
    
    return null
  }

  function updatePluginState(
    view: EditorView, 
    state: Partial<HoverToolbarPluginState>
  ) {
    view.dispatch(
      view.state.tr.setMeta(HoverToolbarPluginKey, state)
    )
  }

  function showToolbar(view: EditorView, node: ProseMirrorNode, pos: number, domNode?: HTMLElement) {
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }

    updatePluginState(view, {
      hoveredNodePos: pos,
      hoveredNodeType: node.type.name,
      hoveredNode: node,
      hoveredDomNode: domNode || null,
      toolbarVisible: true
    })
  }

  function hideToolbar(view: EditorView) {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
      hoverTimeout = null
    }

    hideTimeout = setTimeout(() => {
      updatePluginState(view, {
        hoveredNodePos: null,
        hoveredNodeType: null,
        hoveredNode: null,
        hoveredDomNode: null,
        toolbarVisible: false
      })
      hideTimeout = null
    }, hideDelay)
  }

  return new Plugin<HoverToolbarPluginState>({
    key: HoverToolbarPluginKey,
    
    state: {
      init(): HoverToolbarPluginState {
        return {
          hoveredNodePos: null,
          hoveredNodeType: null,
          hoveredNode: null,
          hoveredDomNode: null,
          toolbarVisible: false
        }
      },
      
      apply(tr, oldState): HoverToolbarPluginState {
        const meta = tr.getMeta(HoverToolbarPluginKey)
        if (meta) {
          return { ...oldState, ...meta }
        }
        return oldState
      }
    },
    
    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          const target = event.target as HTMLElement

          // 忽略工具栏本身的鼠标事件
          if (target.closest('.hover-toolbar')) {
            return false
          }

          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) {
            hideToolbar(view)
            return false
          }

          const nodeInfo = findNodeAtPos(view, pos.pos)
          if (!nodeInfo) {
            hideToolbar(view)
            return false
          }

          const { node, pos: nodePos, domNode } = nodeInfo
          const currentState = HoverToolbarPluginKey.getState(view.state)

          // 如果是同一个节点，不需要重新显示
          if (currentState?.hoveredNodePos === nodePos) {
            return false
          }

          // 清除之前的定时器
          if (hoverTimeout) {
            clearTimeout(hoverTimeout)
          }

          // 延迟显示工具栏
          hoverTimeout = setTimeout(() => {
            showToolbar(view, node, nodePos, domNode)
            hoverTimeout = null
          }, hoverDelay)

          return false
        },

        mouseleave(view, event) {
          const relatedTarget = event.relatedTarget as HTMLElement
          
          // 如果鼠标移动到工具栏，不隐藏
          if (relatedTarget?.closest('.hover-toolbar')) {
            return false
          }

          hideToolbar(view)
          return false
        }
      }
    },

    // 清理定时器
    destroy() {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout)
      }
      if (hideTimeout) {
        clearTimeout(hideTimeout)
      }
    }
  })
}

// 导出工具函数，供外部组件使用
export function getHoverToolbarState(view: EditorView): HoverToolbarPluginState | null {
  return HoverToolbarPluginKey.getState(view.state) || null
}

export function setHoverToolbarVisibility(view: EditorView, visible: boolean) {
  const currentState = HoverToolbarPluginKey.getState(view.state)
  if (currentState) {
    view.dispatch(
      view.state.tr.setMeta(HoverToolbarPluginKey, {
        ...currentState,
        toolbarVisible: visible
      })
    )
  }
}