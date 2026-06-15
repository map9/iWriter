# Markdown 主题系统

> 适用版本：iWriter `0.1.18`
>
> 最后更新：2026-06-15

iWriter 的主题系统让你可以独立控制 Markdown 文档在**屏幕编辑**和**打印/PDF 输出**时的视觉样式。系统内置四套主题，同时支持用户通过 CSS 文件创建自定义主题，App 会自动发现并热更新。

## 核心概念

### 屏幕主题 vs 打印主题

| | 屏幕主题 | 打印主题 |
| --- | --- | --- |
| **作用范围** | 编辑器内的 Markdown 文档显示 | 打印预览和 PDF 导出的样式与页面设置 |
| **CSS 作用方式** | 通过 `.tiptap.markdown-theme-{id}` 选择器限定在编辑器内 | 直接作用于打印文档的 `<body>`，无作用域限制 |
| **可独立选择** | 是 | 是，可以选择"跟随屏幕主题"或独立选择 |
| **包含内容** | 仅 CSS 样式 | CSS 样式 + 页面默认值（纸张大小、边距、分页策略、页眉页脚） |

你可以为屏幕编辑选择舒适的深色主题（如 `github-dark`），同时为打印输出选择适合纸张的浅色主题（如 `prose`）。

### 主题 ID 与 CSS 类名

每个主题有一个唯一 ID（如 `github`）。屏幕 CSS 通过 `.tiptap.markdown-theme-{id}` 选择器限定作用范围，确保不同主题的样式不会互相污染。打印 CSS 直接作用于打印文档，无需作用域限定。

## 内置主题

### GitHub（`github`）

技术文档风格，参考 GitHub Markdown Light 设计令牌。

- **字体**：系统无衬线字体（`-apple-system, BlinkMacSystemFont, "Segoe UI"`）
- **标题**：H1/H2 带底部边框线，层次分明
- **代码**：深色背景代码块（`#0d1117`），红色行内代码（`#cf222e`）
- **表格**：斑马条纹行，浅灰表头背景
- **链接**：GitHub 蓝色（`#0969da`）
- **适用场景**：技术文档、README、API 文档、项目说明

### GitHub Dark（`github-dark`）

深色版 GitHub 风格，忠实还原 GitHub 暗色模式设计令牌。

- **背景**：深色底（`#0d1117`），浅色文字（`#e6edf3`）
- **代码**：深色代码块（`#161b22`），橙色行内代码（`#ff7b72`）
- **链接**：浅蓝色（`#58a6ff`）
- **边框**：暗色分割线（`#30363d`）
- **适用场景**：夜间写作、深色环境下的技术文档编辑
- **注意**：打印时默认启用背景色（`background: true`），否则深色底在白色纸张上可能不可读

### Prose（`prose`）

通用文章风格，衬线正文字体，舒适阅读体验。

- **正文字体**：Georgia, Times New Roman 等衬线字体
- **标题字体**：Avenir Next, Helvetica Neue 等无衬线字体
- **行高**：屏幕 1.75，打印 1.72，宽松舒适
- **引用块**：斜体 + 灰色文字，左侧蓝色边框
- **代码块**：浅灰背景，柔和配色
- **适用场景**：博客文章、随笔、新闻稿、通用写作

### Novel（`novel`）

长文与书稿风格，适合小说创作和正式出版输出。

- **正文字体**：Georgia, "Times New Roman" 衬线字体
- **标题字体**：Palatino, "Book Antiqua" 经典衬线
- **排版**：正文两端对齐（`text-align: justify`），首行缩进，段间距紧凑
- **页边距**：较宽松的上下边距，模拟书籍排版
- **打印默认值**：A5 纸张，对页边距模式
- **适用场景**：小说创作、长篇作品、书稿排版、正式出版物

## 自定义主题

iWriter 支持加载用户在 App 外部编写的 CSS 主题文件，通过文件系统实时监听，保存后无需重启即可生效。

### 主题目录

所有自定义主题存放在 `~/.iwriter/markdown/themes/` 目录下。

每个自定义主题是该目录下的一个独立文件夹：

```
~/.iwriter/markdown/themes/
  my-serif-theme/        ← 文件夹名即主题 ID
    theme.json           ← 主题元数据与打印默认值（可选，推荐）
    screen.css           ← 编辑器屏幕样式（必须）
    print.css            ← 打印/PDF 样式（可选）
  academic-paper/        ← 另一个主题
    theme.json
    screen.css
    print.css
```

- **文件夹名即主题 ID**：例如 `my-serif-theme` 文件夹对应的主题 ID 为 `my-serif-theme`，CSS 类名为 `.tiptap.markdown-theme-my-serif-theme`
- **不能与内置主题重名**：`github`、`github-dark`、`prose`、`novel` 为保留 ID
- **以 `_` 或 `.` 开头的文件夹会被忽略**

### theme.json 格式

`theme.json` 定义主题元数据和打印默认值。该文件是可选的，但推荐创建——如果不提供，主题名默认为文件夹名。

```json
{
  "name": "My First Theme",
  "description": "A custom theme for iWriter",
  "version": "1.0.0",
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

`print` 字段中的所有属性都是可选的，未指定的属性会使用系统默认值。

### screen.css 编写指南

`screen.css` 是**必须**提供的文件，用于定义编辑器中的文档显示样式。所有规则必须放在 `.tiptap.markdown-theme-{id}` 选择器内。

iWriter 提供了丰富的 CSS 变量（自定义属性），建议优先使用变量来控制样式，只在需要精细调整时编写具体规则。

#### 可用 CSS 变量

**排版变量：**

| 变量 | 说明 | 示例值 |
| --- | --- | --- |
| `--md-font-family` | 正文字体 | `Georgia, "Times New Roman", serif` |
| `--md-heading-font-family` | 标题字体 | `"Helvetica Neue", Arial, sans-serif` |
| `--md-line-height` | 正文行高 | `1.7` |

**颜色变量：**

| 变量 | 说明 | 示例值 |
| --- | --- | --- |
| `--md-body-color` | 正文颜色 | `#2d2d2d` |
| `--md-heading-color` | 标题颜色 | `#1a1a1a` |

**标题字号：**

| 变量 | 说明 | 示例值 |
| --- | --- | --- |
| `--md-h1-size` | H1 字号 | `2rem` |
| `--md-h2-size` | H2 字号 | `1.6rem` |
| `--md-h3-size` | H3 字号 | `1.3rem` |
| `--md-h4-size` | H4 字号 | `1.1rem` |
| `--md-h5-size` | H5 字号 | `1rem` |

**段落与列表：**

| 变量 | 说明 |
| --- | --- |
| `--md-p-margin` | 段落外边距 |
| `--md-list-margin` | 列表外边距 |
| `--md-list-padding-x` | 列表水平内边距 |
| `--md-bullet-margin` | 列表标记外边距 |
| `--md-bullet-padding-left` | 列表标记左侧内边距 |

**元素样式：**

| 变量 | 说明 |
| --- | --- |
| `--md-hr-color` | 水平分割线颜色 |
| `--md-mark-bg` | 高亮文本背景色 |
| `--md-link-color` | 链接颜色 |
| `--md-link-hover-color` | 链接悬停颜色 |
| `--md-blockquote-border` | 引用块左边框颜色 |
| `--md-blockquote-color` | 引用块文字颜色 |
| `--md-blockquote-font-style` | 引用块字体样式 |
| `--md-table-border-color` | 表格边框颜色 |
| `--md-table-header-bg` | 表格表头背景色 |
| `--md-inline-code-bg` | 行内代码背景色 |
| `--md-inline-code-color` | 行内代码文字颜色 |
| `--md-code-block-bg` | 代码块背景色 |
| `--md-code-block-color` | 代码块文字颜色 |
| `--md-image-radius` | 图片圆角半径 |
| `--md-math-block-bg` | 公式块背景色 |

#### screen.css 示例

```css
.tiptap.markdown-theme-my-serif-theme {
  /* 排版 */
  --md-font-family: Georgia, "Times New Roman", serif;
  --md-heading-font-family: "Helvetica Neue", Arial, sans-serif;
  --md-line-height: 1.7;

  /* 颜色 */
  --md-body-color: #2d2d2d;
  --md-heading-color: #1a1a1a;

  /* 标题 */
  --md-h1-size: 2rem;
  --md-h2-size: 1.6rem;
  --md-h3-size: 1.3rem;

  /* 链接 */
  --md-link-color: #1a56db;
  --md-link-hover-color: #1239a4;

  /* 引用块 */
  --md-blockquote-border: #9ca3af;
  --md-blockquote-color: #6b7280;
  --md-blockquote-font-style: italic;

  /* 表格 */
  --md-table-border-color: #d1d5db;
  --md-table-header-bg: #f9fafb;

  /* 代码 */
  --md-inline-code-bg: #f3f4f6;
  --md-inline-code-color: #be185d;
  --md-code-block-bg: #1e1e2e;
  --md-code-block-color: #cdd6f4;
}

/* 在变量基础上可以追加更精细的元素规则 */
.tiptap.markdown-theme-my-serif-theme h1 {
  font-weight: 800;
  letter-spacing: -0.02em;
}
```

### print.css 编写指南

`print.css` 是**可选**文件，定义打印/PDF 输出时的样式。与 `screen.css` 不同，`print.css` 中的规则直接作用于文档 `<body>`，**无需作用域选择器**。

#### print.css 示例

```css
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 12pt;
  line-height: 1.7;
  color: #2d2d2d;
}

h1, h2, h3, h4, h5, h6 {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.25;
  margin-top: 1.6em;
  margin-bottom: 0.5em;
}
h1 { font-size: 22pt; margin-top: 0; }
h2 { font-size: 17pt; }
h3 { font-size: 13.5pt; }

p { margin: 0 0 0.9em; }

ul, ol { margin: 0 0 0.9em; padding-left: 1.8em; }
li { margin: 0.2em 0; }

blockquote {
  border-left: 3px solid #9ca3af;
  padding-left: 1em;
  color: #6b7280;
  margin: 1.25em 0;
  font-style: italic;
}

table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 11pt; }
th, td { border: 1px solid #d1d5db; padding: 6px 12px; text-align: left; }
th { background: #f9fafb; font-weight: 600; }

code {
  font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
  font-size: 0.875em;
  background: #f3f4f6;
  color: #be185d;
  padding: 0.1em 0.25em;
  border-radius: 3px;
}
pre {
  font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
  font-size: 9.5pt;
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 1em;
  border-radius: 6px;
  white-space: pre-wrap;
  margin: 1em 0;
}
pre code { background: none; color: inherit; padding: 0; border-radius: 0; }

img { max-width: 100%; height: auto; display: block; margin: 1.25em auto; }
hr { border: none; border-top: 1px solid #d1d5db; margin: 2em 0; }
a { color: #1a56db; text-decoration: underline; }
```

### Create Example 与 Open Folder

在偏好设置的"显示"分组中，有两个便捷操作：

- **Create Example**：在主题目录中生成一个名为 `my-first-theme` 的示例主题，包含完整的 `theme.json`、`screen.css` 和 `print.css`，所有 CSS 属性都有详细注释，帮助快速上手
- **Open Folder**：在系统文件管理器（Finder / Explorer）中直接打开主题目录

### 主题热更新

App 使用 chokidar 实时监听主题目录的文件变更（包括新增、修改、删除）。保存 CSS 文件后 500ms 内（防抖延迟），主题样式会自动重新加载并应用到编辑器，无需重启 App。

主题列表中的加载状态标识：
- **绿色勾**：主题加载成功，可正常使用
- **橙色警告图标**：加载有问题（如缺少 `screen.css`），错误信息会逐条显示在主题名下方

### 与内置主题的同名冲突

如果自定义主题的文件夹名与内置主题 ID 相同（`github`、`github-dark`、`prose`、`novel`），该自定义主题会被跳过，并在加载状态中显示冲突提示。要解决冲突，只需重命名文件夹。
