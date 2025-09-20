import { computed, reactive } from 'vue'
import type { IStatusBarManager, IStatusBarItem, IStatusBarGroup, IBasicStatusBarItem, StatusBarItemOptions, StatusBarGroupOptions } from '../types'
import { StatusBarAlignment } from '../types'
import { StatusBarItem } from './StatusBarItem'
import { StatusBarGroup } from './StatusBarGroup'

/**
 * StatusBarManager implementation
 * Manages all StatusBarItem instances with Vue reactivity
 */
export class StatusBarManager implements IStatusBarManager {
  private _items = reactive<IBasicStatusBarItem[]>([])
  private _itemCounter = 0
  
  createStatusBarItem(options: StatusBarItemOptions): IStatusBarItem {
    const { 
        id = `statusbar-item-${++this._itemCounter}`,
        alignment = StatusBarAlignment.Left,
        priority = 0
    } = options;

    if (this._items.find(item => item.id === id)) {
      throw new Error(`StatusBarItem with id '${id}' already exists`)
    }

    const item = new StatusBarItem(id, alignment, priority)
    // 一定要返回经过reactive后的对象，不然，通过createStatusBarItem获取到的对象，是没有VUE的响应式能力的
    this._items.push(item)
    return this._items[this._items.length - 1] as IStatusBarItem
  }

  createStatusBarGroup(options: StatusBarGroupOptions): IStatusBarGroup {
    const { 
        id = `statusbar-group-${++this._itemCounter}`,
        alignment = StatusBarAlignment.Left,
        priority = 0,
        separator = ''
    } = options;

    if (this._items.find(item => item.id === id)) {
      throw new Error(`StatusBarGroup with id '${id}' already exists`)
    }

    const group = new StatusBarGroup(id, alignment, priority, separator)
    // 一定要返回经过reactive后的对象，不然，通过createStatusBarGroup获取到的对象，是没有VUE的响应式能力的
    this._items.push(group)
    return this._items[this._items.length - 1] as IStatusBarGroup
  }
  
  getItem(id: string): IBasicStatusBarItem | undefined {
    return this._items.find(item => item.id === id)
  }

  getAllItems(): IBasicStatusBarItem[] {
    return [...this._items]
  }

  getItemsByAlignment(alignment: StatusBarAlignment): IBasicStatusBarItem[] {
    return this._items
      .filter(item => item.alignment === alignment && item.visible)
      .sort((a, b) => b.priority - a.priority) // Higher priority = more left
  }

  /**
   * Get reactive computed value for items by alignment
   * This ensures the StatusBar component can properly react to all changes
   */
  getReactiveItemsByAlignment(alignment: StatusBarAlignment) {
    return computed(() => {
      return this._items
        .filter(item => item.alignment === alignment && item.visible)
        .sort((a, b) => b.priority - a.priority)
    })
  }
  
  removeItem(id: string): boolean {
    const index = this._items.findIndex(item => item.id === id)
    if (index !== -1) {
      const item = this._items[index]!
      item.dispose()
      this._items.splice(index, 1)
      return true
    }
    return false
  }

  clear(): void {
    this._items.forEach(item => item.dispose())
    this._items.length = 0
  }
}