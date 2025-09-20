import type { ComputedRef } from 'vue'
import type { TooltipContent } from './tooltip'

/**
 * StatusBar alignment options
 * Mimics VSCode's StatusBarAlignment enum
 */
export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

/**
 * StatusBar item types
 */
export enum StatusBarItemType {
  Item = 'item',
  Group = 'group'
}

/**
 * StatusBarItem event types
 */
export enum StatusBarEventType {
  Click = 'click',
  Show = 'show',
  Hide = 'hide',
  Update = 'update',
  Dispose = 'dispose'
}

/**
 * Command interface for StatusBarItem actions
 */
export interface Command {
  command: string
  title?: string
  arguments?: any[]
}

/**
 * Basic StatusBar item interface - common properties for both Item and Group
 */
export interface IBasicStatusBarItem {
  // Core properties
  readonly id: string
  readonly type: StatusBarItemType
  readonly alignment: StatusBarAlignment
  readonly priority: number

  // State
  visible: boolean

  // Styling properties
  color?: string
  backgroundColor?: string

  // Methods
  show(): void
  hide(): void
  dispose(): void
}

/**
 * StatusBarItem interface
 * Mimics VSCode's StatusBarItem interface
 */
export interface IStatusBarItem extends IBasicStatusBarItem {
  readonly type: StatusBarItemType.Item

  // Display properties
  text: string
  tooltip?: TooltipContent
  name?: string

  // Interaction properties
  command?: string | Command
}

export interface StatusBarItemOptions {
  id?: string
  alignment?: StatusBarAlignment
  priority?: number
}

export interface StatusBarGroupOptions {
  id?: string
  alignment?: StatusBarAlignment
  priority?: number
  separator?: string
}

/**
 * StatusBarGroup interface - container for organizing multiple items
 */
export interface IStatusBarGroup extends IBasicStatusBarItem {
  readonly type: StatusBarItemType.Group
  readonly items: IStatusBarItem[]
  separator?: string

  createStatusBarItem(id?: string): IStatusBarItem
  getItem(id: string): IStatusBarItem | undefined
  getItems(): IStatusBarItem[]
  removeItem(itemId: string): boolean
  clear(): void
}

/**
 * StatusBarManager interface
 */
export interface IStatusBarManager {
  createStatusBarItem(options: StatusBarItemOptions): IStatusBarItem
  createStatusBarGroup(options: StatusBarGroupOptions): IStatusBarGroup
  getItem(id: string): IBasicStatusBarItem | undefined
  getAllItems(): IBasicStatusBarItem[]
  getItemsByAlignment(alignment: StatusBarAlignment): IBasicStatusBarItem[]
  getReactiveItemsByAlignment(alignment: StatusBarAlignment): ComputedRef<IBasicStatusBarItem[]>
  removeItem(id: string): boolean
  clear(): void
}

/**
 * StatusBar event data
 */
export interface StatusBarEvent {
  type: string
  item: IBasicStatusBarItem
  data?: any
}