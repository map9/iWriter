# GFM Alert Extension

本文档描述 iWriter 支持 GFM Alert（GitHub 官方 Quote 扩展）以及 iWriter 内置扩展 Alert 类型的设计方案。

核心原则：Alert 是 blockquote 的语义增强，而不是与 blockquote 并列的全新块类型。iWriter 应保持 Markdown 源码兼容、编辑体验稳定、Agent 可读写，并允许创作流使用 `[!BEAT]`、批注流使用 `[!COMMENT]` 等扩展类型。

## 背景

GitHub Alert 是基于 blockquote 语法的 Markdown 扩展。官方格式如下：

```markdown
> [!NOTE]
> Useful information that users should know, even when skimming content.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

> [!WARNING]
> Urgent info that needs immediate user attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.
```

GitHub 官方支持五类：`NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION`。

iWriter 还已有创作 Agent 使用扩展形态，例如：

```markdown
> [!BEAT] [场景-1-节拍-1] 一句话核心点
```

文档批注、审阅和 Agent 协作还需要类似的扩展类型，例如：

```markdown
> [!COMMENT] 这一段的动机还需要再明确。
```

因此本设计必须把 Alert 类型扩展作为一等能力，而不是只写死 GitHub 五类。

## 当前工程情况

iWriter Markdown 编辑链路当前是：

- Markdown 读入：`src/import-export/formatConverter.ts` 使用 `marked` 将 Markdown 转为 HTML，再交给 TipTap 解析。
- Markdown 写出：同一文件使用 `TurndownService` 将 TipTap HTML 转回 Markdown。
- 编辑器扩展：`src/utils/editorExtensions.ts` 直接使用 `@tiptap/extension-blockquote`。
- 复制为 Markdown：`src/components/pages/markdown-editor/clipboard-operations.ts` 有独立的 `TurndownService`。
- Agent 文档视图：`src/ai/document/DocumentViewBuilder.ts` 将 `blockquote` 作为 opaque block 输出给 Agent。
- Agent 应用编辑：`src/ai/document/BlockEditApplier.ts` 使用 `marked -> HTML -> TipTap` 将 Agent 提交的 Markdown 应用回编辑器。
- 菜单：`electron/MenuManager.ts` 里有被注释的 Alert 菜单雏形，`src/components/pages/markdown-editor/menu-action.ts` 里已有 `insert-alert-*` 的 unsupported case。
- 样式：`src/components/print/markdownThemes.ts` 的 GitHub / GitHub Dark 主题已经包含 `.markdown-alert`、`.markdown-alert-note` 等样式和打印 CSS，但普通编辑主题尚未完整接入 Alert 节点生成。

实测当前 `marked` 会把 `> [!NOTE]` 解析为普通 blockquote，第一行文本是 `[!NOTE]`。如果不增加解析和序列化支持，TipTap 层拿不到 Alert 类型信息，读写也无法稳定 round-trip。

## 设计结论

采用“扩展 blockquote 属性”的方案。

在 TipTap 层仍使用节点名 `blockquote`，但增加 Alert 类型属性：

```ts
interface BlockquoteAttrs {
  alertType: string | null
}
```

语义如下：

- `alertType === null`：普通引用块。
- `alertType !== null`：Alert 引用块。
- `alertType` 使用规范化后的类型名，建议大写，例如 `NOTE`、`TIP`、`BEAT`、`COMMENT`。
- Alert 显示 label 由 `alertType` 派生，不作为独立可编辑字段。

HTML 形态：

```html
<blockquote
  class="markdown-alert markdown-alert-note"
  data-alert-type="NOTE"
>
  <p>Useful information.</p>
</blockquote>
```

Markdown 形态：

```markdown
> [!NOTE]
> Useful information.
```

这个方案的好处：

- 保留 blockquote 的编辑和选择行为。
- Agent 现有的 blockquote opaque block 模型可以小幅扩展，不必重建块模型。
- 普通 blockquote 与 Alert 可以互相切换。
- 项目内置扩展类型天然兼容，例如 `[!BEAT]`、`[!COMMENT]`；任意用户自定义类型不作为本期目标。
- 可以复用现有 GitHub theme 中已经写好的 `.markdown-alert` 样式。

## Alert 类型规则

官方类型：

```ts
const GITHUB_ALERT_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const
```

iWriter 项目内置扩展类型：

```ts
const IWRITER_ALERT_TYPES = ['BEAT', 'COMMENT'] as const
```

语义：

- `BEAT`：创作 Agent 和作者共同使用的节拍层标记，用于在正文文件中表达场景或段落的写作骨架。
- `COMMENT`：作者、审阅流或 Agent 留下的行内块级批注，用于表达暂不直接进入正文的意见、疑问、修改建议或上下文说明。

类型集合：

```ts
type AlertType =
  | typeof GITHUB_ALERT_TYPES[number]
  | typeof IWRITER_ALERT_TYPES[number]
```

校验规则：

```txt
^[A-Za-z][A-Za-z0-9_-]{0,31}$
```

规范化规则：

- 写入 Markdown marker 时统一大写：`[!beat]` 保存为 `[!BEAT]`，`[!comment]` 保存为 `[!COMMENT]`。
- CSS class 使用小写并做 slug 化：`markdown-alert-beat`。
- GitHub 官方类型和 iWriter 项目内置扩展类型可以出现在菜单、slash command 与块内工具中。
- 不提供 `Custom...` 入口，不创建任意自定义 Alert 类型。
- 不符合规则的 marker 不识别为 Alert，继续作为普通 blockquote 内容保留，避免破坏用户原文。

## Label 显示规则

Alert 的 label 不独立编辑。原因是 GFM Alert 的 Markdown 源码只表达类型 marker，例如 `[!NOTE]`，没有标准字段表达“类型是 NOTE，但显示 label 是 Foo”。

因此：

- label 由 `alertType` 派生。
- 内置类型使用本地化显示名，例如 `NOTE -> Note` / `提示`。
- iWriter 项目内置扩展类型使用本地化显示名，例如 `BEAT -> Beat` / `节拍`、`COMMENT -> Comment` / `批注`。
- 如果需要新增类型，应先注册为 iWriter 内置扩展类型，再进入菜单、工具和 i18n 映射。
- `alertLabel` 不作为持久化属性写入 `.md` 或 `.iwt`。如实现中需要，可作为运行时计算结果或 i18n 映射，不进入文档模型。

## Markdown 读入

需要新增共享工具，例如：

```txt
src/utils/markdownAlerts.ts
```

职责：

- `normalizeAlertType(type: string): string | null`
- `alertTypeToClass(type: string): string`
- `transformAlertBlockquotesInHtml(html: string): string`
- `configureAlertTurndown(turndown: TurndownService): void`
- `markdownAlertMarkerRegex`

读入流程：

```txt
Markdown
-> marked
-> unwrapBlockImages
-> transformAlertBlockquotesInHtml
-> TipTap parseHTML
```

`transformAlertBlockquotesInHtml` 识别规则：

- 只识别 blockquote 的第一个段落起始文本。
- 支持第一行独占 marker：

  ```markdown
  > [!NOTE]
  > 内容
  ```

- 支持 marker 与正文同一行，主要用于 iWriter 扩展类型的单行结构：

  ```markdown
  > [!BEAT] [场景-1-节拍-1] 核心点
  > [!COMMENT] 这一段需要补一个人物动机。
  ```

- 对独占 marker，移除 marker 所在文本。
- 对同一行 marker，移除 marker，保留 marker 后面的正文。
- 空 Alert 合法，作为空 blockquote 保留。

## Markdown 写出

`TurndownService` 增加 Alert rule：

- filter：`blockquote[data-alert-type]` 或 `.markdown-alert`。
- replacement：

  ```txt
  > [!TYPE]
  > line 1
  >
  > line 2
  ```

注意点：

- 不应把视觉标题 `NOTE` 作为真实正文写回。
- 多段落内容按 blockquote 规则逐行加 `>`。
- 空 Alert 输出：

  ```markdown
  > [!NOTE]
  >
  ```

- `formatConverter.ts` 和 `clipboard-operations.ts` 必须复用同一个 Alert Turndown 配置，避免保存和复制结果不一致。

## TipTap 扩展

自定义扩展应放在 `src/components/common/tiptap` 下，参考现有 `iwCodeBlockView.vue`、`iwMathBlockView.vue`、`iwTableView.vue` 的组织方式，而不是把全部逻辑塞进 `src/utils/editorExtensions.ts`。

推荐目录：

```txt
src/components/common/tiptap/iw-alert-blockquote/
  index.ts
  iwAlertBlockquote.ts
  iwAlertBlockquoteView.vue
  style.scss
  types.ts
```

然后从 `src/components/common/tiptap/index.ts` 导出，在 `src/utils/editorExtensions.ts` 中用 `iwAlertBlockquote` 替代直接使用 `Blockquote`。

扩展核心：

```ts
const iwAlertBlockquote = Blockquote.extend({
  name: 'blockquote',

  addAttributes() {
    return {
      alertType: {
        default: null,
        parseHTML: element => element.getAttribute('data-alert-type'),
        renderHTML: attrs => attrs.alertType ? { 'data-alert-type': attrs.alertType } : {},
      },
    }
  },
})
```

渲染规则：

- 普通 blockquote：保持当前 HTML。
- Alert blockquote：增加 `markdown-alert` 和 `markdown-alert-${slug}` class。
- Alert blockquote 使用 Vue NodeView 渲染块内工具，但 contentDOM 仍是可编辑正文区域。

命令：

- `setAlertType(type: string)`：将当前 blockquote 或选区转换为指定 Alert。
- `unsetAlertType()`：保留 blockquote，但去掉 Alert 类型。
- `toggleAlert(type: string)`：如果当前同类型 Alert，则转回普通 blockquote；否则转为该类型 Alert。
- `insertAlert(type: string)`：插入一个空 Alert 或把当前块转换为 Alert。

输入规则：

- 行首输入 `> [!NOTE] ` 后转换为 Alert。
- 行首输入 `> [!BEAT] ` 后转换为 Beat Alert。
- 行首输入 `> [!COMMENT] ` 后转换为 Comment Alert。
- 其他未注册的 `> [!TYPE] ` 不转换为 Alert，保留为普通引用内容。
- 普通 `>` 仍走 blockquote。

粘贴规则：

- HTML 粘贴：识别 `blockquote.markdown-alert-*` 或 `blockquote[data-alert-type]`。
- Markdown 文本粘贴：识别 `> [!TYPE]`。
- `paste-as-text` 维持纯文本语义，不主动解析 Alert。

## 编辑体验

编辑器应支持以下操作：

- 手工输入 GFM Alert marker。
- 从 GitHub 或其他 Markdown 编辑器复制粘贴 Alert。
- 普通引用块切换为 Alert。
- Alert 切换类型。
- Alert 转回普通引用块。

推荐交互以块内 NodeView tool 为主，菜单为辅。

### 块内工具

Alert 与 code block 的语言、Mermaid 的编辑/预览、公式块的 LaTeX 一样，属于块自身参数。因此类型修改应主要通过 Alert 块上的工具完成。

`iwAlertBlockquoteView.vue` 推荐提供：

- 类型下拉使用分隔项组织：`Quote Block`、`-`、`Note`、`Tip`、`Important`、`Warning`、`Caution`、`-`、`Beat`、`Comment`。
- 转普通引用按钮。
- 复制为 Markdown 按钮可选。
- 删除块按钮可选。

显示行为参考现有 NodeView：

- hover、选中或 focus 在 Alert 内时显示工具。
- 工具使用 `src/components/common/tiptap/style.scss` 的 `.toolbar-wrapper`、`.toolbar-controls`、`.control-selector`、`.control-button`。
- 工具本身 `contenteditable="false"`。

### Label 显示

- Alert 标题用 CSS 伪元素显示，不作为文档正文节点。
- Alert 标题内容来自 `alertType` 的显示名，不允许在正文中直接编辑。
- 鼠标悬停或选中 Alert 时显示轻量类型标识。
- 类型切换优先通过块内工具；菜单和 slash command 用作快捷入口。

## 嵌套规则

不支持嵌套 Alert，但支持 Alert 内嵌普通 quote。

规则：

- 顶层 blockquote 第一个段落以合法 `[!TYPE]` marker 开头时，识别为 Alert。
- Alert 内部允许普通 blockquote，用于引用原文或补充说明。
- Alert 内部出现 `[!TYPE]` marker 时，不再识别为子 Alert，只作为普通 quote 内容处理。
- 普通 blockquote 内部出现 `[!TYPE]` marker 时，不提升为 Alert。
- Alert inside Alert、Alert inside quote、quote inside quote 再提升 Alert 都不支持。

示例：

```markdown
> [!COMMENT]
> 这里需要确认角色动机。
>
> > 原文中的一句普通引用。
```

上述内容应解析为一个 `COMMENT` Alert，内部包含一个普通 quote。

## 样式与打印

当前 `src/components/print/markdownThemes.ts` 已有 GitHub / GitHub Dark 的 `.markdown-alert` 规则，应继续复用。

需要补齐：

- `src/components/pages/markdown-editor/style.scss` 增加通用 fallback：
  - `.markdown-alert`
  - `.markdown-alert::before`
  - `.markdown-alert-note`
  - `.markdown-alert-tip`
  - `.markdown-alert-important`
  - `.markdown-alert-warning`
  - `.markdown-alert-caution`
  - `.markdown-alert-beat`
  - `.markdown-alert-comment`
  - 未注册类型降级为普通 blockquote
- GitHub / GitHub Dark 主题继续使用现有颜色变量。
- Prose / Novel 主题可以先使用中性引用样式增强，不必完全 GitHub 化。
- 打印 CSS 支持 Alert 标题、颜色和 `break-inside: avoid`。
- 自定义主题可通过 `.markdown-alert-${type}` 覆盖已注册 Alert 类型样式。

项目扩展类型样式：

- border 使用 blockquote 默认边框色。
- 标题使用正文次级色。
- `[!BEAT]` 使用项目内置扩展样式。建议视觉上弱于 `IMPORTANT/WARNING`，但比普通引用更容易被识别，避免它看起来像正式正文。
- `[!COMMENT]` 使用项目内置扩展样式。建议接近批注/审阅气质，颜色保持克制，避免和错误或警告混淆。

## Agent 支持

Agent 必须看到并能编辑 Alert 类型，否则会误删或误改 marker。

### 文档视图

`src/ai/document/DocumentViewBuilder.ts` 的 `nodeToMarkdown(blockquote)` 需要输出 Alert marker。

普通引用：

```markdown
> quoted
```

Alert：

```markdown
> [!NOTE]
> quoted
```

项目内置扩展 Alert：

```markdown
> [!BEAT] [场景-1-节拍-1] 核心点

> [!COMMENT] 这一段需要补一个人物动机。
```

为了减少 Agent 改正文时误删类型，`get_blocks` 返回内容应保留 marker。

### 应用编辑

`src/ai/document/BlockEditApplier.ts` 的 Markdown 应用链路要复用 Alert 解析。

规则：

- Agent 提交 `new_content` 中包含 `> [!TYPE]` 时，以提交内容为准更新类型。
- Agent 编辑已有 Alert blockquote 但没有提交 marker 时，默认保留原 `alertType`。
- Agent 明确要转普通引用时，应提交普通 `>` blockquote，或由工具层提供明确行为。

### Prompt 与工具说明

编辑系统提示需要补充：

- Alert 是 blockquote 的语义扩展。
- 修改 Alert 内容时保留 `> [!TYPE]` marker，除非用户明确要求改类型或转普通引用。
- 项目内置扩展类型合法，例如 creative 写作中的 `[!BEAT]`，以及审阅批注中的 `[!COMMENT]`。
- 其他未注册类型不作为 Alert 编辑目标。
- 改 Alert 类型就是改 marker。

creative 相关 skill 已使用 `[!BEAT]` 作为正文中的 GFM Alert。编辑器支持后，不需要为 `[!BEAT]` 单独建特殊节点；它是 iWriter 项目内置扩展 Alert 类型。

`[!COMMENT]` 用于块级批注。Agent 可以创建、修改或删除 COMMENT，但必须尊重用户意图：除非用户明确要求把 COMMENT 融入正文，否则它不应被当作正文内容直接改写进普通段落。

## 菜单支持

在 `electron/MenuManager.ts` 中恢复并调整 Alert 菜单：

```txt
Paragraph
  -
  Quote Block
  Alert Block
    Note
    Tip
    Important
    Warning
    Caution
    -
    Beat
    Comment
```

行为：

- `Note` 发送 `set-alert-note`。
- `Tip` 发送 `set-alert-tip`。
- `Important` 发送 `set-alert-important`。
- `Warning` 发送 `set-alert-warning`。
- `Caution` 发送 `set-alert-caution`。
- `Beat` 发送 `set-alert-beat`。
- `Comment` 发送 `set-alert-comment`。
- 当前 block 为同类 Alert 时菜单 checked。
- 当前 block 为普通 blockquote 时只 checked `Quote Block`。

菜单只是入口，不是唯一修改方式。用户在 Alert 块内时，推荐通过块内工具修改类型。

`src/components/pages/markdown-editor/menu-action.ts` 负责将菜单 action 映射到 TipTap 命令。

Slash command 增加：

- `Alert: Note`
- `Alert: Tip`
- `Alert: Important`
- `Alert: Warning`
- `Alert: Caution`
- `Alert: Beat`
- `Alert: Comment`

## Copy & Paste

复制为 Markdown：

- Alert 必须输出 GFM marker。
- GitHub 官方类型和 iWriter 项目内置扩展类型必须输出 `[!TYPE]`。

复制为 HTML：

- 保留 `blockquote[data-alert-type]` 和 `.markdown-alert-*`。
- 不把 CSS 伪元素标题写成真实 DOM 内容。

普通复制：

- 浏览器原生 HTML 剪贴板可包含 class 和 data 属性。
- 纯文本 fallback 使用 Markdown marker。

粘贴：

- Markdown 粘贴优先保留 Alert 语义。
- HTML 粘贴能识别 GitHub 渲染出来的 `.markdown-alert`。
- 不可识别的 Alert-like 内容作为普通 blockquote 保留。

## 兼容性

`.md` / `.markdown`：

- 使用 GFM Alert marker 读写。
- 不引入非标准 HTML 持久化。

`.iwt`：

- 保存 HTML/JSON，因此可以保留 `data-alert-type`。
- 导出 Markdown 时仍应输出 GFM Alert marker。

未知 Markdown renderer：

- 扩展 `[!TYPE]` 在不支持 Alert 的 renderer 中仍表现为普通 blockquote 文本，降级可读。

## 测试建议

### 转换测试

- `> [!NOTE]\n> text` 读入后是 `blockquote(alertType='NOTE')`。
- 保存后仍是 `> [!NOTE]\n> text`。
- `> [!BEAT] [场景-1-节拍-1] text` 读入后保留 `BEAT`，正文保留坐标和 text。
- `> [!COMMENT] text` 读入后保留 `COMMENT`，正文保留 text。
- 普通 `> quote` 不变成 Alert。
- 非法 marker `> [!123]` 保持普通 blockquote。
- 未注册 marker `> [!IDEA]` 保持普通 blockquote。

### 编辑器测试

- 输入 `> [!WARNING] ` 转换为 Warning Alert。
- Alert 类型切换不丢正文。
- 通过块内类型下拉把 `NOTE` 改成 `COMMENT` 后，Markdown 输出 `[!COMMENT]`。
- 通过菜单把普通 quote 转成 `BEAT` 后，正文不丢失。
- Alert 转普通引用不丢正文。
- Alert 的 label 不能独立编辑，显示名由类型派生。
- Alert 内普通 quote 保留为普通 quote，不被提升为子 Alert。
- Alert 内 `[!NOTE]` marker 不创建嵌套 Alert。

### 复制粘贴测试

- `copy-as-markdown` 输出 marker。
- `copy-as-html` 保留 data 属性。
- 粘贴 GitHub Alert HTML 能恢复类型。
- `paste-as-text` 不转换。

### Agent 测试

- `get_blocks` 返回 Alert marker。
- `edit_block` 修改 Alert 正文时保留类型。
- `edit_block` 将 `NOTE` 改为 `WARNING` 后类型变化。
- creative `[!BEAT]` block 经 Agent 读取、编辑、保存后 marker 不丢失。
- `[!COMMENT]` block 经 Agent 读取、编辑、保存后 marker 不丢失，且不会被误当作普通正文。

### 打印测试

- GitHub / GitHub Dark 主题下五类 Alert 显示和打印颜色正确。
- Prose / Novel 主题下 Alert 至少有可区分的 fallback。
- Alert 不被分页拆得难以阅读。

## 实施顺序

1. 新增共享 Alert 工具与转换测试。
2. 在 `src/components/common/tiptap/iw-alert-blockquote/` 新增自定义扩展、NodeView、样式和类型定义。
3. 接入 Markdown 读写和 `copy-as-markdown`。
4. 补齐编辑器 screen 样式与打印样式。
5. 接入 Agent `DocumentViewBuilder` 和 `BlockEditApplier`。
6. 恢复并完善菜单、slash command 和 i18n。
7. 增加覆盖官方五类、项目内置扩展 `[!BEAT]` / `[!COMMENT]`、以及未注册类型降级行为的回归测试。

## 非目标

- 不实现嵌套 Alert。GitHub 官方也不建议嵌套。
- 不禁止 Alert 内部的普通 quote。
- 不为每个用户自定义类型设计独立 UI 配置系统。
- 不支持独立编辑 Alert label；label 由类型派生。
- 不把 Alert 存成专有 Markdown 语法。
- 不改变普通 blockquote 的默认行为。
