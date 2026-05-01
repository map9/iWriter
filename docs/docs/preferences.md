# 偏好设置

> 适用版本：iWriter `0.1.8`
>
> 最后更新：2026-05-01

`偏好设置` 用于管理 iWriter 的编辑体验、拼写与语法检查、主题、导入导出、AI 提供方以及应用更新行为。当前界面分为 `编辑器`、`拼写与语法`、`主题`、`导出`、`AI`、`更新` 六个分组。

## 适合什么时候来这里

- 想切换界面语言、换行符或自动保存行为
- 想调整拼写与语法检查引擎
- 想切换主题或跟随系统外观
- 想配置导出目录、Pandoc 路径与不同格式的输出参数
- 想配置 AI Provider、模型与自定义接口
- 想控制自动更新、更新通道与检查频率

## 编辑器

编辑器分组主要负责基础输入与显示体验。

- 界面语言：支持 `en-US` 和 `zh-CN`
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

## 主题

主题分组负责控制应用整体外观。

- 支持 `Follow System`、`Light`、`Dark`
- 还提供多套内置主题，例如 `Cupcake`、`Sunset`、`Caramel Latte`
- 当前启用主题会高亮显示，并标记为“当前”

这部分只负责应用主题切换，不改变文档内容本身。

![主题偏好项](/images/docs/preferences/preferences-theme.png)

## 导出

导出分组用于管理 `File -> Export` 的默认行为。

- 默认导出目录：可选择每次询问、导出到源文件同目录，或固定导出到自定义目录
- Pandoc 路径：可使用自动检测结果，也可以手动指定本机 Pandoc 路径
- 导出后动作：可选导出完成后自动打开文件，或在资源管理器 / Finder 中显示结果
- 格式级参数：可分别配置 HTML、DOCX、ODT、RTF、EPUB、LaTeX、MediaWiki、reStructuredText、Textile、OPML 的附加参数
- 部分格式支持额外资源，例如 DOCX 参考文档、ODT 模板、HTML / EPUB 的 CSS 文件、EPUB 目录深度

如果导入或导出按钮不可用，优先检查 Pandoc 是否已正确安装并在这里完成路径配置。

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
