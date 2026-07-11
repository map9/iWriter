import type { Component } from 'vue'

/**
 * 一个可折叠 / 可关闭 / 可拖拽调整高度的分栏视图。
 * SplitView 以此数组驱动；父组件持有该数组（单一数据源），
 * SplitView 会就地更新 `collapsed` / `size`（拖拽），并通过事件通知关闭。
 */
export interface SplitPane {
  /** 唯一标识；对应 SplitView 的具名插槽 `#<id>` 与 `#<id>-actions` */
  id: string
  /** 头部标题 */
  title: string
  /** 是否可折叠（默认 true） */
  collapsible?: boolean
  /** 是否可关闭（默认 false；必选 pane 设 false） */
  closable?: boolean
  /** 运行时：是否折叠 */
  collapsed?: boolean
  /** 运行时：是否可见（false=已关闭/隐藏；默认 true） */
  visible?: boolean
  /** 运行时：展开时的 flex 权重（默认 1，拖拽时更新） */
  size?: number
  /** 头部右侧徽标（如变更数） */
  badge?: string | number
  /** 头部标题前图标（可选） */
  icon?: Component
}
