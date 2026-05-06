# iWriter 设计思路与当前实现对照

> 分析范围：`docs/` 文档设想、`README.md`、`src/` 渲染进程代码、`electron/` 主进程代码、`package.json`。
>
> 说明：`docs/` 表达的是产品方向和使用说明，不一定完全等同于当前代码实现。本文将“文档中的目标思路”和“代码中已经完成的能力”分开整理。

## 1. 总体判断

iWriter 的设计主线是：**本地文件优先的写作工作台，在成熟的 Markdown/富文本编辑能力之上，逐步接入 AI 辅助编辑与创作工作流**。

从 `docs/` 看，项目被规划成三个阶段：

1. 第一阶段：本地文件工作区 + Markdown/富文本编辑。
2. 第二阶段：AI 对话 + Edit 提案审批流。
3. 第三阶段：
   - `3.1` AI 支持下的个人知识库管理。
   - `3.2` AI 支持下的小说创作与写作。

从代码看，前两个阶段已经有较完整实现；第三阶段已经出现 Creative 模式、story asset 工具和小说创作 skill，但还处在“素材生成与保存”的早期形态，尚未形成完整的知识库系统、小说状态管理系统或长文本压缩/扩写 harness。

## 2. 文档中的核心设计思路

### 2.1 本地文件优先

文档反复强调 iWriter 不是在线文档平台，而是基于操作系统目录的纯文件工作区。用户通过打开本地文件夹组织资料、草稿、章节、作品和素材。

这个思路带来的产品定位是：

- 用户资产以真实文件存在，不被数据库或云平台锁定。
- Markdown、TXT、自有 `.iwt` 文件可以和其他工具共存。
- 工作区就是一个目录，便于备份、同步、版本管理和迁移。
- AI 是写作流程上的增强，不是数据入口本身。

### 2.2 富文本 Markdown 编辑器

文档把编辑器定位为“所见即所得 + Markdown 语法输入”的混合模式。用户既可以通过 Markdown 语法输入，也可以通过工具栏操作标题、列表、表格、图片、代码块、数学公式等结构。

这不是纯源码编辑器，而是结构化文档编辑器。它为后续 AI 编辑提供了基础：AI 可以围绕段落、标题、表格、图片、章节等结构工作，而不是只面对一整段字符串。

### 2.3 写作沉浸与工作区管理并重

文档中的界面思路是：

- 左侧：Explorer、Search、TOC 等工作区导航。
- 中间：多标签文档编辑和查看。
- 右侧：AI Agent 面板。
- 底部：状态栏。
- 偏好设置：主题、语言、编辑器、拼写、AI Provider、更新。

这说明项目不是只做一个编辑器控件，而是想做一个长期写作工作台。

### 2.4 AI 不直接写盘，而是提案审批

文档里非常明确：Edit 模式下 AI 先生成 proposal，用户逐项 `approve / edit / reject` 后才落地。

这是项目 AI 能力的安全边界：

- AI 可以建议。
- 用户保留最终控制权。
- 修改先以差异或提案形式呈现。
- 只有审批通过的内容才进入正文。

这个设计尤其适合写作类软件，因为写作内容有强主观性，不能让模型未经确认直接覆盖用户文本。

### 2.5 AI 三模式分工

文档把 AI 分成三种模式：

- `Edit`：面向当前文档编辑、改写、润色、结构调整。
- `Creative`：面向创意发散、草稿、提纲、人物、世界观、桥段、素材保存。
- `Minimal`：轻量对话，不加载业务工具。

这个设计的关键是避免把所有 AI 行为混在一个万能聊天框里。不同模式有不同工具、prompt、风险边界和用户预期。

### 2.6 第三阶段的长期方向

文档中第三阶段包含个人知识库和小说创作。结合当前 Creative 模式的代码，可以推断产品方向是：

- 从单篇文档编辑扩展到跨文档素材管理。
- 从一次性 AI 改写扩展到长期创作上下文。
- 从普通问答扩展到人物、世界观、支线、章节、场景等可复用资产。

但这部分在当前代码中还没有完整闭环。

## 3. 当前代码中已经完成的能力

### 3.1 桌面应用基础架构已经完成

项目采用 Electron + Vue 3 + TypeScript。

已经实现：

- Electron 主进程：`electron/App.ts`、`electron/WindowManager.ts`、`electron/MenuManager.ts`。
- 渲染进程：`src/main.ts`、`src/App.vue`、`src/views/MainView.vue`。
- preload 桥接：`electron/preload.ts` 通过 `window.electronAPI` 暴露受控能力。
- 路由：`src/router/index.ts` 当前主要是单页主视图。
- 状态管理：Pinia，核心在 `src/stores/app.ts` 和 `src/ai/store/ai.ts`。

实现状态：**已完成基础架构，可运行完整桌面应用。**

### 3.2 本地文件工作区基本完成

代码中已经实现：

- 打开文件夹。
- 构建文件树。
- 新建文件/文件夹。
- 重命名、移动、删除。
- 文件只读状态识别。
- 多标签页。
- 当前工作区与标签状态恢复。
- 文件变更监听。
- 自动保存、手动保存、另存为、全部保存。
- 工作区忽略规则。

主要实现位置：

- `src/stores/app.ts`
- `electron/App.ts`
- `src/services/workspace/filtering.ts`
- `src/components/sidebar/ExplorerPanel.vue`
- `src/components/common/tree/`

实现状态：**与文档描述基本匹配。**

### 3.3 Markdown/富文本编辑器能力较完整

代码中编辑器基于 TipTap / ProseMirror，扩展集中在：

- `src/components/pages/MarkdownEditorPage.vue`
- `src/utils/editorExtensions.ts`
- `src/components/common/tiptap/`
- `src/import-export/formatConverter.ts`

已经实现或接入：

- 标题、段落、粗体、斜体、下划线、删除线、高亮、链接、行内代码。
- 引用、任务列表、有序/无序列表。
- 表格、图片、代码块、数学公式。
- TOC 联动。
- 文内搜索替换。
- 拼写与语法检查。
- 图片、表格、代码块、公式块自定义视图。
- Markdown / TXT / IWT / 代码文件的读写转换。
- 打印预览与 PDF 输出流程。

实现状态：**第一阶段核心编辑能力基本完成。**

需要注意：

- Markdown 和 TipTap/HTML 之间存在往返转换，复杂格式仍可能有格式损耗风险。
- `.iwt` 是自有 JSON 格式，可以更完整保留 HTML 内容和元数据。

### 3.4 图片和 PDF 查看能力已实现

代码中已经有：

- 图片查看器：`src/components/pages/ImageViewerPage.vue`
- PDF 查看器：`src/components/pages/PDFViewerPage.vue`
- PDF 渲染 provider：`src/services/pdf-render/PdfJsPageRenderProvider.ts`
- PDF TOC provider：`src/services/toc/PDFTocProvider.ts`

已支持：

- 图片缩放、旋转、拖拽平移、适配窗口。
- PDF 连续/单页/双页模式、缩放、跳页、canvas 渲染、缓存和取消渲染。

实现状态：**与文档描述基本匹配。**

### 3.5 搜索与替换能力已实现

代码中有两类搜索：

- 文内搜索替换：`src/components/common/tiptap/iw-search-replace/`
- 跨文件搜索替换：`src/components/sidebar/SearchPanel.vue`

相关支持包括：

- 正则。
- 大小写。
- 全词匹配。
- 搜索历史。
- 复用文档加载抽象。

共享文档访问层在：

- `src/services/document/DocumentLoader.ts`

实现状态：**文档中描述的搜索能力基本完成。**

### 3.6 AI Runtime 主体已经完成

当前 AI Runtime 不在纯前端里跑，而是在 Electron 主进程中运行：

- `electron/ai/AgentEngine.ts`
- `electron/ai/ipc/`
- `electron/ai/providers/`
- `electron/ai/checkpoint/`
- `electron/ai/runtime/`
- `src/ai/store/ai.ts`
- `src/components/ai/AgentPanel.vue`

已经实现：

- AI 会话线程。
- 会话历史持久化。
- Streaming。
- Cancel / Resume。
- Provider 配置同步。
- 模型选择。
- token 预算估算。
- 上下文附件。
- 工作区和附件挂载。
- 输入压缩。
- 上下文 token 统计。

实现状态：**第二阶段 AI 对话和运行时基础已经完成。**

### 3.7 AI Provider 支持已实现

Provider 预设在：

- `src/ai/providers/provider-presets.ts`

主进程模型创建在：

- `electron/ai/providers/ModelFactory.ts`
- `electron/ai/providers/ChatDeepSeek.ts`

已经支持：

- OpenAI-compatible。
- DeepSeek。
- Anthropic。
- Gemini。
- Ollama 通过 OpenAI-compatible 接入。
- GLM 通过 OpenAI-compatible 接入。

实现状态：**文档描述的 Provider 体系基本完成。**

注意：

- 文档提到 Ollama 模型列表自动读取；当前代码中有 Ollama 预设和模型列表，但是否完整做到运行时自动拉取，需要进一步针对 UI 和 provider 配置代码单独验证。

### 3.8 Edit 模式和审批流已经较完整

Edit 模式系统提示在：

- `src/ai/thread/system-prompts/edit.ts`

文档读取工具在：

- `electron/ai/tools/DocumentTools.ts`

编辑提案工具在：

- `electron/ai/tools/EditProposalTools.ts`

能力组合在：

- `electron/ai/domain/edit/buildEditCapabilities.ts`

已经实现：

- `get_document_outline`
- `get_section`
- `get_blocks`
- `get_block_context`
- `search_blocks_in_document`
- `search_sections_in_document`
- `search_in_directory`
- `edit_block`
- `insert_block`
- `delete_block`
- `replace_range`
- `create_document`

并且通过 `interruptOn` 设置审批决策：

- approve
- edit
- reject

实现状态：**与文档中的 AI Edit 审批流高度匹配。**

这个部分是当前项目 AI 能力最完整、最有产品辨识度的实现。

### 3.9 Creative 模式已经有早期素材系统

Creative 模式提示在：

- `src/ai/thread/system-prompts/creative.ts`

Creative 能力组合在：

- `electron/ai/domain/creative/buildCreativeCapabilities.ts`

素材工具在：

- `electron/ai/tools/CreativeArtifactTools.ts`

内置创作 skill 在：

- `electron/ai/builtin-skills/novel-brainstorm/SKILL.md`
- `electron/ai/builtin-skills/worldbook-planner/SKILL.md`
- `electron/ai/builtin-skills/character-forge/SKILL.md`
- `electron/ai/builtin-skills/storyline-architect/SKILL.md`

已经实现的 story asset 分区：

- `brainstorms`
- `worldbook`
- `characters`
- `storylines`
- `scenes`
- `notes`

实现状态：**Creative 的素材生成和保存雏形已完成。**

但当前 Creative 仍偏“生成和保存素材”，尚不是完整小说创作管理系统。它还没有形成：

- 百万字小说压缩。
- 主线/支线/时间线自动抽取。
- 场景卡批量生成。
- 人物卡持续更新。
- 伏笔表管理。
- 从 StoryState 扩写整本小说。
- 压缩/扩写/校验 harness 闭环。

### 3.10 Minimal 模式已实现

Minimal 模式对应：

- `src/ai/thread/system-prompts/minimal.ts`
- `electron/ai/AgentEngine.ts`

在 `AgentEngine` 中，`minimal` 模式不加载业务工具。

实现状态：**已完成轻量对话模式。**

### 3.11 自动更新与偏好设置已实现

更新相关：

- `src/updater/UpdaterManager.ts`
- `src/updater/UpdaterService.ts`
- `src/components/updater/UpdateDialog.vue`

偏好设置相关：

- `src/components/preferences/PreferencesDialog.vue`
- `src/utils/StateStorage.ts`
- `src/utils/themes.ts`

已经覆盖：

- 主题。
- 语言。
- 自动保存。
- 拼写与语法检查。
- AI Provider。
- 更新策略。

实现状态：**文档描述的大部分偏好设置和更新能力已实现。**

注意：

- 自动更新仅生产环境启用。
- 发布源依赖 GitHub Releases。

## 4. 文档思路与代码实现不完全匹配的部分

### 4.1 Tag 面板尚未真实完成

文档和 README 已标注 Tag 面板是 mock。

代码中 `src/components/sidebar/TagPanel.vue` 使用固定示例数据，并且 `LeftSidebar.vue` 中 Tag 按钮已被注释掉。

当前状态：**未完成真实标签索引系统。**

后续如果要补齐，需要实现：

- 从 Markdown / IWT 内容中抽取 tag。
- 建立工作区 tag 索引。
- 监听文件变更后增量更新。
- 点击 tag 展示真实文件和命中位置。

### 4.2 个人知识库阶段未启动

文档路线图中 `3.1` 是 AI 支持下的个人知识库管理，但代码中尚未看到完整知识库能力。

当前已有的基础能力包括：

- 本地文件工作区。
- 跨文件搜索。
- AI 可读取工作区文档。
- 附件和目录上下文。

但缺少：

- 文档索引数据库。
- 语义检索。
- 双链或引用图谱。
- 标签/主题体系。
- 知识条目抽取和归档。

当前状态：**方向明确，基础具备，正式知识库系统未实现。**

### 4.3 小说创作只完成了素材层雏形

文档首页和 Creative 文档强调 StoryMate、扩写、缩写、续写、人物、场景、故事情节等能力。

当前代码中确实有：

- Creative 模式。
- story asset 保存工具。
- 人物、世界观、剧情线、脑暴相关 skill。

但这些更像“创作素材管理工具”，不是完整小说工程系统。

当前缺少：

- 小说全文导入后的结构化压缩。
- 章节/场景自动切分。
- 主线、支线、时间线、人物状态自动提取。
- 场景卡和人物卡的持续更新机制。
- 长篇扩写计划。
- 扩写结果校验。
- 与正文落地审批流的深度整合。

当前状态：**第三阶段 `3.2` 已开始，但远未完成。**

### 4.4 输入压缩不等于完整上下文压缩 harness

代码中已经有 `compactInput`：

- 位置：`electron/ai/AgentEngine.ts`
- 作用：压缩用户输入，减少 token。
- UI：`src/components/ai/agent-panel/composables/useChatSend.ts`

但它不是完整的会话压缩，也不是小说压缩。

当前缺少类似 Claude Code 的 compact harness：

- 历史会话总结。
- compact boundary。
- 压缩后上下文重建。
- 自动保留关键近期消息。
- 压缩后重新注入文件状态、工具状态、故事状态。
- 失败重试和 token 预算闭环。

当前状态：**有输入压缩能力，没有完整长上下文压缩系统。**

### 4.5 测试体系不明显

当前 `package.json` 中有：

- `type-check`
- `build`
- `lint`

但未看到常规 `test` 脚本和明显的测试目录。

当前状态：**工程结构完整，但自动化测试覆盖不明显。**

## 5. 按阶段整理当前完成度

| 阶段 | 文档目标 | 当前代码状态 | 判断 |
| --- | --- | --- | --- |
| 第一阶段 | 本地文件工作区、Markdown/富文本编辑 | 文件树、多标签、保存、监听、TipTap 编辑器、图片/PDF、搜索、TOC 已实现 | 基本完成 |
| 第二阶段 | AI 对话、Edit 提案审批流 | 主进程 AgentEngine、Provider、Edit 工具、HITL 审批、AI 面板已实现 | 基本完成 |
| 第三阶段 3.1 | AI 个人知识库 | 只有文件工作区、搜索、AI 读取上下文等基础 | 未正式启动 |
| 第三阶段 3.2 | AI 小说创作与写作 | Creative 模式、story asset、内置创作 skill 已有 | 刚开始 |

## 6. 当前系统的真实设计形态

结合文档和代码，目前 iWriter 更准确的形态是：

```text
本地文件工作区
  -> 多标签文档编辑
  -> TipTap 结构化文档
  -> 搜索 / TOC / 文件管理
  -> AI Agent 面板
      -> Minimal 对话
      -> Edit 文档读取 + 编辑提案 + 用户审批
      -> Creative 创作素材生成与保存
```

其中最成熟的主链路是：

```text
打开本地工作区
  -> 打开 Markdown / IWT / TXT 文档
  -> 在 TipTap 编辑器中写作
  -> 通过右侧 AI 提出编辑需求
  -> AI 读取文档结构和目标 block
  -> AI 生成编辑提案
  -> 用户 approve / edit / reject
  -> 已通过提案应用到正文
  -> 用户保存
```

## 7. 对后续小说 harness 的启示

如果继续推进第三阶段 `3.2`，当前代码已有以下可复用基础：

- `DocumentViewBuilder`：可把文档转换成 block map、outline、章节结构。
- `DocumentTools`：可按 outline / section / blocks 读取文档。
- `CreativeArtifactTools`：已有 story asset 保存目录和工具。
- `EditProposalTools`：已有审批式正文落地机制。
- `AgentEngine`：已有会话、工具、Provider、streaming、resume、checkpoint 基础。

可以在此基础上新增一个小说 harness 层：

```text
novel-harness
  -> ingest：导入和切分小说
  -> compress：抽取主线、支线、时间线、场景卡、人物卡、世界观、伏笔
  -> store：保存 StoryState / StoryBible / SceneCards
  -> expand：按 StoryState 生成章节计划和场景正文
  -> validate：校验人物、时间线、设定、伏笔、风格和长度
  -> apply：通过现有 Edit proposal 审批流落地正文
```

建议不要一开始做“百万字全文压缩再整本扩写”，而是先做小闭环：

1. 单章导入。
2. 单章切成场景。
3. 生成场景卡。
4. 从场景卡抽人物状态和时间线。
5. 根据场景卡扩写回一章。
6. 校验扩写结果是否覆盖场景卡。
7. 再扩大到整卷、整本。

## 8. 结论

文档中的产品思路和当前代码总体方向一致：iWriter 已经从本地 Markdown 编辑器推进到 AI 辅助写作工具。

当前已经完成的核心是：

- 本地文件优先工作区。
- TipTap 富文本/Markdown 编辑器。
- 图片/PDF 查看。
- 搜索替换。
- AI Provider 配置。
- AI 会话和上下文。
- Edit 模式文档工具。
- 提案审批式 AI 编辑。
- Creative 模式素材保存雏形。
- 偏好设置和自动更新。

尚未完成或仍处早期的是：

- Tag 索引。
- 个人知识库系统。
- 完整小说创作系统。
- 长文本压缩/扩写 harness。
- 自动化测试体系。

因此，当前项目最准确的阶段判断是：

> 第一阶段和第二阶段已经基本可用；第三阶段已经埋下 Creative 和 story asset 的种子，但还需要围绕“结构化小说状态”和“压缩/扩写/校验 harness”继续建设。
