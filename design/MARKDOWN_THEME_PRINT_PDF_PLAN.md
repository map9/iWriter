# Markdown Theme / Print / PDF 设计方案

## 概述

本文档定义 iWriter 后续的 Markdown 内容主题系统，以及 PDF / Print 输出中的页面设置、分页策略、页眉页脚、运行时覆盖机制。

该方案用于替代“编辑器显示 CSS 与打印主题分离且能力不对称”的当前状态，作为后续数据结构调整、偏好设置设计、打印对话框重构与 CSS 生成器改造的依据。

本文档聚焦：

- Markdown 内容主题的语义与边界
- 屏幕显示主题与打印主题的关系
- 打印 & PDF 默认设置与临时覆盖机制
- 基于 paged.js 的分页、对页、页边栏（margin boxes）设计
- 偏好设置与打印对话框的 UX 结构

---

## 背景

当前项目中：

- Markdown 编辑器内容样式主要位于 `src/components/pages/markdown-editor/style.scss`
- 打印主题位于 `src/components/print/printThemes.ts`
- 打印 CSS 由 `src/components/print/buildPrintCss.ts` 生成
- 打印预览基于 paged.js

当前问题：

1. 屏幕显示与打印主题是两套并行机制，语义未统一。
2. 打印主题主要是 CSS 文本，尚未承载结构化的页面设置、分页策略、页眉页脚能力。
3. 打印对话框中的部分选项是运行时状态，尚未形成“主题默认值 + 用户默认覆盖 + 本次临时覆盖”的稳定模型。

---

## 目标

1. 建立统一的 `MarkdownTheme` 概念。
2. 允许屏幕显示与打印分别选择主题，但复用一套主题定义结构。
3. 将页面设置、分页、页眉页脚的默认值纳入主题定义。
4. 允许偏好设置保存默认覆盖，但不改写主题原始定义。
5. 允许 Print / PDF 对话框做本次输出的临时覆盖。
6. 明确用 paged.js 实际可支持的能力设计分页与页边栏模型。

---

## 非目标

1. 不做 App 内置的 CSS 编辑器（用户在外部编辑器修改主题文件）。
2. 不做主题市场或主题包在线导入。
3. 不将所有打印行为抽象为完全结构化样式对象，仍保留 CSS-first 的主题表达。

---

## 核心原则

### 1. Theme 只提供默认值

`MarkdownTheme` 定义的是文稿风格和打印默认排版规则，不是用户最终输出结果。

### 2. 应用配置与主题分离

用户当前使用什么屏幕主题、什么打印主题，属于“应用配置”而不是主题定义本身。

### 3. 覆盖是应用时行为

页面设置、分页策略、页眉页脚等，允许在偏好设置和打印/PDF 对话框中覆盖，但覆盖只作用于输出，不回写主题定义。

### 4. CSS-first，结构辅助

主题中的核心内容排版仍以 CSS 为主，但页面设置、分页策略、页眉页脚模板等采用结构化字段定义，以便 UI 与运行时合并。

---

## 核心模型

最终输出参数的优先级：

```text
theme defaults
  < preferences overrides
  < print/pdf dialog runtime overrides
```

这三层分别含义如下：

1. `theme defaults`
   来自 `MarkdownTheme` 的默认设置。

2. `preferences overrides`
   用户在偏好设置里设定的默认打印 & PDF 行为。

3. `runtime overrides`
   用户在本次 Print / PDF 对话框中临时修改的参数。

---

## 主题语义

### 是否允许显示和打印使用不同主题

允许。

但这里不是建立两套完全独立的主题系统，而是：

- 主题定义统一为 `MarkdownTheme`
- 每个主题内部同时可以有 `screen` 与 `print` 两个部分
- 应用时允许屏幕选一个 theme，打印选另一个 theme

例如：

- 屏幕主题：`github`
- 打印主题：`novel`

这在语义上是成立的，因为：

- `MarkdownTheme` 代表“内容主题”
- 当前文档如何应用它，属于“主题分配”问题

不建议拆成完全独立的 `ScreenTheme` / `PrintTheme` 两套体系，否则共享 token、共享语义元素样式、共享主题管理入口都会变复杂。

---

## 数据结构草案

### MarkdownTheme

```ts
interface MarkdownTheme {
  id: string
  name: string
  description?: string

  tokens?: ThemeTokens

  screen: {
    css: string
  }

  print: {
    css: string
    pageDefaults: PageSetup
    paginationDefaults: PaginationSetup
    headerFooterDefaults: HeaderFooterSetup
    runningTitleDefaults?: RunningTitleSetup
  }
}
```

### 当前应用中的主题分配

```ts
interface MarkdownThemeAssignment {
  screenThemeId: string
  printThemeId: string
  printUsesScreenTheme: boolean
}

interface MarkdownPrintPreferences {
  themeAssignment: MarkdownThemeAssignment
  printOverrides: MarkdownPrintOverrides
}

interface MarkdownPrintOverrides {
  pageSetup?: PageSetupOverrides
  pagination?: PaginationOverrides
  headerFooter?: HeaderFooterOverrides
  runningTitle?: Partial<RunningTitleSetup>
}
```

### 运行时覆盖

```ts
interface PrintRuntimeOverrides {
  themeAssignment?: {
    printThemeId?: string
    printUsesScreenTheme?: boolean
  }
  pageSetup?: PageSetupOverrides
  pagination?: PaginationOverrides
  headerFooter?: HeaderFooterOverrides
  runningTitle?: Partial<RunningTitleSetup>
}
```

---

## 页面设置模型

### 设计要求

- 支持普通页面边距
- 支持 Facing Pages
- 支持 recto / verso 起始页语义
- 支持页面大小与方向
- 支持是否打印背景

### 结构

```ts
interface PageSetup {
  size: PageSizeValue
  orientation: 'portrait' | 'landscape'

  marginMode: 'single' | 'facing'
  margins: SinglePageMargins | FacingPageMargins

  pageSideStart: 'auto' | 'recto' | 'verso'
  background: boolean
}

interface SinglePageMargins {
  top: string
  right: string
  bottom: string
  left: string
}

interface FacingPageMargins {
  top: string
  bottom: string
  inside: string
  outside: string
}
```

### 实现映射

1. `single`
   生成统一的 `@page { margin: ... }`

2. `facing`
   生成：
   - `@page`
   - `@page :left`
   - `@page :right`

3. `pageSideStart`
   用于控制文档或章节是否从：
   - `auto`
   - `recto`
   - `verso`

与 paged media 中的 `break-before: right` / `left` 对应。

---

## 覆盖语义补充

### 1. themeAssignment 的职责

- `MarkdownThemeAssignment` 只负责“当前屏幕 / 打印主题的选择”
- 偏好设置中的结构化页面与排版调整，统一放入 `MarkdownPrintPreferences.printOverrides`
- Print / PDF 对话框中的本次临时调整，统一放入 `PrintRuntimeOverrides`

### 2. Print / PDF 对话框中的主题切换

Print / PDF 对话框允许临时切换打印主题，因此 `PrintRuntimeOverrides` 允许覆盖：

- `printThemeId`
- `printUsesScreenTheme`

但不允许在运行时修改 `screenThemeId`。

### 3. 页眉页脚 slot 的清空语义

为了支持“上层有默认值，但下层显式清空”的场景，slot map 的覆盖规则定义如下：

- `undefined`
  表示没有覆盖，继续继承上一层
- `template: ''`
  表示显式清空该 slot
- 其他非空模板
  表示显式覆盖该 slot

### 4. 合并规则

结构化设置在合并时采用：

- 标量字段：后者覆盖前者
- `keepWithNext` / `avoidBreakInside`：按字段深合并
- `slots` / `firstPageSlots` / `leftPageSlots` / `rightPageSlots`：逐 slot 深合并

最终生成打印 CSS 前，必须先将：

```text
theme defaults
  < preferences overrides
  < print/pdf dialog runtime overrides
```

解析为一份完整的 `ResolvedMarkdownPrintSettings`，再交给 CSS 生成器使用。

---

## 分页策略模型

### 设计原则

分页策略必须基于 paged.js 与 CSS Paged Media 能表达的能力来设计，避免抽象出运行时不可落地的策略。

### 结构

```ts
interface PaginationSetup {
  mode: 'balanced' | 'compact' | 'strict-book'

  keepWithNext: {
    headings: boolean
    figureCaption: boolean
    tableCaption: boolean
  }

  avoidBreakInside: {
    paragraph: boolean
    blockquote: boolean
    codeBlock: boolean
    table: boolean
    tableRow: boolean
    image: boolean
    listItem: boolean
  }

  widows: number | null
  orphans: number | null

  chapterStartSide: 'auto' | 'recto' | 'verso'
  blankPageBehavior: 'allow' | 'suppress-header-footer'
}
```

### 首选分页策略

第一版 UI 中，“首选分页策略”提供三个预设：

#### 1. Balanced

适用于大多数普通文档。

- 标题尽量与后续内容保持同页
- 图片、代码块、引用块尽量不拆分
- 表格允许分页，但尽量避免拆行
- 页面较均衡，避免大面积空白

#### 2. Compact

适用于节省页数。

- 允许更多内容跨页
- 减少 `avoid-break-inside`
- 降低对整块保留的要求
- 更少空白页

#### 3. Strict Book

适用于书稿、正式 PDF、章节文档。

- 标题强 keep-with-next
- blockquote、code block、image、table row 尽量不拆
- 可要求章节从 recto 开始
- 空白页可以自动隐藏页眉页脚

### CSS / paged.js 映射建议

- `break-before`
- `break-after`
- `break-inside`
- `page-break-before`
- `page-break-after`
- `page-break-inside`
- `widows`
- `orphans`
- `@page :blank`

---

## 页眉页脚模型

### 设计要求

1. 支持上、下、左、右页边栏的多位置布局。
2. 不能只支持“上左中右 / 下左中右”。
3. 支持预置模板和自定义模板。
4. 开放页码、总页数、标题、章节名、日期等变量。

### 槽位模型

paged.js 实际支持 16 个 margin boxes。为了避免未来再改 schema，数据结构直接支持 16 个位置。

```ts
type MarginBoxSlot =
  | 'top-left-corner'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'top-right-corner'
  | 'left-top'
  | 'left-middle'
  | 'left-bottom'
  | 'right-top'
  | 'right-middle'
  | 'right-bottom'
  | 'bottom-left-corner'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-right-corner'
```

### UI 呈现策略

第一版产品 UI：

- 默认展示 12 个主位置
- 高级设置中再开放 4 个 corner 位置

默认展示的 12 个位置：

- `top-left`
- `top-center`
- `top-right`
- `left-top`
- `left-middle`
- `left-bottom`
- `right-top`
- `right-middle`
- `right-bottom`
- `bottom-left`
- `bottom-center`
- `bottom-right`

### 内容结构

```ts
interface HeaderFooterSetup {
  enabled: boolean
  slots: Partial<Record<MarginBoxSlot, MarginBoxContent>>
  differentFirstPage: boolean
  differentLeftRight: boolean
}

interface MarginBoxContent {
  template: string
  textAlign?: 'auto' | 'left' | 'center' | 'right'
  enabled?: boolean
}
```

### 变量开放

第一版建议开放以下模板变量：

```ts
interface HeaderFooterVariables {
  documentTitle: string
  chapterTitle: string
  sectionTitle: string
  printDate: string
  pageNo: number
  totalPages: number
}
```

对应模板变量名：

- `${documentTitle}`
- `${chapterTitle}`
- `${sectionTitle}`
- `${printDate}`
- `${pageNo}`
- `${totalPages}`

### 预置模板

建议内置以下模板供快速选择：

- 空
- `${documentTitle}`
- `${chapterTitle}`
- `${sectionTitle}`
- `${printDate}`
- `Page ${pageNo}`
- `Page ${pageNo} of ${totalPages}`
- `${documentTitle} · ${pageNo}`
- `${chapterTitle} · ${pageNo}`
- `${documentTitle} · ${printDate}`

用户也可以自行输入模板字符串。

---

## 运行标题来源

为了让 `${chapterTitle}` / `${sectionTitle}` 可用，需要定义运行标题来源。

```ts
interface RunningTitleSetup {
  chapterSource: 'none' | 'h1' | 'h2'
  sectionSource: 'none' | 'h2' | 'h3'
}
```

建议默认值：

- `chapterSource: 'h1'`
- `sectionSource: 'h2'`

后续实现可通过 `string-set` 或 `running()` 机制与 paged.js 集成。

---

## 偏好设置设计

偏好设置中新增 `打印 & PDF` 面板。

### 分组结构

#### 1. Markdown Theme

- 屏幕主题
- 打印 & PDF 主题
- 打印是否跟随屏幕主题

#### 2. 页面设置

- 纸张大小
- 页面方向
- 边距模式：普通 / 对页
- 边距数值
- 起始页：自动 / recto / verso
- 是否打印背景

#### 3. 分页 / 页眉页脚

- 首选分页策略
- 高级分页项
- 是否启用页眉页脚
- 12 宫格位置配置
- 首页不同
- 奇偶页不同
- 模板变量说明与快捷模板

### 持久化语义

偏好设置保存的是“默认覆盖值”，不是主题本身。

即：

- 用户修改偏好设置，不改 `MarkdownTheme`
- 偏好设置只影响默认输出行为

---

## Print / PDF 对话框设计

打印对话框与 PDF 导出对话框复用同一组结构，但作用域仅限本次输出。

### 分组结构

#### 1. Markdown Theme

- 本次屏幕主题无需显示
- 本次打印 & PDF 主题可修改
- 可选择跟随偏好设置 / 临时切换

#### 2. 页面设置

- 纸张大小
- 页面方向
- 普通 / 对页边距
- 起始页语义
- 背景

#### 3. 分页 / 页眉页脚

- 首选分页策略
- 页眉页脚位置
- 页眉页脚模板
- 首页不同
- 奇偶页不同

### 作用域

这些修改属于 `runtime overrides`，打印结束后失效，不回写到主题，也不强制回写偏好设置。

---

## CSS 生成策略

最终打印 CSS 建议按四层组合：

1. `base print css`
   全局稳定基础规则。

2. `theme.print.css`
   当前打印主题提供的内容排版风格。

3. `structured print setup css`
   由 `PageSetup`、`PaginationSetup`、`HeaderFooterSetup`、`RunningTitleSetup` 编译出的 CSS。

4. `dialog runtime override css`
   本次对话框覆盖生成的最终覆盖层。

即：

```ts
const finalCss = [
  basePrintCss,
  selectedTheme.print.css,
  buildStructuredPrintCss(resolvedPrintConfig),
  buildRuntimeOverrideCss(runtimeOverrides),
].join('\n')
```

注意：

- 页眉页脚模板变量需要在 CSS 生成阶段替换或转译
- `pageNo` / `totalPages` 这类变量最终要映射到 paged.js 的 `counter(page)` / `counter(pages)`
- `differentFirstPage`、`differentLeftRight` 需要编译到 `@page :first`、`@page :left`、`@page :right`

---

## 与 paged.js 的对应关系

本方案明确建立在 paged.js 支持的 paged media 能力上。

重点包括：

- `@page`
- `@page :first`
- `@page :left`
- `@page :right`
- `@page :blank`
- 16 个 margin boxes
- `counter(page)`
- `counter(pages)`
- `string-set`
- `position: running(...)`
- `break-before`
- `break-after`
- `break-inside`

参考：

- Paged.js Generated Content in Margin Boxes
- Paged.js 对 `counter(page)` / `counter(pages)` 的支持

---

## 内置主题（已全部实现 ✅）

4 个内置 `MarkdownTheme`，定义于 `src/components/print/markdownThemes.ts`。

Screen CSS 通过 `--md-*` CSS 自定义属性驱动 `style.scss` 中的统一变量系统；Print CSS 覆盖全部 Markdown 元素（h1–h6、p、ul/ol、task list、blockquote、table 含交替行色、inline code、pre code、img、hr、mark、a、del、sub、sup、strong、em）。

### 1. github ✅

适合技术文档。

- Screen：参考 GitHub Markdown CSS（light），`background-color: #ffffff`
- Print：技术文档风格，h1/h2 带底边框分隔，表格带斑马纹

### 2. github-dark ✅

GitHub 深色主题，颜色 token 与 GitHub dark 原值一一对应。

- Screen：`background-color: #0d1117`，前景 `#e6edf3`，accent `#58a6ff`
- Print：深色背景打印，pageDefaults `background: true`

### 3. prose ✅

适合通用文章阅读。

- Screen：参考 Tailwind Typography 比例与间距，衬线正文字体，`max-width: 68ch`
- Print：舒适阅读文章风格，blockquote 带背景色

### 4. novel ✅

适合长文与书稿。

- Screen：宽松正文排版，两端对齐，较大行高（1.85）
- Print：Facing Pages 对页边距，strict-book 分页策略，首页不同页眉页脚

---

## 开源参考

### GitHub Markdown CSS

适合做技术文档类主题的视觉基线。

- https://github.com/sindresorhus/github-markdown-css

### Tailwind Typography

适合参考内容排版的比例系统、间距系统、颜色 token 组织。

- https://github.com/tailwindlabs/tailwindcss-typography

### Typora Theme System

适合参考产品层面的主题机制与 CSS 主题组织方式。

- https://support.typora.io/About-Themes/

### Paged.js

适合参考页边栏、页码、分页、对页、running content 的实现边界。

- https://pagedjs.org/en/documentation/7-generated-content-in-margin-boxes/

---

## 现有代码的演进方向

### 当前状态

- `src/components/print/printThemes.ts`
  仅定义打印主题 CSS

- `src/components/pages/markdown-editor/style.scss`
  同时混有编辑器行为样式与内容排版样式

### 建议演进

#### 1. 新增主题定义文件

建议新增：

- `src/components/print/markdownThemes.ts`
- `src/components/print/types.ts`

#### 2. 迁移内容排版样式

将 `.tiptap` 中真正属于 Markdown 内容主题的部分抽出到 `screen.css`：

- headings
- paragraph
- list
- blockquote
- table
- code / pre
- link
- hr

保留在编辑器层的样式：

- focus mode
- selection state
- ProseMirror selected node state
- table editing state
- search highlight
- proofread / popup tool / editor-only widget styles

#### 3. 改造打印 CSS 构建器

`buildPrintCss.ts` 由“主题 CSS + 对话框散装状态拼接”改为：

- 合并主题默认值
- 合并偏好设置覆盖
- 合并本次临时覆盖
- 生成结构化页面 CSS
- 生成最终模板变量 CSS

#### 4. 改造偏好设置与打印对话框状态

为 Print & PDF 引入统一的结构化配置对象，而不是只用零散的组件局部状态。

---

## 与现有文档的关系

本文档是对以下文档的扩展与上位设计：

- `design/print-theme-spec.md`
- `design/PRINT_PREVIEW.md`

其中：

- `print-theme-spec.md`
  描述了当前 print theme 的 MVP 机制

- 本文档
  定义下一阶段统一的 Markdown Theme + Print / PDF 输出模型

后续如果实现进入新阶段，应优先以本文档为准，再同步更新原有设计文档。

---

## 用户自定义主题系统

### 设计目标

允许用户在 App 外部编写 CSS 文件定义主题，App 自动发现并加载，支持热更新。

### 主题目录

```
~/.iwriter/markdown/themes/
  my-serif-theme/        ← 文件夹名 = 主题 ID = CSS class 后缀
    theme.json           ← 元数据 + 打印默认值（必须）
    screen.css           ← 编辑器屏幕样式（必须）
    print.css            ← 打印/PDF 样式（可选）
  dark-ink/
    theme.json
    screen.css
```

目录扫描规则：跳过 `_` 或 `.` 开头的子目录；文件夹名与内置 ID 冲突时跳过并记录 error。

### 主题 ID 与 CSS class 映射

**文件夹名即主题 ID**，直接映射为编辑器 CSS class：

```
文件夹名: my-serif-theme
主题 ID:  my-serif-theme
CSS class: .tiptap.markdown-theme-my-serif-theme
```

用户在 `screen.css` 中直接使用该 class，无需转义或前缀。

### theme.json 格式

```json
{
  "name": "My Serif Theme",
  "description": "A warm serif reading experience",
  "version": "1.0",
  "author": "Your Name",
  "print": {
    "pageSize": "A4",
    "pageOrientation": "portrait",
    "marginMode": "single",
    "marginTop": "20mm",
    "marginRight": "18mm",
    "marginBottom": "22mm",
    "marginLeft": "18mm",
    "background": false,
    "paginationMode": "balanced",
    "headerFooterEnabled": true,
    "headerLeft": "${documentTitle}",
    "headerRight": "${printDate}",
    "footerCenter": "Page ${pageNo} of ${totalPages}",
    "differentFirstPage": false,
    "differentLeftRight": false,
    "chapterSource": "h1",
    "sectionSource": "h2"
  }
}
```

`print` 字段及其所有子字段均可选，缺省时 fallback 到全局默认值。`name` 字段必须；若 `theme.json` 缺失，以文件夹名作为 name。

### screen.css 约定

```css
/* 文件夹 my-serif-theme → class .tiptap.markdown-theme-my-serif-theme */

.tiptap.markdown-theme-my-serif-theme {
  /* CSS 自定义属性（完整变量列表见 App 生成的示例主题） */
  --md-font-family: Georgia, serif;
  --md-line-height: 1.75;
  --md-body-color: #2d2d2d;
  /* ... */
}

/* 额外的元素级样式 */
.tiptap.markdown-theme-my-serif-theme h1 {
  letter-spacing: -0.02em;
}
```

### 类型系统

```ts
// 内置 ID 收窄类型（仅作文档用，不参与运行时判断）
export type BuiltInMarkdownThemeId = 'github' | 'github-dark' | 'prose' | 'novel'

// 主题 ID 放宽为 string，接受自定义主题
export type MarkdownThemeId = string

// 打印清单（扁平化，利于 JSON 编辑）
export interface CustomThemeManifestPrint {
  pageSize?: PageSizeValue
  pageOrientation?: 'portrait' | 'landscape'
  marginMode?: 'single' | 'facing'
  marginTop?: string; marginRight?: string
  marginBottom?: string; marginLeft?: string
  marginInside?: string; marginOutside?: string
  background?: boolean
  pageSideStart?: 'auto' | 'recto' | 'verso'
  paginationMode?: PaginationModePreset
  headerFooterEnabled?: boolean
  headerLeft?: string; headerCenter?: string; headerRight?: string
  footerLeft?: string; footerCenter?: string; footerRight?: string
  differentFirstPage?: boolean; differentLeftRight?: boolean
  chapterSource?: 'none' | 'h1' | 'h2' | 'h3'
  sectionSource?: 'none' | 'h2' | 'h3' | 'h4'
}

export interface CustomThemeManifest {
  name: string
  description?: string; version?: string; author?: string
  print?: CustomThemeManifestPrint
}

// 主进程向渲染进程传递的原始数据（可 JSON 序列化）
export interface RawCustomTheme {
  id: string          // = 文件夹名
  folderPath: string
  screenCss: string
  printCss: string    // 空字符串表示无 print.css
  manifest: CustomThemeManifest
  errors: string[]    // 非致命加载错误
}
```

### 主进程：CustomThemeLoader

文件：`electron/CustomThemeLoader.ts`

| 方法 | 作用 |
|---|---|
| `load()` | 扫描目录，返回 `RawCustomTheme[]` |
| `openFolder()` | `shell.openPath` 打开主题目录 |
| `createExampleTheme()` | 首次使用时生成带完整注释的示例主题 |
| `watchThemes(cb)` | chokidar depth:2 监听，变更后 debounce 500ms reload |

### IPC 设计

```
Renderer → Main（invoke）
  custom-themes:load            → RawCustomTheme[]
  custom-themes:open-folder     → void
  custom-themes:create-example  → RawCustomTheme[]（创建后立即返回）

Main → Renderer（push event）
  custom-themes:changed         → RawCustomTheme[]
```

Preload 暴露：`window.electronAPI.customThemes.{ load, openFolder, createExample, onChanged, removeChangedListeners }`

### 渲染进程：主题注册表

在 `markdownThemes.ts` 中维护两个模块级 `shallowRef`：

- `_customThemes: shallowRef<MarkdownTheme[]>` — 已转换的主题对象，供主题选择器等 UI 使用
- `_rawCustomThemes: shallowRef<RawCustomTheme[]>` — 原始数据，供 Preferences UI 显示加载状态和错误信息

```ts
// 注册自定义主题（同时刷新 screen stylesheet）
// raw 参数可选，用于在 Preferences 中展示原始加载状态
registerCustomThemes(themes: MarkdownTheme[], raw?: RawCustomTheme[]): void

// 将 RawCustomTheme 转为完整 MarkdownTheme（应用工厂函数填充默认值）
buildMarkdownThemeFromRaw(raw: RawCustomTheme): MarkdownTheme

// 统一获取内置 + 自定义主题列表（依赖 _customThemes shallowRef，computed 可响应）
getAllMarkdownThemes(): MarkdownTheme[]

// 获取原始自定义主题数据（依赖 _rawCustomThemes shallowRef）
getRawCustomThemes(): readonly RawCustomTheme[]
```

`getMarkdownThemeById`、`buildMarkdownScreenThemeStyleSheet`、`createResolvedMarkdownPrintSettings` 均改用 `getAllMarkdownThemes()`。

### 热更新流程

```
文件变更
  → chokidar 触发
  → debounce 500ms
  → CustomThemeLoader.load()
  → BrowserWindow.getAllWindows() 广播 custom-themes:changed
  → 渲染进程 onChanged 回调（App.vue applyRawCustomThemes）
  → buildMarkdownThemeFromRaw() each
  → registerCustomThemes(converted, raw)
      ├── _customThemes.value = converted  ← 主题选择器 computed 自动失效
      ├── _rawCustomThemes.value = raw     ← Preferences 列表 computed 自动失效
      └── ensureMarkdownScreenThemeStyleSheet() 重写 <style> 标签
  → UI 主题列表、Preferences 状态列表同步刷新
```

### 设置页 UI（已实现）

位于 Preferences → Display (themes) 标签页，在"Markdown Screen Theme"区块与"App Theme"区块之间插入：

```
Custom Themes                          [Create Example]  [Open Folder]
┌─────────────────────────────────────────────────────────────────────┐
│  （无主题时）暂无自定义主题，请将主题文件夹放置于                       │
│  ~/.iwriter/markdown/themes/                                        │
└─────────────────────────────────────────────────────────────────────┘

（有主题时，每项一行）
✓  My Serif Theme
   my-serif-theme

⚠  Dark Ink
   dark-ink
   screen.css not found
```

- 状态图标：`IconCheck`（绿色）表示加载成功，`IconAlertTriangle`（橙色）表示有错误
- 错误信息逐条列出在主题名下方
- "Open Folder" 调用 `customThemes.openFolder()` → `shell.openPath`
- "Create Example" 调用 `customThemes.createExample()` → 在主题目录生成带完整注释的示例，并返回最新 `RawCustomTheme[]` 刷新列表

---

## 分阶段建议

### Phase 1 ✅

建立数据结构与主题定义层：`MarkdownTheme`、`PageSetup`、`PaginationSetup`、`HeaderFooterSetup`、`RunningTitleSetup`

### Phase 2 ✅（部分）

重构打印 CSS 生成器：主题默认值、偏好设置覆盖、临时覆盖、模板变量替换

### Phase 3

偏好设置新增 `打印 & PDF` 面板。

### Phase 4

打印 & PDF 对话框改造为同一套结构化配置 UI。

### Phase 5

逐步将编辑器中的 Markdown 内容样式迁移到 screen theme。

### Phase 6 ✅

用户自定义主题系统（本节设计）：

- `CustomThemeLoader`（主进程）
- IPC bridge 扩展
- 渲染进程主题注册表（`registerCustomThemes`、`buildMarkdownThemeFromRaw`、`getAllMarkdownThemes`、`getRawCustomThemes`）
- `App.vue` 启动加载 + 热更新监听
- 组件层 `builtInMarkdownThemes` → `getAllMarkdownThemes()` 替换
- Preferences UI 新增 Custom Themes 管理区块

---

## 决策摘要

1. 使用统一的 `MarkdownTheme` 体系，不拆分成完全独立的 ScreenTheme / PrintTheme 系统。
2. 允许屏幕与打印分别选择不同 theme id。
3. 页面设置、分页策略、页眉页脚默认值纳入 theme 的 `print` 定义。
4. 偏好设置只保存覆盖值，不修改主题定义。
5. 打印 & PDF 对话框的修改属于本次输出覆盖。
6. 页边距支持普通模式与 Facing Pages。
7. 支持 recto / verso 起始页语义。
8. 页眉页脚底层结构直接支持 16 个 paged.js margin boxes。
9. UI 第一版默认显示 12 个主位置，corner 位置作为高级项。
10. 页眉页脚模板开放 `${documentTitle}`、`${chapterTitle}`、`${sectionTitle}`、`${printDate}`、`${pageNo}`、`${totalPages}`。
11. 首选分页策略第一版提供 `balanced`、`compact`、`strict-book` 三种预设。
12. 自定义主题目录：`~/.iwriter/markdown/themes/`，文件夹名即主题 ID 即 CSS class 后缀。
13. `MarkdownThemeId` 放宽为 `string`，内置 ID 以 `BuiltInMarkdownThemeId` 收窄类型单独保留。
14. 自定义主题 `theme.json` 使用扁平化 print 字段，渲染进程负责转换为结构化 `MarkdownTheme`。
15. 文件夹名与内置 ID 冲突时，内置主题优先，自定义主题跳过并记录 error。
16. `registerCustomThemes` 接受可选第二参数 `raw: RawCustomTheme[]`，同时维护 `_rawCustomThemes shallowRef`，供 Preferences UI 直接展示加载状态与错误信息，无需重复 IPC 调用。
