// TOC 相关的类型定义

export interface TocItem {
  id: string
  title: string
  level: number
  isActive?: boolean
  isScrolledOver?: boolean
  metadata?: Record<string, any> // 扩展字段，不同类型可以存储特定数据
}

export type UnsubscribeFn = () => void

// 通用的 TOC 提供者接口
export interface TocProvider {
  /**
   * 获取当前的 TOC 项目列表
   */
  getTocItems(): TocItem[]
  
  /**
   * 导航到指定的 TOC 项目
   * @param id TOC 项目的唯一标识
   */
  navigateToItem(id: string): void
  
  /**
   * 监听 TOC 更新事件
   * @param callback 当 TOC 更新时调用的回调函数
   * @returns 取消订阅的函数
   */
  onTocUpdate(callback: (items: TocItem[]) => void): UnsubscribeFn
  
  /**
   * 销毁 provider，清理资源
   */
  destroy(): void
  
  /**
   * 加载状态
   */
  isLoading: boolean
  
  /**
   * 重命名TOC项目对应的标题（可选）
   */
  renameHeading?(id: string, newText: string): boolean
  
  /**
   * 删除TOC项目对应的标题（可选）
   */
  deleteHeading?(id: string): boolean
  
  /**
   * 移动TOC项目（可选）
   */
  moveHeading?(dragId: string, dropId: string, position: 'before' | 'after' | 'inside'): boolean
  
  /**
   * 更新TOC数据（用于Markdown类型）
   */
  updateFromTipTap?(tipTapTocData: any): void
}

// 空的 TOC 提供者，用于不支持 TOC 的文档类型
export class EmptyTocProvider implements TocProvider {
  isLoading = false
  
  getTocItems(): TocItem[] {
    return []
  }
  
  navigateToItem(id: string): void {
    // 空实现
  }
  
  onTocUpdate(callback: (items: TocItem[]) => void): UnsubscribeFn {
    // 立即调用一次回调，返回空数组
    callback([])
    // 返回空的取消订阅函数
    return () => {}
  }
  
  destroy(): void {
    // 空实现
  }
}