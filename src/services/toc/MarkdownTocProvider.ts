import { ref, type Ref } from 'vue'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/vue-3'
import type { TableOfContentData } from '@tiptap/extension-table-of-contents'
import type { TocProvider, TocItem, UnsubscribeFn } from '@/types/toc'

export class MarkdownTocProvider implements TocProvider {
  private editor: Editor
  private tocItems: Ref<TocItem[]>
  private updateCallbacks: Set<(items: TocItem[]) => void>
  private unsubscribeTipTapToc: (() => void) | null = null

  constructor(editor: Editor) {
    this.editor = editor
    this.tocItems = ref<TocItem[]>([])
    this.updateCallbacks = new Set()
    
    this.setupTipTapTocListener()
  }

  private setupTipTapTocListener(): void {
    // 监听 TipTap 编辑器的 TOC 变化
    // 由于 TipTap 的 TableOfContents extension 通过 onUpdate 回调更新
    // 我们需要在创建时就建立这个连接
    
    // 获取当前 TOC 数据并转换格式
    this.updateTocFromTipTap([])
  }

  private updateTocFromTipTap(tipTapTocData: TableOfContentData): void {
    const tocItems: TocItem[] = tipTapTocData.map((item, index) => ({
      id: item.id,
      title: item.textContent || `Heading ${index + 1}`,
      level: item.level,
      isActive: item.isActive,
      isScrolledOver: item.isScrolledOver,
      metadata: {
        itemIndex: item.itemIndex || index + 1,
        originalTipTapItem: item
      }
    }))

    this.tocItems.value = tocItems
    
    // 通知所有监听器
    this.updateCallbacks.forEach(callback => {
      callback(tocItems)
    })
  }

  /**
   * 设置 TipTap TOC 数据
   * 这个方法由 MarkdownEditorPage 调用，用于更新 TOC 数据
   */
  updateFromTipTap(tipTapTocData: TableOfContentData): void {
    this.updateTocFromTipTap(tipTapTocData)
  }

  getTocItems(): TocItem[] {
    return this.tocItems.value
  }

  navigateToItem(id: string): void {
    if (!this.editor) {
      console.warn('Editor is not available for navigation')
      return
    }

    try {
      // 查找对应的 DOM 元素
      const element = this.editor.view.dom.querySelector(`[data-toc-id="${id}"]`)
      if (!element) {
        console.warn(`TOC element with id "${id}" not found`)
        return
      }

      // 获取元素在编辑器中的位置
      const pos = this.editor.view.posAtDOM(element, 0)

      // 设置编辑器选择和焦点
      const tr = this.editor.view.state.tr
      tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
      this.editor.view.dispatch(tr)
      this.editor.view.focus()

      // 更新浏览器历史记录
      if (history.pushState) {
        history.pushState(null, null as any, `#${id}`)
      }

      // 平滑滚动到元素
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })

      // 更新活跃状态
      this.updateActiveState(id)

    } catch (error) {
      console.error('Failed to navigate to TOC item:', error)
      
      // 降级处理：尝试通过 data 属性查找元素
      const fallbackElement = document.querySelector(`[data-toc-id="${id}"]`)
      if (fallbackElement) {
        fallbackElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        this.updateActiveState(id)
      }
    }
  }

  private updateActiveState(activeId: string): void {
    // 更新 TOC 项目的活跃状态
    const updatedItems = this.tocItems.value.map(item => ({
      ...item,
      isActive: item.id === activeId,
      isScrolledOver: false // 重置滚动状态
    }))

    this.tocItems.value = updatedItems

    // 通知监听器
    this.updateCallbacks.forEach(callback => {
      callback(updatedItems)
    })
  }

  onTocUpdate(callback: (items: TocItem[]) => void): UnsubscribeFn {
    // 添加回调到集合
    this.updateCallbacks.add(callback)
    
    // 立即调用一次回调，提供当前数据
    callback(this.tocItems.value)

    // 返回取消订阅函数
    return () => {
      this.updateCallbacks.delete(callback)
    }
  }

  destroy(): void {
    // 清理所有回调
    this.updateCallbacks.clear()
    
    // 清理 TipTap 监听器
    if (this.unsubscribeTipTapToc) {
      this.unsubscribeTipTapToc()
      this.unsubscribeTipTapToc = null
    }
    
    // 清空 TOC 数据
    this.tocItems.value = []
  }

  /**
   * 检查编辑器是否仍然可用
   */
  isEditorAvailable(): boolean {
    return this.editor && !this.editor.isDestroyed
  }

  /**
   * 获取编辑器实例（用于调试或高级用法）
   */
  getEditor(): Editor {
    return this.editor
  }
}