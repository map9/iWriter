# 开源许可

> 适用版本：iWriter `0.2.0`
>
> 最后更新：2026-07-28

iWriter 基于多个优秀的开源项目构建。以下列出对用户体验有直接影响的核心依赖及其许可证信息，感谢社区的贡献。

## 运行时核心依赖

| 依赖 | 许可证 | 用途 |
|------|--------|------|
| [Electron](https://www.electronjs.org/) | MIT | 跨平台桌面应用框架 |
| [Vue 3](https://vuejs.org/) | MIT | 用户界面框架 |
| [Tiptap](https://tiptap.dev/) | MIT | 富文本 / Markdown 编辑器核心 |
| [ProseMirror](https://prosemirror.net/) | MIT | Tiptap 底层编辑器引擎 |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Apache-2.0 | PDF 渲染与查看 |
| [KaTeX](https://katex.org/) | MIT | 数学公式渲染 |
| [lowlight](https://github.com/wooorm/lowlight) | MIT | 代码块语法高亮 |
| [Turndown](https://github.com/mixmark-io/turndown) | MIT | HTML 转 Markdown |
| [marked](https://marked.js.org/) | MIT | Markdown 解析 |
| [electron-updater](https://www.electron.build/auto-update) | MIT | 应用自动更新 |
| [electron-store](https://github.com/sindresorhus/electron-store) | MIT | 本地配置持久化 |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | MIT | 本地数据库（AI 会话历史） |
| [Pinia](https://pinia.vuejs.org/) | MIT | 状态管理 |
| [Vue Router](https://router.vuejs.org/) | MIT | 页面路由 |
| [vue-i18n](https://vue-i18n.intlify.dev/) | MIT | 国际化支持 |
| [Chokidar](https://github.com/paulmillr/chokidar) | MIT | 本地文件变更监听 |
| [Typo.js](https://github.com/cfinke/Typo.js) | BSD-3-Clause | 离线英文拼写检查 |
| [Prettier](https://prettier.io/) | MIT | 文档格式化 |
| [DaisyUI](https://daisyui.com/) | MIT | UI 组件库 |
| [Tailwind CSS](https://tailwindcss.com/) | MIT | 样式框架 |

## AI 相关依赖

| 依赖 | 许可证 | 用途 |
|------|--------|------|
| [@langchain/core](https://github.com/langchain-ai/langchainjs) | MIT | AI 工作流核心 |
| [@langchain/anthropic](https://github.com/langchain-ai/langchainjs) | MIT | Anthropic（Claude）接入 |
| [@langchain/openai](https://github.com/langchain-ai/langchainjs) | MIT | OpenAI 接入 |
| [@langchain/google-genai](https://github.com/langchain-ai/langchainjs) | MIT | Google Gemini 接入 |

## 说明

- 上述依赖均以其原始许可证条款分发，iWriter 不对其源代码进行修改后再分发。
- 完整依赖清单见 iWriter 主仓库的 [`package.json`](https://github.com/map9/iWriter/blob/main/package.json)。
- 如有许可证合规问题，请通过 [GitHub Issues](https://github.com/map9/iWriter/issues) 反馈。
