# TAB_VIEW_REFACTOR.md — Tab / Page 体系重构需求与设计

> 状态：草案 v0.1（2026-07-11）
> 定位：把当前**以文件文档为中心**的 tab 体系，重构为**可扩展的多种 Page 类型**体系，为 Diff Viewer 及后续新 tab 类型（设置页、Agent 输出、图片对比等）打地基。
> 触发：SOURCE_CONTROL 的 Diff Viewer 需要作为编辑区 tab 呈现，而现有 tab 模型无法承载"非文件、只读、参数化、不持久化"的视图。

---

## 1. 背景与问题

### 1.1 现状
tab 的全部路由与能力判断都挂在 `FileTab.documentType`（`DocumentType` 枚举）上：

- 枚举 `src/types/document-type.ts`：`MARKDOWN_EDITOR / PDF_VIEWER / IMAGE_VIEWER / OFFICE_VIEWER / UNKNOWN`。
- 渲染路由 `src/views/MainView.vue`：`v-for tab` → `v-if / v-else-if` 链按 `documentType` 选 Page 组件；每种 Page 各有一个**独立的 typed ref 数组**（`markdownEditorRefs / imageViewerRefs / pdfViewerRefs / officeViewerRefs`）；`getActivePageRef()` 用 `switch(documentType)` 回查激活页。
- 能力判断 `src/utils/DocumentTypeDetector.ts`：`isEditable / isReadOnly / getIconByType / getDisplayName` 全是**硬编码 switch**。
- 生命周期 `src/stores/app.ts`：`canEditTab / canSaveTab / canRunAutoSave / canRunProofread`、外部变更监听 `reloadOpenMarkdownTabFromDisk / handleOpenTabExternalChange`、去重 `findExistingTab`、持久化 `workspaceStateSnapshot` —— 大量 `=== DocumentType.MARKDOWN_EDITOR` 分支。
- 状态栏 `src/components/statusbar-items/file-stats.ts`：按 `documentType` 决定显示字数/文件类型。
- 持久化 `src/utils/StateStorage.ts`：`WorkspaceState.tabs` 只存 `{ path, documentType }`，重启按 **path** 重开。

**规模**：`documentType` 出现在 **11 个文件、约 60 处**。

### 1.2 隐含假设（正是要打破的）
| 假设 | 现实反例 |
| --- | --- |
| 每个 tab 都是磁盘上的文件（有 `path`） | Welcome、Diff、（未来）设置页、Agent 输出无 path |
| tab 内容加载进共享 `editorInstance`（TipTap） | pdf/image/office 各自加载；diff 自取内容 |
| tab 可编辑、可 dirty、可保存 | 所有 viewer 只读、永不 dirty |
| 持久化/去重以 `path` 为身份 | 参数化 tab（diff）身份是"对比规格"，非 path |
| 重启按 path 重开 | diff/welcome 是临时视图，不应恢复 |

### 1.3 目标
1. 新增一种 tab 类型 = **注册一个描述符 + 一个 Page 组件**，不再散点修改路由/图标/能力/持久化/去重多处。
2. tab 可以是**文件文档**，也可以是**非文件视图**（临时或参数化）。
3. 现有 markdown/pdf/image/office 行为**零回归**。
4. 为 Diff Viewer（本次驱动需求）提供落点。

### 1.4 范围外
- 不改 TipTap 编辑器本身、不改 markdown 转换管线。
- 不做 tab 分屏（split editor group）——保留为未来。
- 不引入路由库（vue-router）——仍是 Pinia 驱动的自管 tab 列表。

---

## 2. Tab 可能性梳理（分类学）

按维度拆解一个 tab 的"种类"，用来定义能力模型：

| 维度 | 取值 | 说明 |
| --- | --- | --- |
| **D1 后端/身份** | 文件型(path) / 参数型(params) / 单例(singleton) | 去重与持久化的依据 |
| **D2 可编辑性** | 可编辑 / 只读 | 决定工具栏、菜单、保存 |
| **D3 脏/保存** | 可 dirty+可保存 / 永不 dirty | 决定关闭确认、autosave、状态点 |
| **D4 持久化** | 按 path 恢复 / 按 params 恢复 / 不恢复(ephemeral) | 决定 workspace 快照 |
| **D5 内容来源** | 载入共享 editorInstance / 页面自取(path) / 页面自取(params) | 决定内容加载路径 |
| **D6 外部变更** | 监听磁盘变化并提示/重载 / 不关心 | 仅文件型编辑 tab 关心 |
| **D7 统计** | 字数/阅读统计 / 仅文件类型 / 无 | 状态栏 file-stats |

### 2.1 现有 + 近期 tab 类型对照

| Kind | D1 身份 | D2 | D3 | D4 持久化 | D5 内容 | D6 | D7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `markdown-editor` | 文件(path) | 可编辑 | 可 dirty/保存 | 按 path | 共享 editor | ✅监听 | 字数 |
| `pdf-viewer` | 文件(path) | 只读 | 否 | 按 path | 自取(path) | ✗ | 文件类型 |
| `image-viewer` | 文件(path) | 只读 | 否 | 按 path | 自取(path) | ✗ | 文件类型 |
| `office-viewer` | 文件(path) | 只读 | 否 | 按 path | 自取(path) | ✗ | 文件类型 |
| `unknown` | 文件(path) | 只读 | 否 | 按 path | —（引导） | ✗ | 文件类型 |
| **`diff-viewer`（新）** | **参数(diffSpec)** | 只读 | 否 | **不恢复** | **自取(params)** | ✗ | 无 |
| _welcome（现为无 tab 态）_ | 单例 | 只读 | 否 | 不恢复 | — | ✗ | 无 |
| _settings-as-tab（未来）_ | 参数(section) | — | 否 | 可按 params | 自取 | ✗ | 无 |

> 结论：现有四种"文件型"tab 共享 D1/D4/D5 假设，恰好掩盖了耦合。`diff-viewer` 是第一个打破"文件=path"假设的类型，故必须先做能力抽象。

---

## 3. 设计

### 3.1 核心：TabKind 描述符注册表

保留字段名 `documentType`（60 处引用，改名纯属 churn 无收益），**在概念上把它理解为 `TabKind`**，并把散落的 switch 收敛到一张**描述符注册表**。

```ts
// src/types/tab-kind.ts（新）
import type { Component } from 'vue'
import type { FileTab } from './file-tab'

export interface TabKindDescriptor {
  kind: DocumentType
  /** 懒加载的 Page 组件 */
  component: () => Promise<Component>

  // —— 身份与去重 ——
  /** 返回该 tab 的去重身份键；命中则激活而非新建 */
  identityOf(tab: FileTab): string | null

  // —— 能力（取代 DocumentTypeDetector 的硬编码 switch）——
  editable: boolean          // 可进入编辑
  saveable: boolean          // 可保存到磁盘
  dirtyCapable: boolean      // 参与 isDirty / 关闭确认 / autosave
  watchesDisk: boolean       // 监听外部文件变更
  persistable: boolean       // 是否写入 workspace 快照

  // —— 呈现 ——
  icon(tab: FileTab): Component
  displayName: string
  title(tab: FileTab): string      // tab tooltip

  // —— 持久化（仅 persistable 时）——
  serialize?(tab: FileTab): SerializedTab
  hydrate?(data: SerializedTab): CreateTabInput
}

export const TAB_KINDS: Record<DocumentType, TabKindDescriptor> = { /* … */ }
export function tabKind(tab: FileTab): TabKindDescriptor
```

**能力查询**（替换全部 `=== MARKDOWN_EDITOR` 硬判断）：
```ts
tabKind(tab).editable      // 原 canEditTab 的类型判断部分
tabKind(tab).saveable
tabKind(tab).dirtyCapable
tabKind(tab).watchesDisk
tabKind(tab).persistable
```
`isTabReadonly / isFileReadonly / isEditReadonly`（实例级 readonly）逻辑保留，与 kind 级 `editable` 叠加：`canEditTab = tabKind(tab).editable && !isTabReadonly(tab)`。

### 3.2 FileTab 分层（本次收敛 `docState`，已决 Q2=收敛）

先按实测用法把现有字段分三层（避免把"共享字段"误当 markdown 专属）：

| 层 | 字段 | 依据（实测） |
| --- | --- | --- |
| **L1 通用**（所有 kind） | `id / name / path? / documentType / params? / isActive / isDirty / metadata? / fileReadonly? / editReadonly?` | 全 kind 共用 |
| **L2 文件态**（有 path 的文件型） | `diskState / lastSavedHash` | 外部变更/删除生命周期；TitleBar 对所有文件型 tab 读 `diskState` |
| **L3 文档编辑态**（仅可编辑编辑器 = markdown） | `editorInstance / savedCheckPoint / editState / fileStats` | 仅 `MARKDOWN_EDITOR` 读写（app.ts / MarkdownEditorPage / SearchPanel / file-stats） |
| **跨层共享** | `tocProvider` | **markdown + pdf 都用**（`PDFViewerPage` 也读 `tab.tocProvider`），故**不进 L3**，保留顶层 |

> ⚠️ 纠正上一版：`tocProvider / diskState / lastSavedHash` **不是** markdown 专属——`tocProvider` 被 PDF viewer 共享，`diskState/lastSavedHash` 是文件型通用。真正 markdown 专属的只有 L3 四个字段，本次仅收敛这四个。

```ts
export interface FileTab {
  // —— L1 通用 ——
  id: string
  name: string
  path?: string
  documentType?: DocumentType
  params?: TabParams            // 新增：参数型 tab 载荷（diffSpec 落此，仿 pendingImport）
  isActive: boolean
  isDirty: boolean
  metadata?: FileMetadata
  fileReadonly?: boolean
  editReadonly?: boolean
  // —— L2 文件态（有 path 时）——
  diskState?: DocumentDiskState
  lastSavedHash?: string
  // —— 跨层共享 ——
  tocProvider?: TocProvider     // markdown + pdf 共用，保留顶层
  // —— L3 文档编辑态（收敛，仅 markdown 填充）——
  docState?: MarkdownDocState
}

/** 仅可编辑编辑器 tab 持有；viewer/diff/welcome 恒为 undefined */
export interface MarkdownDocState {
  editorInstance?: unknown      // TipTap Editor
  savedCheckPoint?: number      // undoDepth 基准
  editState?: EditSetting       // 行尾/首行缩进/校对等 per-tab 设置
  fileStats?: FileStats         // 字数/光标/选区统计
}

// 参数型 tab 的联合载荷
export type TabParams =
  | { kind: 'diff'; diff: DiffSpec }
  // 未来： | { kind: 'settings'; section: string } | …
```

**收敛迁移（字段重命名，一次到位）**：`tab.editorInstance → tab.docState?.editorInstance`，`savedCheckPoint / editState / fileStats` 同理。触及读写点：`src/stores/app.ts`、`src/components/pages/MarkdownEditorPage.vue`、`src/components/sidebar/SearchPanel.vue`、`src/components/statusbar-items/file-stats.ts`、`src/components/sidebar/TocPanel.vue`（`fileStats` 相关）。创建 markdown tab 时初始化 `docState = { editState: {...globalEditSetting} }`。

### 3.3 MainView 路由收敛

把 `v-if/else-if` 链 + 4 个 typed ref 数组 + `getActivePageRef` switch，收敛为**单一动态组件 + 一张 ref 映射表**：

```vue
<div v-for="tab in appStore.tabs" :key="tab.id" :class="tab.isActive ? 'document-page' : 'hidden'">
  <component
    :is="pageComponentFor(tab)"
    :ref="el => setPageRef(tab.id, el)"
    :tab="tab"
  />
</div>
```
```ts
const pageRefs = new Map<string, PageExposed>()          // 取代 4 个数组
function setPageRef(id, el) { el ? pageRefs.set(id, el) : pageRefs.delete(id) }
function getActivePageRef() { return activeTab.value ? pageRefs.get(activeTab.value.id) ?? null : null }
function pageComponentFor(tab) { return asyncComponents[tabKind(tab).kind] }  // 懒加载缓存
```
所有 Page 继续 `defineExpose({ handleMenuAction, updateMenuFormattingState, tab })`；viewer 页给空实现（已是现状）。非激活 tab 仍以 `hidden` class 保持挂载、状态不丢。

### 3.4 生命周期改动点（逐项映射）

| 位置 | 现状 | 改为 |
| --- | --- | --- |
| `canEditTab`(app.ts:198) | `=== MARKDOWN_EDITOR && !readonly` | `tabKind(tab).editable && !isTabReadonly(tab)` |
| `canSaveTab / canRunAutoSave` | readonly 判断 | 叠加 `tabKind(tab).saveable / dirtyCapable` |
| `reloadOpenMarkdownTabFromDisk`(2172) `handleOpenTabExternalChange`(2218) | `=== MARKDOWN_EDITOR` | `tabKind(tab).watchesDisk`（现仅 markdown 为真，行为不变） |
| `findExistingTab`(2488) | path+type / name+type | 优先 `tabKind(tab).identityOf(tab)`；文件型回落 path+type |
| `workspaceStateSnapshot`(3206) | `filter(tab => tab.path)` | `filter(tab => tabKind(tab).persistable)`；序列化走 `descriptor.serialize` |
| 恢复（loadWorkspaceState 后重开） | 按 path openFile | persistable 且有 `hydrate` 的按 params 恢复；diff 类不在快照中，自然不恢复 |
| `getActivePageRef`(250) | switch | map 查表（见 §3.3） |
| TitleBar `getTabIcon`(306) | 按扩展名 | `tabKind(tab).icon(tab)`；文件型仍按扩展名 |
| TitleBar dirty 点 / 🔒 | 无条件 | `dirtyCapable` 才显示脏点；`editable` 才有编辑 readonly 语义 |
| `DocumentTypeDetector.isEditable/isReadOnly/getIconByType/getDisplayName` | 硬编码 switch | 委托注册表（或标记 deprecated，逐步替换） |
| `file-stats.ts` | `=== MARKDOWN_EDITOR` | 用 `tabKind` 能力位（有无字数统计） |

### 3.5 持久化契约

```ts
// StateStorage.WorkspaceState.tabs 元素：从 { path, documentType } 泛化为
type SerializedTab =
  | { kind: DocumentType; path: string }            // 文件型（现状兼容）
  | { kind: DocumentType; params: TabParams }        // 参数型（未来）
```
- 旧数据（无 `kind` 字段、只有 `path/documentType`）向后兼容：读取时映射为 `{ kind: documentType, path }`。
- `diff-viewer.persistable = false` → 不进快照 → 重启不恢复（符合 VSCode 语义）。

---

## 4. 实施顺序（一次到位，已决 Q4=一次完成）

**一个交付（非分期），** 内部按下列顺序推进以便逐步编译/自测；全部完成后再合入。回归面较大，靠 §5 验收清单守护。

| 步 | 内容 |
| --- | --- |
| **S1 能力注册表** | 建 `src/types/tab-kind.ts`：`TabKindDescriptor` + `TAB_KINDS` + `tabKind()`；填 markdown/pdf/image/office/unknown 五个描述符。 |
| **S2 FileTab 分层 + docState 收敛** | 加 `params`；把 L3 四字段迁入 `docState`（`editorInstance/savedCheckPoint/editState/fileStats`），改所有读写点（app.ts / MarkdownEditorPage / SearchPanel / file-stats / TocPanel）。 |
| **S3 能力查询替换硬判断** | `canEditTab/canSaveTab/canRunAutoSave/watchesDisk/persistable` 及外部变更监听、`file-stats`、去重 `identityOf`、持久化 filter 全部改查 `tabKind()`；`DocumentTypeDetector` 能力方法委托注册表。 |
| **S4 MainView 路由收敛** | `v-if` 链 + 4 个 typed ref 数组 + `getActivePageRef` switch → 单一 `<component :is>` + `pageRefs` map。 |
| **S5 持久化契约泛化** | `SerializedTab` 泛化 + 旧数据向后兼容；`persistable=false` 的 kind 不进快照。 |

> 完成 S1–S5 后，`=== MARKDOWN_EDITOR` 的硬编码 switch 清零，新增 tab 类型只需注册描述符 + 写 Page 组件。SOURCE_CONTROL 的 `DIFF_VIEWER` 作为**第一个消费者**在此基础上落地（注册描述符：不可编辑/不可 dirty/不持久化/`identityOf`=diffSpec + 新增 `DiffViewerPage`）。

---

## 5. 验收标准
- 新增一个玩具 tab 类型，仅通过"注册描述符 + 写 Page 组件"即可显示、切换、去重、正确图标、不误入持久化——不改 MainView/TitleBar/app.ts 的分支代码。
- markdown/pdf/image/office 的打开、编辑、保存、脏标记、外部变更提示、重启恢复、状态栏统计**全部与重构前一致**。
- `diff-viewer` 可打开为 tab、可去重激活、只读无脏标记、重启不恢复。

---

## 6. 集成点（工程落点）

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 类型 | `src/types/document-type.ts` | 增 `DIFF_VIEWER`（后续新 kind 同此） |
| 类型 | `src/types/file-tab.ts` | 增 `params?: TabParams` |
| 注册表 | `src/types/tab-kind.ts`（新） | `TabKindDescriptor` + `TAB_KINDS` + `tabKind()` |
| 路由 | `src/views/MainView.vue` | T3 收敛为动态组件 + ref map |
| 能力 | `src/utils/DocumentTypeDetector.ts` | 能力方法委托注册表 |
| 生命周期 | `src/stores/app.ts` | 能力查询替换 `=== MARKDOWN_EDITOR`；去重/持久化改注册表驱动 |
| 持久化 | `src/utils/StateStorage.ts` | `SerializedTab` 泛化 + 向后兼容 |
| 标题栏 | `src/components/TitleBar.vue` | 图标/脏点/readonly 走能力位 |
| 状态栏 | `src/components/statusbar-items/file-stats.ts` | 走能力位 |

---

## 7. 已定决策（2026-07-11 拍板）
| # | 议题 | 决策 |
| --- | --- | --- |
| Q1 | `documentType` 改名为 `kind`？ | **不改**，保留 `documentType` 字段名（概念上等价 TabKind） |
| Q2 | markdown 专属字段收敛进 `docState`？ | **收敛**：仅 L3 四字段（`editorInstance/savedCheckPoint/editState/fileStats`）入 `docState`；`tocProvider/diskState/lastSavedHash` 因非 markdown 专属保留顶层（§3.2） |
| Q3 | Welcome 是否也 tab 化？ | **不 tab 化**，维持"无 tab 空态"；注册表仍预留单例 kind 结构 |
| Q4 | 迁移是否一次到 T4？ | **一次完成** S1–S5（§4），不分期 |
