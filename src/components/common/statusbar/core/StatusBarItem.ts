import type {
  IStatusBarItem,
  Command,
  StatusBarEvent,
  TooltipContent 
} from '../types'
import { StatusBarItemType, StatusBarAlignment, StatusBarEventType } from '../types'

/**
 * StatusBarItem implementation
 * Reactive Vue-based implementation of VSCode's StatusBarItem interface
 */
export class StatusBarItem implements IStatusBarItem {
  readonly id: string
  readonly type = StatusBarItemType.Item
  readonly alignment: StatusBarAlignment
  readonly priority: number

  // Simple properties - rely on external reactive tracking
  text: string = ''
  tooltip?: TooltipContent
  name?: string
  color?: string
  backgroundColor?: string
  command?: string | Command
  visible: boolean = false
  
  // Event callbacks
  private _eventCallbacks = new Map<string, Function[]>()
  
  constructor(
    id: string,
    alignment: StatusBarAlignment = StatusBarAlignment.Left,
    priority: number = 0
  ) {
    this.id = id
    this.alignment = alignment
    this.priority = priority
  }
  
  // Methods
  show(): void {
    if (!this.visible) {
      this.visible = true
      this._emit(StatusBarEventType.Show)
    }
  }

  hide(): void {
    if (this.visible) {
      this.visible = false
      this._emit(StatusBarEventType.Hide)
    }
  }

  dispose(): void {
    this.hide()
    this._eventCallbacks.clear()
    this._emit(StatusBarEventType.Dispose)
  }
  
  // Event system
  on(event: string, callback: Function): void {
    if (!this._eventCallbacks.has(event)) {
      this._eventCallbacks.set(event, [])
    }
    this._eventCallbacks.get(event)?.push(callback)
  }
  
  off(event: string, callback?: Function): void {
    if (!callback) {
      this._eventCallbacks.delete(event)
    } else {
      const callbacks = this._eventCallbacks.get(event)
      if (callbacks) {
        const index = callbacks.indexOf(callback)
        if (index !== -1) {
          callbacks.splice(index, 1)
        }
      }
    }
  }
  
  private _emit(type: string, data?: any): void {
    const callbacks = this._eventCallbacks.get(type)
    if (callbacks) {
      const event: StatusBarEvent = { type, item: this, data }
      callbacks.forEach(callback => callback(event))
    }
  }
  
}