# 功能总览

> 适用版本：iWriter `0.1.24`
>
> 最后更新：2026-07-01

## 与阶段定位的关系

- 第一阶段能力：本地工作区管理 + Markdown/富文本编辑主流程。
- 第二阶段能力：在第一阶段之上加入 AI 对话与 Edit 提案审批流（当前已基本完成）。
- 第三阶段方向：
  - `3.1` 个人知识库管理（未启动）
  - `3.2` 小说创作与写作（正在开始）

## 文件与工作区

- 打开文件夹并构建树形工作区
- 文件/文件夹：新建、重命名、移动、删除
- 外部文件变更监听与同步
- 多标签页与重启后状态恢复
- 支持 `.iwtignore` 工作区忽略规则，并可按功能将工作区根目录的 `.gitignore` 纳入过滤
- 默认过滤 `.git/`、`.iwriter/` 与系统元数据，依赖目录、构建产物和缓存目录可按工作区需要自行加入忽略规则
- 支持自动保存、另存为、全部保存与只读模式
- 支持在工作区内执行跨文件搜索与替换
- 支持通过 include / exclude 模式过滤跨文件搜索范围
- Windows / Linux 支持应用内标题栏窗口按钮和应用菜单，macOS 保留系统菜单栏与交通灯窗口按钮

## Markdown 编辑器能力

- 常用格式：标题、粗斜体、下划线、删除线、高亮、链接、行内代码
- 结构内容：引用、任务列表、有序/无序列表
- 进阶内容：表格、数学公式、代码块、mermaid 图、分隔线
- 辅助能力：文内搜索替换、拼写与语法检查、TOC 联动
- 支持 Markdown 语法的文件编辑，存储，支持格式：自定义格式`.iwt`、`txt`、`md`/`markdown`
- 支持通过 `/` 打开斜杠菜单，快速插入标题、列表、引用、代码块、数学公式、mermaid 图、表格和图片
- 支持 in Editor 内的工具，如：图片工具、表格工具、代码块工具、公式块工具
- 支持代码块语言列表在常用语言与全部支持语言之间切换
- 支持图片尺寸拖拽调整、图片地址编辑、复制、外部打开，以及左 / 中 / 右 / 两端对齐
- 支持图片粘贴、富文本粘贴与“粘贴为纯文本”场景
- 支持 mermaid 图在编辑器、打印预览和 PDF 导出中渲染
- 支持页面级右键菜单，Markdown、图片、PDF 页面和文件标签会显示对应文档类型的常用操作
- 支持 `Clean Mode`、`Focus Mode`、`Typewriter Mode`
- 支持 Markdown 屏幕主题与打印主题，内置 `github`、`github-dark`、`prose`、`novel` 四套主题
- 屏幕主题与打印主题可独立选择，打印主题可选择"跟随屏幕主题"
- 每套内置主题包含屏幕 CSS、打印 CSS，以及页面设置 / 分页策略 / 页眉页脚的默认值
- 支持自定义主题：将 CSS 文件放入 `~/.iwriter/markdown/themes/` 目录，App 自动发现并热更新
- 自定义主题需提供 `screen.css`（必须）和可选的 `theme.json`（元数据与打印默认值）、`print.css`
- 支持 30+ CSS 变量控制排版、颜色、标题、列表、引用、表格、代码块等元素样式
- 支持 Create Example 一键生成示例主题，帮助快速上手
- 支持打印与 PDF 导出，基于 paged.js 分页渲染
- 打印对话框提供实时预览，支持缩放查看分页效果
- 支持 11 种纸张大小、纵向/横向、普通边距/对页边距模式
- 支持三种分页策略预设（Balanced / Compact / Strict Book）+ 自定义模式
- 支持 16 个页眉页脚位置（margin box），6 个模板变量（documentTitle / chapterTitle / sectionTitle / printDate / pageNo / totalPages）
- 支持首页不同、奇偶页不同的页眉页脚，运行标题自动提取章节信息
- 支持 N-up 打印（每张纸 1/2/4/6/9 页）
- 支持真实打印机输出与 Save as PDF 两种模式
- 支持导入常见文档格式（Word、ODT、RTF、EPUB、HTML、LaTeX 等），基于 Pandoc 转换
- 支持导出为 HTML、Word、ODT、RTF、EPUB、LaTeX、MediaWiki、reStructuredText、Textile、OPML 等 10 种格式
- 每种导出格式可独立配置自定义参数、参考文档、CSS 样式等

## 图片 / PDF / Office 查看

- 图片：缩放、旋转、拖拽平移、适配窗口
- PDF：连续/单页/双页模式、缩放、跳页、懒加载
- Office：支持打开 `.doc`、`.docx`、`.xls`、`.xlsx`、`.ppt`、`.pptx`，通过 LibreOffice 转换为 PDF 后在 iWriter 内预览
- `.docx` 可从 Office 预览页或标签页右键菜单导入为 Markdown 草稿

## AI 模式

- `Edit`：面向文档编辑，支持提案审批流
- `Creative`：面向创作素材生成与保存
- 支持会话历史持久化
- 支持将文本文件、目录、图片、PDF 作为上下文附件
- 支持上下文 token 统计、自动摘要阈值进度和长会话自动压缩
- 支持显示本次会话真实 token 用量，包含主 Agent、子 Agent 和缓存命中统计

## 更新机制

- 生产环境支持自动更新
- 支持手动检查、跳过版本、查看发布说明
- 支持 `stable` / `beta` 更新通道与自动检查间隔

## 偏好设置

- 显示模式：
  - 语言（`zh-CN` / `en-US`）
  - Markdown 屏幕主题选择
  - Markdown 自定义主题（Create Example、Open Folder）
  - 应用主题选择
- 拼写与语法检查引擎切换（`LanguageTool` / `Typo.js`）
- 导出设置（默认目录、Pandoc 路径、LibreOffice 路径、格式级参数）
- AI Provider、API Key、模型、Base URL、备用模型与模型能力配置
- Web Search Provider、API Key 与 Base URL
- 更新策略控制（自动下载、自动安装、检查频率）
