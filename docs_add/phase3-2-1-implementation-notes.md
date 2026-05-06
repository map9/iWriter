# Phase 3.2.1 Implementation Notes

> 版本：v1.0  
> 状态：实现前约定，补充 phase3-feature-planning.md 的三处未定义细节  
> 覆盖范围：文件布局 / 确认节点 UI+payload / novel-harness 目录结构

这三件事不影响立项完备性，但不定下来会导致开发时各子任务做出不兼容的假设。

---

## 1. `.iwriter/story/` 文件布局

### 1.1 目录结构

```
{workspace}/.iwriter/story/
├── characters/          # CharacterCard，一卡一文件
├── scenes/              # SceneCard，一张一文件
├── timeline/            # TimelineEvent，一章一文件（汇集本章所有事件）
├── foreshadowing/       # ForeshadowingEntry，一条一文件
├── outlines/            # OutlineChapter，一章一文件
├── style/               # StyleProfile，全书唯一一份
├── worldbook/           # WorldbookEntry（已有 section，沿用）
├── brainstorms/         # 已有 section，沿用
├── storylines/          # 已有 section，沿用
└── notes/               # 已有 section，沿用（互动片段写回也放这里）
```

新增的 section（`timeline` / `foreshadowing` / `outlines` / `style`）需要同步加入
`CreativeArtifactTools.ts` 的 `STORY_SECTIONS` 常量，其余代码无需改动。

### 1.2 文件命名规则

| 类型 | 目录 | 命名规则 | 示例 |
|------|------|---------|------|
| CharacterCard | `characters/` | `{character_id}.md` | `li-ming.md` |
| SceneCard | `scenes/` | `{chapter_id}--{seq}.md`（双连字符分隔，避免与章节 id 内的连字符歧义） | `ch01--001.md` |
| TimelineEvent（整章） | `timeline/` | `{chapter_id}.md` | `ch01.md` |
| ForeshadowingEntry | `foreshadowing/` | `{entry_id}.md` | `sword-prophecy.md` |
| OutlineChapter | `outlines/` | `{chapter_id}.md` | `ch01.md` |
| StyleProfile | `style/` | `profile.md`（固定名，全书唯一） | `profile.md` |
| WorldbookEntry | `worldbook/` | `{slug}.md`（沿用现有规则） | `magic-system.md` |

**`chapter_id` 约定**：`ch` + 零填充两位序号，如 `ch01`、`ch12`。多于 99 章时用三位（`ch100`）。
自动生成时由 ingest 模块根据章节序号填入；用户手动创建文件时可自行命名，系统不强制。

**`character_id` 约定**：人名转 slug（`normalizeSlug` 现有函数），重名时附加 `--{uuid4前4位}`。

**`entry_id` / `seq` 约定**：由 LLM 输出时生成，orchestrator 负责保证在 section 内不重复（写入前
调用 `list_story_assets` 检查）。

### 1.3 文件内部格式（统一模板）

所有 story asset 文件遵循相同结构：

```markdown
---
# YAML frontmatter（机器读写，含所有结构化字段）
id: li-ming
type: character_card
name: 李明
# ... 其余 StoryState schema 字段
confidence: 0.85
updated_at: "2026-05-06T12:00:00Z"
---

<!-- 以下为人类可读正文，用于用户直接阅读和编辑 -->
## 人物简述
李明，男，25岁，故事主角...
```

**约定**：
- frontmatter 由 orchestrator 写入，正文由 orchestrator 根据 frontmatter 自动生成摘要段落
- 用户直接编辑文件时，下次读取以 frontmatter 为准（正文仅供参考，不参与校验）
- `type` 字段是必填字符串字面量：`character_card` / `scene_card` / `timeline_chapter` /
  `foreshadowing_entry` / `outline_chapter` / `style_profile` / `worldbook_entry`

---

## 2. 确认节点 UI / Payload / Decision 最小结构

### 2.1 总体设计决策

**MVP 用 ConfirmCard（轻量内联卡片），不做复杂拖拽 UI。**

理由：
- 复杂拖拽 UI 约需 1–2 周额外开发，对 MVP 验收没有增量价值
- 轻量 ConfirmCard 可以完全复用现有 AI 面板的 message stream 布局
- 用户需要修改切分/归并结果时，通过 ConfirmCard 上的文字输入框提交修改意见，orchestrator
  重新生成，不需要拖拽

**渠道选择**：不复用现有 `ai:run-interrupted` / `ai:resume` 渠道（那套是针对 EditProposal 的
批量 diff 审批，payload 结构不匹配）。新增独立 IPC 渠道：`novel:confirm-request`（main→renderer）
和 `novel:confirm-response`（renderer→main）。

### 2.2 IPC 渠道定义

在 `electron/ai/ipc/protocol.ts` 新增：

```typescript
// ── Novel Harness HITL ────────────────────────────────────────────────────

export type NovelConfirmType =
  | 'chapter_boundary'   // 确认节点 1
  | 'scene_split'        // 确认节点 2
  | 'alias_merge'        // 确认节点 3
  | 'story_state_write'  // 确认节点 4

export interface NovelConfirmRequest {
  sessionId: string          // 由 orchestrator 生成，唯一标识本次确认
  type: NovelConfirmType
  payload:
    | ChapterBoundaryPayload
    | SceneSplitPayload
    | AliasMergePayload
    | StoryStateWritePayload
}

export interface NovelConfirmResponse {
  sessionId: string
  type: NovelConfirmType
  decision: 'confirm' | 'adjust' | 'cancel'
  /**
   * 仅 decision='adjust' 时有值。
   * 用户以自然语言描述调整意见（如"把第3章和第4章合并为一章"），
   * orchestrator 将其注入 prompt 后重新生成，不需要前端解析结构。
   */
  adjustmentText?: string
}
```

### 2.3 各确认节点的 Payload 类型

**ChapterBoundaryPayload（节点 1）**

```typescript
interface ChapterBoundaryPayload {
  chapters: Array<{
    id: string           // ch01、ch02 等
    title: string
    wordCount: number
    blockCount: number
    startBlockId: number
    endBlockId: number
  }>
}
```

UI 展示：章节列表（序号 / 标题 / 字数），"确认" / "调整（输入框）" / "取消" 三个按钮。

---

**SceneSplitPayload（节点 2）**

```typescript
interface SceneSplitPayload {
  chapterId: string
  chapterTitle: string
  scenes: Array<{
    seq: number
    summary: string       // 1句话，LLM 生成
    tone: string
    estimatedBlocks: number
  }>
}
```

UI 展示：当前章节下的场景列表，每项显示序号 + 摘要 + 基调，支持"确认全部" / "调整（输入框）" / "取消"。

---

**AliasMergePayload（节点 3）**

```typescript
interface AliasMergePayload {
  groups: Array<{
    suggestedId: string      // 推荐的 character_id（slug 形式）
    canonicalName: string    // 推荐的规范姓名
    aliases: string[]        // 本组所有别名/称呼
    confidence: number       // 归并置信度，< 0.6 时 UI 高亮标红
    exampleContext?: string  // 1句包含别名的原文（辅助用户判断）
  }>
}
```

UI 展示：归并分组列表，每组显示"X = Y = Z"样式 + 置信度 + 原文例句。
低置信度组标红提示"建议复核"。支持"确认全部" / "调整（输入框）" / "取消"。

---

**StoryStateWritePayload（节点 4）**

```typescript
interface StoryStateWritePayload {
  summary: {
    characterCount: number
    sceneCount: number
    timelineEventCount: number
    foreshadowingCount: number
    hasStyleProfile: boolean
    hasOutline: boolean
  }
  lowConfidenceCount: number    // confidence < 0.6 的条目总数
  targetDirectory: string       // 将写入的绝对路径（展示给用户确认位置）
}
```

UI 展示：写入摘要（"将写入 N 个人物卡、M 个场景卡……"）+ 目标路径 + 低置信度条目提示。
仅"确认写入" / "取消"两个按钮，不提供"调整"（此时调整需回到节点 2/3）。

### 2.4 ConfirmCard 最小 UI 形态

ConfirmCard 是一个新的 Vue 组件，渲染在 AI 面板的消息流中，样式与现有
`EditSessionCard` 风格一致：

```
┌─────────────────────────────────────────────────────┐
│ [图标] 确认章节切分                                    │
│                                                     │
│ 第1章 · 引子 ············ 1,200字 / 45块             │
│ 第2章 · 风起云涌 ········· 3,800字 / 112块           │
│ 第3章 · ···                                         │
│                                                     │
│ [有问题？说明调整意见 ___________________________]    │
│                              [取消]  [确认继续 →]    │
└─────────────────────────────────────────────────────┘
```

- 调整意见输入框：只在用户点击"有问题？说明"后展开（默认折叠）
- 提交后，卡片变为"已确认"或"已调整"灰色状态，不可再次点击
- 只有最新一张 ConfirmCard 可以交互；历史 ConfirmCard 锁定为只读

### 2.5 Orchestrator 等待确认的模式

orchestrator 不使用 LangGraph 的 `interruptOn`（那套是针对工具调用级别的打断）。
确认节点是流程级打断，由 TypeScript orchestrator 自己管理：

```typescript
// 伪代码
const response = await waitForConfirm(sessionId, {
  type: 'chapter_boundary',
  payload: { chapters: [...] }
})
// waitForConfirm 内部：
// 1. emit 'novel:confirm-request' to renderer
// 2. return new Promise that resolves when 'novel:confirm-response' arrives with matching sessionId
// 3. timeout 后 reject，允许用户稍后重试

if (response.decision === 'cancel') return abort()
if (response.decision === 'adjust') {
  // 重新用 adjustmentText 修正结果后，再次 waitForConfirm
}
```

`waitForConfirm` 封装在 `electron/ai/novel-harness/ipc/ConfirmGate.ts` 中（见第 3 节）。

---

## 3. novel-harness 代码目录与入口

### 3.1 目录结构

```
electron/ai/novel-harness/
├── NovelHarness.ts              # 入口类，IPC 注册点
├── ipc/
│   └── ConfirmGate.ts           # waitForConfirm() 封装，管理 sessionId → Promise 映射
├── schema/
│   ├── types.ts                 # StoryState / CharacterCard / SceneCard 等 TS 接口
│   └── validator.ts             # Zod schema，导出 validateCharacterCard() 等函数
├── ingest/
│   └── ChapterSegmenter.ts      # 章节切分，依赖 DocumentTools + DocumentViewBuilder
├── compress/
│   └── ChapterCompressor.ts     # 单章压缩主流程（调用 LLM + 四个确认节点）
├── store/
│   └── StoryStateStore.ts       # YAML frontmatter 读写，写入前调用 validator
├── expand/
│   └── ChapterExpander.ts       # ExpansionPlan 生成 + 段落生成 + validate before propose
└── validate/
    └── ConsistencyValidator.ts  # 人物行为 / 时间线 / 世界观软校验
```

`multimodal/` 和 `play/` 不在 Phase 3.2.1 范围，Phase 3.2.2/3.2.3 时在同级新增。

### 3.2 入口：`NovelHarness.ts`

```typescript
export class NovelHarness {
  private confirmGate: ConfirmGate
  private store: StoryStateStore
  private segmenter: ChapterSegmenter
  private compressor: ChapterCompressor
  private expander: ChapterExpander
  private validator: ConsistencyValidator

  constructor(deps: { webContents: Electron.WebContents; aiRootPath: string }) {
    // 构造各子模块，注入共享依赖
  }

  /** IPC handler: novel:start-compress */
  async startCompress(req: NovelCompressRequest): Promise<void> { ... }

  /** IPC handler: novel:confirm-response（renderer 响应确认节点） */
  handleConfirmResponse(resp: NovelConfirmResponse): void {
    this.confirmGate.resolve(resp)
  }

  /** IPC handler: novel:start-expand */
  async startExpand(req: NovelExpandRequest): Promise<void> { ... }
}
```

### 3.3 IPC 注册位置

在现有 IPC 注册文件（`electron/main.ts` 或专用 AI IPC 注册文件）中，与其他 `ai:*` 渠道并列：

```typescript
// 已有
ipcMain.handle('ai:send-message', ...)
ipcMain.handle('ai:resume', ...)

// 新增
ipcMain.handle('novel:start-compress', (_, req) => novelHarness.startCompress(req))
ipcMain.handle('novel:start-expand',   (_, req) => novelHarness.startExpand(req))
ipcMain.on('novel:confirm-response',   (_, resp) => novelHarness.handleConfirmResponse(resp))
```

`novel:confirm-request` 方向相反（main → renderer），通过 `webContents.send` 推送，
不用 ipcMain.handle。

### 3.4 与现有 AgentEngine 的关系

`NovelHarness` **不是** AgentEngine 的子类，也不走 LangGraph 的 `createDeepAgent`。

它是一个独立的 TypeScript orchestrator：
- 直接调用 OpenAI/Anthropic client（通过现有 `ModelFactory` 获取 chat model 实例）
- 手动管理多步骤状态（各步骤结果存在内存 + 写入 story assets，不用 LangGraph checkpoint）
- 只在"扩写段落 → HITL 审批落地"这一步借用 AgentEngine 现有的 `runThread` + `interruptOn` 机制

具体说：ChapterExpander 生成段落草稿后，把草稿包装成 `insert_block` / `edit_block` 工具调用，
通过现有 `AgentEngine.resumeRun()` 走正常 HITL 审批流。这样扩写结果的审批 UI 和普通 AI 编辑
完全一致，不需要新组件。

### 3.5 SKILL.md 的位置

compress 和 expand 的提取 prompt 仍以 SKILL.md 形式存放在 builtin-skills 目录，
NovelHarness 通过 `LocalShellBackend` 加载（与现有 creative domain 相同）：

```
electron/ai/builtin-skills/
├── character-forge/SKILL.md        # 已有
├── novel-brainstorm/SKILL.md       # 已有
├── compress-chapter/SKILL.md       # Phase 3.2.1 新增
└── expand-chapter/SKILL.md         # Phase 3.2.1 新增
```

SKILL.md 只负责单次 LLM prompt（提取格式约束、YAML 输出要求），
多步骤状态流转和确认节点由 TypeScript orchestrator 控制（不在 SKILL.md 里）。

---

## 4. 三点约定的依赖关系

```
schema/types.ts + schema/validator.ts
        ↓
store/StoryStateStore.ts     ingest/ChapterSegmenter.ts
        ↓                            ↓
compress/ChapterCompressor.ts ←──────┘
        ↓
expand/ChapterExpander.ts
        ↓
validate/ConsistencyValidator.ts
```

**开发顺序约束**：
- `schema/` 必须最先完成（T1），其余所有模块依赖它
- `store/` 和 `ingest/` 可以与 `validate/` 并行（T2/T3 并行 T5，与总计划一致）
- `compress/` 依赖 `store/` + `ingest/` 完成（T4 在 T2、T3 之后）
- `expand/` 依赖 `store/` + `validate/` 完成（T6 在 T2、T5 之后）

---

## 5. 什么还没定（后续再定）

以下内容有意留到实现阶段再决定，现在定没有信息优势：

- `ConfirmCard` 的具体 CSS / 动画（开始实现 T3.3 时再定）
- `waitForConfirm` 的超时时长（跑通 T4 后根据实测体验调整）
- `compress-chapter/SKILL.md` 和 `expand-chapter/SKILL.md` 的 prompt 内容（T4.1 / T6.1 实现时迭代）
- `ConsistencyValidator` 用哪个 Provider / 是否单独配置（T5 开始时决定）
