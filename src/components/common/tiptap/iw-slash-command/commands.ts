import type { Component } from 'vue'
import {
  IconH1, IconH2, IconH3,
  IconList, IconListNumbers, IconListCheck,
  IconQuote, IconCode, IconMath, IconMinus,
  IconTable, IconPhoto, IconChartDots,
} from '@tabler/icons-vue'

export interface SlashCommandItem {
  id: string
  labelKey: string
  descKey: string
  groupKey: string
  icon: Component
  /** 搜索别名（含中英文），不含 labelKey 自身，命中 labelKey 由外部处理 */
  keywords: string[]
  /** 传给 onEditorMenuAction 的 action id */
  action: string
}

export const slashCommands: SlashCommandItem[] = [
  // ── 标题 ────────────────────────────────────────────────
  {
    id: 'heading-1',
    labelKey: 'slashCommand.items.heading1.label',
    descKey: 'slashCommand.items.heading1.desc',
    groupKey: 'slashCommand.groups.headings',
    icon: IconH1,
    keywords: ['h1', 'heading 1', '标题1', '一级标题', '#'],
    action: 'heading-1',
  },
  {
    id: 'heading-2',
    labelKey: 'slashCommand.items.heading2.label',
    descKey: 'slashCommand.items.heading2.desc',
    groupKey: 'slashCommand.groups.headings',
    icon: IconH2,
    keywords: ['h2', 'heading 2', '标题2', '二级标题', '##'],
    action: 'heading-2',
  },
  {
    id: 'heading-3',
    labelKey: 'slashCommand.items.heading3.label',
    descKey: 'slashCommand.items.heading3.desc',
    groupKey: 'slashCommand.groups.headings',
    icon: IconH3,
    keywords: ['h3', 'heading 3', '标题3', '三级标题', '###'],
    action: 'heading-3',
  },

  // ── 列表 ────────────────────────────────────────────────
  {
    id: 'bullet-list',
    labelKey: 'slashCommand.items.bulletList.label',
    descKey: 'slashCommand.items.bulletList.desc',
    groupKey: 'slashCommand.groups.lists',
    icon: IconList,
    keywords: ['ul', 'unordered', 'bullet', '无序列表', '列表', '-'],
    action: 'bullet-list',
  },
  {
    id: 'ordered-list',
    labelKey: 'slashCommand.items.orderedList.label',
    descKey: 'slashCommand.items.orderedList.desc',
    groupKey: 'slashCommand.groups.lists',
    icon: IconListNumbers,
    keywords: ['ol', 'ordered', 'numbered', '有序列表', '编号列表', '1.'],
    action: 'ordered-list',
  },
  {
    id: 'task-list',
    labelKey: 'slashCommand.items.taskList.label',
    descKey: 'slashCommand.items.taskList.desc',
    groupKey: 'slashCommand.groups.lists',
    icon: IconListCheck,
    keywords: ['todo', 'task', 'checkbox', '任务列表', '待办', '- []'],
    action: 'task-list',
  },

  // ── 块级 ────────────────────────────────────────────────
  {
    id: 'insert-quote-block',
    labelKey: 'slashCommand.items.blockquote.label',
    descKey: 'slashCommand.items.blockquote.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconQuote,
    keywords: ['quote', 'blockquote', '引用', '>'],
    action: 'insert-quote-block',
  },
  {
    id: 'set-alert-note',
    labelKey: 'slashCommand.items.alertNote.label',
    descKey: 'slashCommand.items.alertNote.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconQuote,
    keywords: ['alert', 'note', 'callout', '提示', '[!NOTE]'],
    action: 'set-alert-note',
  },
  {
    id: 'set-alert-tip',
    labelKey: 'slashCommand.items.alertTip.label',
    descKey: 'slashCommand.items.alertTip.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconQuote,
    keywords: ['alert', 'tip', 'callout', '建议', '[!TIP]'],
    action: 'set-alert-tip',
  },
  {
    id: 'set-alert-important',
    labelKey: 'slashCommand.items.alertImportant.label',
    descKey: 'slashCommand.items.alertImportant.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconQuote,
    keywords: ['alert', 'important', 'callout', '重要', '[!IMPORTANT]'],
    action: 'set-alert-important',
  },
  {
    id: 'set-alert-warning',
    labelKey: 'slashCommand.items.alertWarning.label',
    descKey: 'slashCommand.items.alertWarning.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconQuote,
    keywords: ['alert', 'warning', 'callout', '警告', '[!WARNING]'],
    action: 'set-alert-warning',
  },
  {
    id: 'set-alert-caution',
    labelKey: 'slashCommand.items.alertCaution.label',
    descKey: 'slashCommand.items.alertCaution.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconQuote,
    keywords: ['alert', 'caution', 'callout', '注意', '[!CAUTION]'],
    action: 'set-alert-caution',
  },
  {
    id: 'set-alert-beat',
    labelKey: 'slashCommand.items.alertBeat.label',
    descKey: 'slashCommand.items.alertBeat.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconQuote,
    keywords: ['alert', 'beat', '节拍', '[!BEAT]'],
    action: 'set-alert-beat',
  },
  {
    id: 'set-alert-comment',
    labelKey: 'slashCommand.items.alertComment.label',
    descKey: 'slashCommand.items.alertComment.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconQuote,
    keywords: ['alert', 'comment', '批注', '评论', '[!COMMENT]'],
    action: 'set-alert-comment',
  },
  {
    id: 'insert-code-block',
    labelKey: 'slashCommand.items.codeBlock.label',
    descKey: 'slashCommand.items.codeBlock.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconCode,
    keywords: ['code', 'codeblock', 'pre', '代码块', '```'],
    action: 'insert-code-block',
  },
  {
    id: 'insert-math-block',
    labelKey: 'slashCommand.items.mathBlock.label',
    descKey: 'slashCommand.items.mathBlock.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconMath,
    keywords: ['math', 'equation', 'latex', '数学', '公式', '$$'],
    action: 'insert-math-block',
  },
  {
    id: 'insert-mermaid-block',
    labelKey: 'slashCommand.items.mermaidBlock.label',
    descKey: 'slashCommand.items.mermaidBlock.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconChartDots,
    keywords: ['mermaid', 'diagram', 'flowchart', 'sequence', 'graph', '图表', '流程图', '时序图'],
    action: 'insert-mermaid-block',
  },
  {
    id: 'horizontal-rule',
    labelKey: 'slashCommand.items.horizontalRule.label',
    descKey: 'slashCommand.items.horizontalRule.desc',
    groupKey: 'slashCommand.groups.blocks',
    icon: IconMinus,
    keywords: ['hr', 'divider', 'rule', 'separator', '分隔线', '---'],
    action: 'horizontal-rule',
  },

  // ── 表格 ────────────────────────────────────────────────
  {
    id: 'insert-table',
    labelKey: 'slashCommand.items.table.label',
    descKey: 'slashCommand.items.table.desc',
    groupKey: 'slashCommand.groups.table',
    icon: IconTable,
    keywords: ['table', '表格'],
    action: 'insert-table',
  },

  // ── 媒体 ────────────────────────────────────────────────
  {
    id: 'insert-local-media',
    labelKey: 'slashCommand.items.image.label',
    descKey: 'slashCommand.items.image.desc',
    groupKey: 'slashCommand.groups.media',
    icon: IconPhoto,
    keywords: ['image', 'photo', 'picture', 'img', '图片', '图像'],
    action: 'insert-local-media',
  },
]
