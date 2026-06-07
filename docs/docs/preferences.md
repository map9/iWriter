# 偏好设置

> 适用版本：iWriter `0.1.17`
>
> 最后更新：2026-06-07

`偏好设置` 用于管理 iWriter 的编辑体验、拼写与语法检查、主题、导入导出、AI 提供方以及应用更新行为。当前界面分为 `通用`、`编辑器`、`拼写与语法`、`显示`、`打印与PDF输出`、`导出`、`AI`、`更新` 八个分组。

## 适合什么时候来这里

- 想切换界面语言、换行符或自动保存行为
- 想调整拼写与语法检查引擎
- 想切换应用主题或跟随系统外观
- 想选择 Markdown 屏幕预览或打印主题，或管理自定义主题
- 想配置导出目录、Pandoc 路径与不同格式的输出参数
- 想配置 AI Provider、模型与自定义接口
- 想控制自动更新、更新通道与检查频率

## 编辑器

编辑器分组主要负责基础输入与显示体验。

- 自动保存：内容变化后自动保存文档
- 换行符：支持 `Unix LF` 与 `Windows CRLF`
- 显示：支持 `首行缩进` 与 `显示不可见字符`
- 文本替换：支持 `智能标点`，可将直引号自动转换为弯引号

![编辑器偏好项](/images/docs/preferences/preferences-editor.png)

## 拼写与语法

这一分组用于控制文档内的实时校对行为。

- 输入时检查拼写与语法：在输入过程中实时检查
- 显示拼写与语法错误：在文档中高亮已检测到的问题
- 校对引擎：支持 `LanguageTool` 与 `Typo.js`
- `LanguageTool`：在线语法与风格检查，默认引擎
- `Typo.js`：离线拼写检查，目前仅支持英文
- `LanguageTool` 选项：可配置语言、API 地址和可选的 Premium `API Key`

切换校对引擎后，需要重新打开文档才会生效。

![拼写与语法偏好项](/images/docs/preferences/preferences-proofread.png)

## 显示

显示分组分为三大部分：**界面语言**、**Markdown 内容主题**与**应用主题**。

### 界面语言

支持 `en-US` 和 `zh-CN`。

### Markdown 屏幕主题

控制 Markdown 文档在编辑器中的视觉样式。

内置主题：

| 主题 | 适用场景 |
| --- | --- |
| `github` | 技术文档，参考 GitHub Markdown Light 风格 |
| `github-dark` | 深色环境下的技术文档 |
| `prose` | 通用文章，衬线正文字体，舒适阅读 |
| `novel` | 长文与书稿，宽松排版，两端对齐 |

切换屏幕主题后，编辑器中的文档样式立即更新，不影响文档内容。

### Markdown 打印主题

控制 Markdown 文档在打印和 PDF 导出时使用的样式与页面设置。可以独立于屏幕主题选择不同的打印主题，也可以选择”跟随屏幕主题”——当屏幕主题切换时，打印主题自动跟随。

每个内置主题都有对应的打印默认值（页面大小、边距、分页策略、页眉页脚），用户在打印对话框中也可以临时覆盖这些默认值。打印对话框中的修改只作用于当次输出，不会回写到偏好设置。

### 自定义 Markdown 主题

iWriter 支持加载用户在 App 外部编写的 CSS 主题文件。每个自定义主题可以分别提供屏幕样式（`screen.css`）和打印样式（`print.css`），以及一个 `theme.json` 元数据文件。

详细的编写指南（包括完整的 CSS 变量参考、`theme.json` 格式说明、示例代码）见 **[Markdown 主题系统](/docs/markdown-themes)**。

**主题目录**：`~/.iwriter/markdown/themes/`

每个自定义主题是该目录下的一个文件夹：

```
~/.iwriter/markdown/themes/
  my-serif-theme/        ← 文件夹名即主题 ID
    theme.json           ← 主题元数据与打印默认值（推荐）
    screen.css           ← 编辑器屏幕样式（必须）
    print.css            ← 打印/PDF 样式（可选）
```

偏好设置中的操作：

- **Create Example**：在主题目录中生成带完整注释的示例主题（`my-first-theme`），包含 `theme.json`、`screen.css` 和 `print.css`，帮助快速上手
- **Open Folder**：直接在系统文件管理器（Finder / Explorer）中打开主题目录

状态指示：
- **绿色勾（✓）**：主题加载成功，可正常使用
- **橙色警告图标（⚠）**：加载有错误，错误详情显示在主题名下方。常见错误包括：缺少 `screen.css`、`theme.json` 解析失败、与内置主题 ID 冲突

App 使用 chokidar 实时监听主题目录的文件变更（新增、修改、删除），保存 CSS 文件后约 500ms 内自动重新加载，无需重启 App。

### 应用主题

控制应用界面整体外观（标题栏、侧边栏、工具栏等），与 Markdown 内容无关。

- 支持 `Follow System`、`Light`、`Dark`
- 还提供多套内置主题，例如 `Cupcake`、`Sunset`、`Caramel Latte`
- 当前启用主题会高亮显示，并标记为”当前”

![主题偏好项](/images/docs/preferences/preferences-theme.png)

## 打印与 PDF 输出

该分组用于管理打印和 PDF 导出的默认行为与偏好值。这些设置会作为打印对话框的初始值，用户在打印对话框中可以临时覆盖。

详细的打印功能说明、分页策略和页眉页脚配置见 **[打印、PDF 与导出](/docs/print-export)**。

该分组包含四个子分组：

### 主题选择

- **打印主题跟随屏幕主题**：开启后，打印主题自动与屏幕主题保持同步
- **打印主题**：当不跟随屏幕主题时，独立选择打印主题。会列出所有内置和自定义主题

### 页面设置

- **纸张大小**：A3 / A4 / A5 / A6 / A7 / A10 / B4 / B5 / Letter / Legal / Ledger（共 11 种）
- **方向**：纵向（Portrait）/ 横向（Landscape）
- **起始页**：自动 / 右页（Recto）/ 左页（Verso）。控制首页的左右侧语义
- **边距模式**：普通边距（上右下左）/ 对页边距（上下内/外侧）。对页模式为装订留出额外内侧空间
- **边距值**：支持 CSS 长度单位（`mm`、`cm`、`in`、`pt` 等），默认 `20mm`
- **打印背景**：是否在打印输出中包含 CSS 背景色和背景图

### 分页策略

- **分页模式**：Balanced（平衡）/ Compact（紧凑）/ Strict Book（严格书籍）/ Custom（自定义）
  - 选择预设模式后，子选项自动更新为预设值
  - 手动修改任一子选项后，模式自动切换为”自定义”
- **与下一个元素保持**（keepWithNext）：标题 / 图片题注 / 表格题注
- **避免内部断页**（avoidBreakInside）：段落 / 引用块 / 代码块 / 表格 / 表格行 / 图片 / 列表项
- **Widows / Orphans**：段落首末行保留数，留空使用自动值
- **章节起始侧**：自动 / 右页 / 左页
- **空白页行为**：允许空白页 / 抑制空白页页眉页脚

### 页眉页脚

- **启用页眉页脚**：总开关，关闭后所有配置保留但不生效
- **首页不同**：首页使用独立的页眉页脚配置
- **奇偶页不同**：左页和右页使用独立的页眉页脚配置
- **页眉页脚位置（Margin Box）**：支持 16 个标准位置，可自由添加/删除/重命名
  - 页面上方：`top-left-corner`、`top-left`、`top-center`、`top-right`、`top-right-corner`
  - 页面下方：`bottom-left-corner`、`bottom-left`、`bottom-center`、`bottom-right`、`bottom-right-corner`
  - 左侧栏：`left-top`、`left-middle`、`left-bottom`
  - 右侧栏：`right-top`、`right-middle`、`right-bottom`
- **模板变量**：`${documentTitle}` / `${chapterTitle}` / `${sectionTitle}` / `${printDate}` / `${pageNo}` / `${totalPages}`
- **快捷预设**：每个 margin box 的 `⋯` 菜单提供常用模板预设，一键填充
- **级联规则**：首页 slots > 奇偶页 slots > 通用 slots
- **运行标题**：章节来源（H1/H2/H3/None）和小节来源（H2/H3/H4/None），用于 `${chapterTitle}` 和 `${sectionTitle}` 变量

## 导出

导出分组用于管理 `File -> Export` 的默认行为。详细的导出流程和各格式说明见 **[打印、PDF 与导出](/docs/print-export#导出)**。

该分组左侧为格式列表，右侧为当前选中格式的设置。分为"通用设置"和"格式级设置"两个区域。

### 通用设置

| 设置项 | 选项 | 说明 |
| --- | --- | --- |
| **默认导出目录** | 每次询问 / 源文件同目录 / 自定义目录 | 导出时文件保存对话框的默认位置。选择"自定义目录"后可浏览选择或手动输入路径 |
| **Pandoc 路径** | 自动检测 / 手动指定 | 留空使用自动检测（在 PATH 中搜索 `pandoc`）；手动输入 Pandoc 可执行文件的路径或所在目录 |
| **导出后在文件夹中显示** | 开 / 关 | 导出完成后在 Finder / Explorer 中定位到输出文件 |
| **导出后自动打开** | 开 / 关 | 导出完成后使用系统默认应用打开输出文件 |

### 格式级设置

每种导出格式都有独立的设置页，包含：

| 设置项 | 说明 | 适用格式 |
| --- | --- | --- |
| **参数预览**（只读） | 展示当前配置下实际执行的 Pandoc 命令参数，方便验证配置 | 所有格式 |
| **自定义参数** | 手动追加 Pandoc CLI 参数（如 `--number-sections --toc`），使用空格分隔 | 所有格式 |
| **参考文档** | 选择一个 `.docx` 文件作为样式模板，Pandoc 会继承该文件的字体、字号、颜色等样式 | DOCX |
| **模板文件** | 选择一个 `.odt` 文件作为样式模板 | ODT |
| **CSS 文件** | 选择一个 `.css` 文件嵌入到输出中 | HTML, EPUB |
| **目录深度** | 控制 EPUB 电子书目录的标题层级（1–6），默认 3 | EPUB |

自定义参数示例：
- `--number-sections`：为所有标题自动编号
- `--toc`：生成目录
- `--shift-heading-level-by=1`：将所有标题级别提升一级
- `--metadata author="Your Name"`：设置元数据

### Pandoc 安装检查

如果导入或导出按钮不可用，优先检查 Pandoc 是否已正确安装并在这里完成路径配置。安装方式：
- **macOS**：`brew install pandoc`
- **Windows**：[pandoc.org/installing.html](https://pandoc.org/installing.html)
- **Linux**：使用系统包管理器，如 `apt install pandoc`

## AI

AI 分组用于管理内置和自定义 Provider。

- 内置 Provider 预设包括：`Anthropic`、`DeepSeek`、`Gemini`、`GLM（智谱）`、`Ollama`、`OpenAI`
- 未完成配置的 Provider 会显示“需要配置”
- 已启用的 Provider 会显示当前模型
- 支持添加自定义提供方
- 自定义接口类型支持 `OpenAI`、`Anthropic`、`Gemini`
- Provider 配置通常包括 API Key、Base URL、模型列表，以及更细的模型能力配置
- `Ollama` 的模型列表会自动从本地服务读取，更适合本地模型工作流
- `DeepSeek`、`GLM` 等预设更适合直接套用官方接口或兼容网关

![AI 偏好项：Provider 列表](/images/docs/preferences/preferences-ai-providers.png)

![AI 偏好项：Provider 配置](/images/docs/preferences/preferences-ai-provider-config.png)

## 更新

更新分组用于控制应用自动更新策略。

- 启用自动更新：允许后台下载并自动安装更新
- 启动时检查更新：应用启动后自动检查新版本
- 自动下载更新：在后台下载更新包
- 自动安装更新：下载完成后自动安装
- 更新通道：支持 `稳定版` 与 `测试版`
- 检查间隔：可按小时设置自动检查频率
- 操作：支持手动执行“立即检查更新”

当前实现说明：

- 自动更新只在生产环境启用，开发环境不会走真实更新流程
- 发布源依赖 GitHub Releases（`map9/iWriter`）
- `Skip This Version` 会记录具体版本号，而不是永久关闭更新

![更新偏好项](/images/docs/preferences/preferences-updater.png)

## 使用建议

- 个人写作场景下，建议开启自动保存，并按目标平台统一换行符
- 如果主要写英文内容，可按需选择 `Typo.js` 作为离线拼写检查
- 团队协作时，建议统一语言、换行符、拼写检查引擎和 AI Provider 约定
- 若使用第三方语法服务或模型接口，建议提前确认网络、API Key 与 Base URL 是否可用
