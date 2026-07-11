import type { Component } from 'vue'

/**
 * 一个可折叠 / 可关闭 / 可拖拽调整高度的分栏视图。
 * SplitView 以此数组驱动；父组件持有该数组（单一数据源），
 * SplitView 会就地更新 `collapsed` / `size`（拖拽），并通过事件通知关闭。
 *
 * 「锚点」语义：`collapsible: false` 的 pane 为锚点——永不折叠、无折叠图标、
 * 无关闭按钮、标题栏不可点击。其余 pane 为普通 view——可折叠、带关闭按钮、
 * 点击标题栏折叠/展开。必须至少有一个锚点；若无任何 pane 显式标记
 * `collapsible: false`，则第一个可见 pane 自动作为锚点（fallback），
 * 以保证内容区永远有至少一个 view 可见。关闭能力由 `collapsible` 推导，
 * 无需单独配置。
 */
export interface SplitPane {
  /** 唯一标识；对应 SplitView 的具名插槽 `#<id>` 与 `#<id>-actions` */
  id: string
  /** 头部标题 */
  title: string
  /** 是否可折叠（默认 true）。设为 false = 锚点：不折叠 / 无关闭按钮 / 标题不可点击 */
  collapsible?: boolean
  /** 运行时：是否折叠（锚点忽略此字段，始终展开） */
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
