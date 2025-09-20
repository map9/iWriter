import type { IStatusBarGroup, IStatusBarItem } from '../types'
import { StatusBarItemType, StatusBarAlignment } from '../types'
import { StatusBarItem } from './StatusBarItem'

export class StatusBarGroup implements IStatusBarGroup {
  readonly id: string
  readonly type = StatusBarItemType.Group
  readonly alignment: StatusBarAlignment
  readonly priority: number

  // Simple properties - rely on external reactive tracking
  visible: boolean = false
  color?: string
  backgroundColor?: string
  separator?: string

  private _items: IStatusBarItem[] = []
  private _itemCounter = 0

  constructor(
    id: string,
    alignment: StatusBarAlignment = StatusBarAlignment.Left,
    priority: number = 0,
    separator: string = ''
  ) {
    this.id = id
    this.alignment = alignment
    this.priority = priority
    this.separator = separator
  }

  get items(): IStatusBarItem[] {
    return this._items
  }

  // Simplified createStatusBarItem methods - inherit group's alignment
  createStatusBarItem(id?: string): IStatusBarItem {
    const itemId = id || `${this.id}-item-${++this._itemCounter}`

    if (this._items.find(item => item.id === itemId)) {
      throw new Error(`StatusBarItem with id '${itemId}' already exists in group '${this.id}'`)
    }

    const item = new StatusBarItem(itemId, this.alignment, 0)
    // 一定要返回经过reactive后的对象，不然，通过createStatusBarItem获取到的对象，是没有VUE的响应式能力的
    this._items.push(item)
    return this._items[this._items.length - 1]!
  }

  getItem(id: string): IStatusBarItem | undefined {
    return this._items.find(item => item.id === id)
  }

  getItems(): IStatusBarItem[] {
    return [...this._items]
  }

  removeItem(itemId: string): boolean {
    const index = this._items.findIndex(item => item.id === itemId)
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

  show(): void {
    this.visible = true
  }

  hide(): void {
    this.visible = false
  }

  dispose(): void {
    this.clear()
    this.hide()
  }
}