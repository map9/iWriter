# iWriter 设计思路与实现现状对照分析

> 校对基准：代码截至 2026-04-22（README 声明），文档版本 `0.1.8`（docs 声明 2026-04-29）。  
> 本文以实际代码为准，文档描述视为设计意图。凡两者不一致处，均单独说明。

---

## 一、总体定位

iWriter 的设计主线是：

> **本地文件优先的桌面写作工作台，在富文本 Markdown 编辑能力基础上，逐步叠加 AI 辅助写作与编辑工作流。**

官方文档和 README 都将项目划分为三个阶段，且阶段定义与代码状态高度对应：

| 阶段 | 文档描述 | 代码现状 |
|------|---------|---------|
| 第一阶段 | 本地文件工作区 + Markdown/富文本编辑 | **基本完成** |
| 第二阶段 | AI 对话 + Edit 提案审批流 | **基本完成，可用** |
| 第三阶段 3.1 | AI 支持下的个人知识库管理 | **未启动** |
| 第三阶段 3.2 | AI 支持下的小说创作与写作 | **已开始，雏形阶段** |

---

## 二、文档中的核心设计思路

### 2.1 本地文件优先，不引入私有数据库

文档反复强调：iWriter 不是在线文档平台，工作区即本地目录。用户资产以真实文件存在，不被数据库或云平台锁定。AI 是写作流程的增强，不是数据入口。

设计推论：
- `.md` / `.txt` / `.iwt` 可与外部工具共存
- 工作区便于备份、同步、版本控制
- AI 读取文档结构，但不主动写盘（除非用户审批）

### 2.2 富文本 Markdown 编辑器：所见即所得 + 语法输入双模

文档把编辑器定位为"WYSIWYG + Markdown 语法输入"的混合模式，不是源码编辑器。这为后续 AI 编辑提供了结构基础：AI 可以按段落、标题、列表、表格、代码块等结构工作，而不是面对一整段字符串。

### 2.3 AI 核心原则：提案审批，不直接写盘

文档非常明确：Edit 模式下 AI 先生成 proposal，用户逐项 `approve / edit / reject` 后才落地。

这是项目 AI 能力最核心的安全边界设计：
- AI 可以建议，用户保留最终控制权
- 修改以差异/提案形式呈现
- 只有审批通过的内容才进入正文

### 2.4 AI 三模式分工

| 模式 | 定位 | 工具链 |
|------|------|--------|
| `Edit` | 文档编辑、润色、结构调整 | 文档读取工具 + 编辑提案工具 |
| `Creative` | 创意发散、素材生成与保存 | story asset 工具 + builtin skills |
| `Minimal` | 轻量对话 | 无业务工具 |

设计意图是避免把所有 AI 行为混入一个万能聊天框，不同模式有不同工具集、系统提示、风险边界。

### 2.5 阶段三的长期方向

- **3.1 个人知识库**：从单篇文档扩展到跨文档语义检索和知识条目管理
- **3.2 小说创作**：从一次性 AI 改写扩展到长期创作上下文，支持人物、世界观、章节、场景等可复用资产

---

## 三、当前代码实现细节

### 3.1 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron |
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| 编辑器 | TipTap 3 + ProseMirror |
| 样式 | Tailwind CSS 4 + Sass + daisyUI |
| AI Runtime | **deepagents** + **LangGraph** + **better-sqlite3** |
| AI 会话持久化 | `@langchain/langgraph-checkpoint-sqlite` |
| 更新 | electron-updater |
| 构建 | Vite + electron-builder |

重要说明：AI Runtime 运行在 **Electron 主进程**，不在渲染进程。渲染进程通过 IPC 与主进程通信，再由主进程调用 LLM API。

### 3.2 主进程 AI Runtime 架构

```
electron/ai/
├── AgentEngine.ts              # 核心调度器（747 行）
├── checkpoint/
│   └── CheckpointerFactory.ts  # SQLite 持久化会话历史
├── config/
│   └── AiConfigStore.ts        # AI 配置（provider/model）存储
├── document/
│   ├── BlockParser.ts          # 文档块解析
│   ├── DocumentSearch.ts       # 文档搜索
│   └── SnapshotBroker.ts       # 文档快照代理（IPC 通道）
├── domain/
│   ├── edit/buildEditCapabilities.ts     # Edit 能力组合
│   └── creative/buildCreativeCapabilities.ts # Creative 能力组合
├── ipc/
│   ├── MessageAdapter.ts        # 消息转换
│   ├── RendererEventBridge.ts   # 向渲染进程推送事件
│   ├── StreamEventAdapter.ts    # streaming chunk 转换
│   ├── UserMessageBuilder.ts    # 用户消息构建
│   └── protocol.ts              # IPC 协议定义
├── providers/
│   ├── ChatDeepSeek.ts          # DeepSeek 接入
│   └── ModelFactory.ts          # Provider 工厂
├── runtime/
│   ├── AttachedFileBackend.ts   # 附件文件后端
│   ├── FilesystemMounts.ts      # 文件系统挂载点
│   ├── ThreadRuntimeResolver.ts # Thread 运行时解析
│   └── ThreadRuntimeStore.ts    # Thread 运行时状态存储
├── thread/
│   └── ThreadListQuery.ts       # Thread 列表查询
├── tools/
│   ├── DocumentTools.ts         # 文档读取工具集
│   ├── EditProposalTools.ts     # 编辑提案工具集
│   ├── CreativeArtifactTools.ts # 创意素材工具集
│   └── runtimeHelpers.ts        # 运行时辅助
└── builtin-skills/              # 内置 skill 定义
    ├── character-forge/SKILL.md
    ├── novel-brainstorm/SKILL.md
    ├── storyline-architect/SKILL.md
    └── worldbook-planner/SKILL.md
```

#### AgentEngine 核心机制

- **Agent 缓存**：按 `configId + domain + mode + modelId` 缓存 Agent 实例，避免重复创建
- **Thread-scoped 上下文**：每个 thread 有独立的文件路径、附件挂载、编辑器快照
- **Token 预算验证**：发送前检查 token 预算，不够则拒绝
- **输入压缩**：`compactInput()` 方法压缩用户输入以减少 token 消耗
- **Streaming 取消**：通过 `AbortController` 取消进行中的流式调用
- **LangGraph HITL**：使用 `interruptOn` 机制触发人工审批中断

#### Edit 能力的 `interruptOn` 机制

`buildEditCapabilities.ts` 中明确配置了哪些工具调用需要中断等待用户审批：

```typescript
interruptOn: {
  edit_block:      { allowedDecisions: ['approve', 'edit', 'reject'] },
  insert_block:    { allowedDecisions: ['approve', 'edit', 'reject'] },
  delete_block:    { allowedDecisions: ['approve', 'reject'] },
  replace_range:   { allowedDecisions: ['approve', 'edit', 'reject'] },
  create_document: { allowedDecisions: ['approve', 'edit', 'reject'] },
}
```

这是 LangGraph Human-in-the-Loop 的标准用法。每次 AI 调用写盘类工具，runtime 会在该工具执行前暂停，等待渲染进程发回决策后再继续（`resumeRun()`）。

#### Creative 能力的 Skills 系统

`buildCreativeCapabilities.ts` 使用 `LocalShellBackend` 并加载 `/skills/` 目录下的 SKILL.md 文件作为可调用的内置技能。每个 skill 是结构化的 Markdown 提示文件，包含 frontmatter（name、description）和工作流说明。

story asset 保存路径规则：
- 有工作区时：`{workspace}/.iwriter/story/{section}/{slug}.md`
- 无工作区时：`{aiRootPath}/projects/{threadId}/story/{section}/{slug}.md`

### 3.3 渲染进程 AI 架构

```
src/ai/
├── edit-agent/
│   ├── BlockEditApplier.ts      # 将审批后的提案应用到 TipTap 编辑器
│   ├── DocumentViewBuilder.ts   # 将 TipTap 状态转为 LLM 可读 Markdown 视图
│   ├── EditParser.ts            # 解析编辑指令
│   └── UnifiedDocumentAccess.ts # 统一文档访问接口
├── snapshot/
│   └── SnapshotSerializer.ts    # 序列化编辑器快照（通过 IPC 发给主进程）
├── review/                      # 提案审批状态管理
├── store/
│   └── ai.ts                    # Pinia AI store（含 settings、threads、runtime state）
├── thread/
│   ├── Thread.ts                # Thread/Message 创建工具
│   ├── ContextBuilder.ts        # 上下文构建
│   └── system-prompts/          # 各模式系统提示
├── providers/                   # Provider 抽象层（渲染进程侧）
└── types.ts                     # 核心类型定义
```

#### DocumentViewBuilder：文档结构化视图

将 TipTap/ProseMirror 文档转为带 `{b:n}` 块 ID 标记的 Markdown 视图供 LLM 消费：

- `viewMarkdown`：完整文档 Markdown，每个块有唯一 `{b:n}` 标记
- `outline`：标题层级树，含每节的块数和字数
- `blockMap`：displayId → nodeId / ProseMirror 位置的映射表

支持多种视图模式：全文视图、节视图（从标题到下一同级标题）、块上下文窗口、指定块列表、块范围视图。

#### BlockEditApplier：提案落地

将审批后的 `BlockEditProposal` 应用到 TipTap 编辑器：
- 写入前验证当前内容是否与提案预期内容一致（防止并发修改冲突）
- 通过 `markdownToContent()` 将 LLM 返回的 Markdown 转回 TipTap JSON
- 所有操作记录在 UndoRedo 历史（用户可 Cmd+Z 回退）

#### 提案审批状态机

`src/ai/review/types.ts` 定义了完整的审批状态：

```
ProposalDecision.kind:
  approved / edited / skipped / rework_requested / round_ended / batch_paused / failed_to_apply

ProposalReviewEntry.state:
  approved / edited / rework / paused / ended / rejected / failed
```

支持批次暂停（`batch_paused`）、重做请求（`rework_requested`）、批次结束（`round_ended`）等细粒度状态。

### 3.4 AI Provider 支持

`src/ai/providers/provider-presets.ts` 中内置的 Provider 预设（截至代码版本，含最新模型）：

| Provider | 类型 | 代表模型 |
|----------|------|---------|
| Ollama | openai-compat | 本地自定义 |
| DeepSeek | deepseek | deepseek-v4-pro/flash |
| GLM（智谱）| openai-compat | glm-5/4.7/4.6 |
| OpenAI | openai-compat | gpt-5.4, gpt-5, gpt-4.1 系列 |
| Anthropic | anthropic | claude-opus/sonnet/haiku 4.x 系列 |
| Gemini | gemini | gemini-3.x, gemini-2.5 系列 |

每个模型有 `AiModelProfile` 能力标记：`maxInputTokens`、`imageInputs`、`pdfInputs`、`reasoningOutput`、`toolCalling` 等。

会话历史通过 `@langchain/langgraph-checkpoint-sqlite` 持久化到本地 SQLite，重启后会话可恢复。

### 3.5 编辑器能力

基于 TipTap 3 + ProseMirror，实现了以下能力：

**行内格式**：粗体、斜体、下划线、删除线、高亮、链接、行内代码  
**块级元素**：标题（H1-H6）、段落、引用、代码块（含语法高亮）、数学公式（KaTeX）、任务列表、有序/无序列表、表格、图片、水平线  
**特殊扩展**：文内搜索替换、拼写/语法检查（LanguageTool / Typo.js）、TOC 联动、popup 工具（链接/公式编辑）、range 高亮层、图片/表格/代码块/公式块自定义节点视图  
**写作模式**：Clean Mode、Focus Mode、Typewriter Mode  
**剪贴板**：图片粘贴、富文本粘贴、粘贴为纯文本  
**格式转换**：`.md` ↔ TipTap HTML ↔ `.iwt`（JSON 格式）、`.txt`、代码文件  
**打印/PDF**：`src/components/print/` 下有完整的打印预览流程

### 3.6 文件系统与工作区

已实现：打开文件夹、树形结构、新建/重命名/移动/删除、拖拽调整、外部变更监听（chokidar）、多标签页、重启恢复、自动保存、另存为、全部保存、只读模式识别、工作区忽略规则、跨文件搜索替换（正则/大小写/全词）。

### 3.7 其他已实现能力

- **图片查看**：缩放、旋转、拖拽、适配窗口
- **PDF 查看**：连续/单页/双页、缩放、跳页、canvas 懒加载渲染、TOC
- **自动更新**：electron-updater，stable/beta 通道，依赖 GitHub Releases
- **偏好设置**：主题、语言、AI Provider、拼写检查引擎、更新策略
- **国际化**：`en-US` / `zh-CN`
- **状态栏**：可扩展 StatusBarManager，含文件统计、更新状态等

---

## 四、文档思路与代码实现的差异

### 4.1 Tag 面板：设计有，实现是 mock

文档和 README 均标注 Tag 面板为 mock。`src/components/sidebar/TagPanel.vue` 使用固定示例数据，且 `LeftSidebar.vue` 中 Tag 按钮已被注释。

**补齐需要**：从 Markdown/IWT 内容中抽取 tag、建立工作区 tag 索引、文件变更后增量更新、点击展示真实文件和命中位置。

### 4.2 个人知识库（3.1）：未启动

当前已有基础（文件工作区、跨文件搜索、AI 读取上下文），但缺少：

- 文档索引数据库
- 语义检索
- 双链或引用图谱
- 知识条目抽取和归档

### 4.3 小说创作（3.2）：素材层雏形，完整系统未形成

当前已有：
- Creative 模式 + story asset 保存读取工具
- 4 个内置 skill（novel-brainstorm、worldbook-planner、character-forge、storyline-architect）
- story asset 分区存储（brainstorms / worldbook / characters / storylines / scenes / notes）
- Story asset 存储在工作区 `.iwriter/story/` 目录下（Markdown 文件）

**但仍缺少**：
- 小说全文导入后的结构化压缩
- 章节/场景自动切分
- 主线、支线、时间线、人物状态自动提取
- 场景卡和人物卡的持续更新机制
- 长篇扩写计划与校验
- StoryState 与正文落地审批流的深度整合
- 跨 chapter/跨会话的状态一致性保障

### 4.4 输入压缩 ≠ 完整上下文压缩 harness

`AgentEngine.compactInput()` 压缩的是**用户输入**，用于减少单次请求 token。这不等同于：

- 历史会话总结与压缩
- compact boundary 设置
- 压缩后上下文重建
- 自动保留关键近期消息
- 压缩后重新注入文件状态、工具状态、故事状态

### 4.5 Ollama 模型列表自动拉取未确认

文档提到 Ollama 支持，代码中有 Ollama 预设，但运行时是否自动从本地 Ollama 服务拉取模型列表，需进一步验证 Provider 配置 UI 的实际行为。

### 4.6 无自动化测试体系

`package.json` 中无 `test` 脚本，无测试目录可见。有 `type-check`、`lint`、`build` 验证，但无单元/集成测试覆盖。

---

## 五、当前系统的真实形态（主链路）

```
打开本地工作区
  -> 打开 Markdown / IWT / TXT 文档
  -> 在 TipTap 编辑器中写作
  -> 通过右侧 AI 面板提出编辑需求
      [Edit 模式]
        -> AgentEngine 向 LLM 发送请求
        -> LLM 调用 DocumentTools 读取文档结构和目标 block
        -> LLM 调用 EditProposalTools 生成编辑提案
        -> interruptOn 触发，runtime 暂停，推送 interrupt 事件到渲染进程
        -> 渲染进程展示提案（diff 视图）
        -> 用户逐项 approve / edit / reject
        -> 渲染进程发送 resumeRun 携带决策
        -> AgentEngine 继续，已通过提案通过 BlockEditApplier 写入 TipTap
      [Creative 模式]
        -> LLM 调用 list/read/save_story_asset 工具管理素材
        -> 素材保存到工作区 .iwriter/story/ 目录
        -> builtin-skills 提供 novel-brainstorm / character-forge 等结构化工作流
      [Minimal 模式]
        -> 纯对话，无工具调用
  -> 用户保存文档
```

---

## 六、对下一步工作的启示

### 6.1 可复用的已有基础

| 组件 | 可复用能力 |
|------|-----------|
| `DocumentViewBuilder` | 文档 → block map + outline + 章节结构 |
| `DocumentTools` | 按 outline / section / blocks 读取文档 |
| `BlockEditApplier` | 审批式正文落地，含 UndoRedo 集成 |
| `CreativeArtifactTools` | story asset 分区保存/读取/列举 |
| `EditProposalTools` + `interruptOn` | 任意工具的 HITL 审批中断 |
| `AgentEngine` | 会话、工具、Provider、streaming、resume、SQLite checkpoint |
| `builtin-skills` 系统 | 可扩展的 SKILL.md 驱动技能，无需硬编码 prompt |

### 6.2 小说 harness 建议路径（增量闭环）

不建议一开始做"百万字全文压缩再整本扩写"，建议先完成小闭环再扩大：

```
第一步：单章导入
  -> 使用 DocumentViewBuilder 将单章切成场景块
  -> 生成场景卡（save_story_asset section="scenes"）

第二步：场景卡 → 人物状态 + 时间线抽取
  -> 从场景卡抽取 CharacterState 和 TimelineEntry
  -> 持久化到 story asset (characters / storylines)

第三步：场景卡 → 扩写一章
  -> 以场景卡为输入，生成段落 draft
  -> 通过现有 EditProposalTools + interruptOn 落地到文档

第四步：校验
  -> 对比扩写结果与场景卡的人物、时间、设定覆盖
  -> 输出校验报告，暴露遗漏点

第五步：扩大到整卷 → 整本
```

### 6.3 Tag 系统建议路径

```
从 DocumentViewBuilder 抽取 inline 标签（#tag 模式或 frontmatter tags）
  -> 建立工作区级 Map<tag, filePath[]>
  -> 存入内存（工作区打开时建立，文件变更时增量更新）
  -> TagPanel 展示真实 tag 列表 + 点击定位
```

---

## 七、GPT 版分析的补充与更正

GPT 生成的 `design-and-implementation-analysis.md` 整体方向准确，以下是补充或更正项：

| 条目 | 原分析 | 更正/补充 |
|------|--------|----------|
| AI Runtime 位置 | 提到主进程，但未说明具体框架 | 使用 **deepagents + LangGraph**，`interruptOn` 是 LangGraph HITL 标准机制 |
| 会话持久化 | "会话历史持久化" | 具体是 `@langchain/langgraph-checkpoint-sqlite`（SQLite 存储） |
| Creative 能力 | "story asset 保存工具" | 还有 `LocalShellBackend` 驱动的 **builtin-skills 系统**（SKILL.md 文件） |
| Edit 工具 | 列出了工具名 | 还需说明 `interruptOn` 在 `buildEditCapabilities` 中是**显式配置**的，每个写盘工具对应一组 allowedDecisions |
| Story asset 存储路径 | 未提 | 有工作区时存 `{workspace}/.iwriter/story/`，否则存 AI 根目录下 per-thread 目录 |
| Provider 模型名 | 部分模型名较旧 | 预设中已包含 2026 年最新模型（gpt-5.4、claude-sonnet-4-6/4-7、gemini-3.x 等） |
| 输入压缩 | 作为"有"列举 | 需区分：`compactInput()` 是**用户输入压缩**，不是会话历史压缩 harness |
| BlockEditApplier | "审批后应用" | 还有**内容一致性验证**（expectedCurrentContent 比对）和 **UndoRedo 集成** |

---

## 八、结论

**当前最准确的阶段判断：**

> 第一阶段和第二阶段已经基本可用。第三阶段 3.2（小说创作）已经埋下 Creative 模式、story asset 存储和 builtin-skills 系统的种子，具备明确可扩展的基础，但尚未形成完整的小说状态管理闭环。第三阶段 3.1（个人知识库）未启动。

**技术实现质量亮点：**
- Edit 模式的 HITL 审批流实现完整且精细（interruptOn + 多种 decision 类型 + UndoRedo）
- DocumentViewBuilder 的块结构化视图设计合理，是 AI 编辑能力的关键基础
- builtin-skills 的 SKILL.md 架构灵活可扩展，添加新 skill 无需修改代码
- SQLite checkpoint 实现了真正的会话持久化

**主要欠缺：**
- Tag 系统是 mock
- 无自动化测试
- Creative 模式只完成了素材生成和保存，缺少状态跟踪和一致性保障
- 无完整长上下文压缩 harness
