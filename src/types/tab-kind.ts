// Tab 类型能力注册表（TabKind registry）
//
// 目的：把散落在 MainView / TitleBar / app.ts / DocumentTypeDetector / file-stats
// 中按 `documentType` 硬编码的 switch/`=== MARKDOWN_EDITOR` 判断，收敛到一张
// 按 kind 索引的描述符表。新增一种 tab 类型 = 注册一个描述符 + 写一个 Page 组件。
//
// 设计见 design/tab view refactor/TAB_VIEW_REFACTOR.md（§3.1）。
// 本文件为纯声明层，不含副作用；能力查询通过 `tabKind(tab)` 获取。

import type { FileTab } from './file-tab'
import { DocumentType } from './document-type'

export interface TabKindDescriptor {
  kind: DocumentType

  // 注：Page 组件懒加载映射与标题栏图标放在渲染层（MainView / TitleBar），
  // 不放这里——本文件被 electron 主进程 tsc 编译，不能引用 .vue / Vue 组件。

  // —— 能力位（取代 `=== MARKDOWN_EDITOR` 硬判断）——
  /** 可进入编辑（叠加实例级 readonly 才是最终可编辑） */
  editable: boolean
  /** 可保存到磁盘 */
  saveable: boolean
  /** 参与 isDirty / 关闭确认 / autosave */
  dirtyCapable: boolean
  /** 监听外部磁盘变更并提示/重载 */
  watchesDisk: boolean
  /** 是否写入 workspace 快照（重启恢复） */
  persistable: boolean

  // —— 呈现 ——
  displayName: string

  // —— 身份与去重 ——
  /**
   * 返回去重身份键；命中已存在 tab 则激活而非新建。
   * 返回 null / 不提供 → 沿用默认（有 path 按 path+kind，否则 name+kind）。
   * 参数型 tab（如 diff）在此按 params 生成身份键。
   */
  identityOf?: (tab: FileTab) => string | null
}

/** 文件型 viewer（pdf/image/office/unknown）的公共能力：只读、不脏、不监听、可持久化 */
const READONLY_FILE_VIEWER = {
  editable: false,
  saveable: false,
  dirtyCapable: false,
  watchesDisk: false,
  persistable: true,
} as const

export const TAB_KINDS: Record<DocumentType, TabKindDescriptor> = {
  [DocumentType.MARKDOWN_EDITOR]: {
    kind: DocumentType.MARKDOWN_EDITOR,
    editable: true,
    saveable: true,
    dirtyCapable: true,
    watchesDisk: true,
    persistable: true,
    displayName: 'Markdown 编辑器',
  },
  [DocumentType.PDF_VIEWER]: {
    kind: DocumentType.PDF_VIEWER,
    ...READONLY_FILE_VIEWER,
    displayName: 'PDF 查看器',
  },
  [DocumentType.IMAGE_VIEWER]: {
    kind: DocumentType.IMAGE_VIEWER,
    ...READONLY_FILE_VIEWER,
    displayName: '图片查看器',
  },
  [DocumentType.OFFICE_VIEWER]: {
    kind: DocumentType.OFFICE_VIEWER,
    ...READONLY_FILE_VIEWER,
    displayName: 'Office 查看器',
  },
  [DocumentType.UNKNOWN]: {
    kind: DocumentType.UNKNOWN,
    ...READONLY_FILE_VIEWER,
    displayName: '未知类型',
  },
  [DocumentType.DIFF_VIEWER]: {
    kind: DocumentType.DIFF_VIEWER,
    editable: false,
    saveable: false,
    dirtyCapable: false,
    watchesDisk: false,
    // 参数型临时视图：不进 workspace 快照，重启不恢复（对标 VSCode）
    persistable: false,
    displayName: 'Diff 查看器',
    // 按 DiffSpec 生成去重身份：同一文件的同一对比只开一个 tab
    identityOf: (tab) => {
      const p = tab.params
      if (p?.kind !== 'diff') return null
      const d = p.diff
      return `diff:${d.kind}:${d.staged ? 'index' : 'wt'}:${d.hash ?? ''}:${d.filePath}`
    },
  },
}

/** 取某 tab 的类型描述符；缺省回落到 MARKDOWN_EDITOR（与现有 createTab 默认一致）。 */
export function tabKind(tab: Pick<FileTab, 'documentType'> | null | undefined): TabKindDescriptor {
  const kind = tab?.documentType ?? DocumentType.MARKDOWN_EDITOR
  return TAB_KINDS[kind] ?? TAB_KINDS[DocumentType.MARKDOWN_EDITOR]
}
