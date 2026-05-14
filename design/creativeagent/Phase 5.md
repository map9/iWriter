# Creative Agent Phase 5 实施方案
## 方向探索 / Git 集成 / 写作技法完善

> **前置**：Phase 4B（语言一致性 / Premise·Theme·Promise / 流式泄漏修复 / Open Questions 闭环 / 章节增删重排 / 单章 cycle 强制）已全部落地。Phase 5 覆盖原始路线图 §10 Phase 5：ExplorerAgent + git 集成 + StoryBible 策略完善，并补充遗留的写作技法 skills。语义搜索（embedding）推迟至 Phase 6，原因见 §1。

---

## 0. Context

Phase 1–4B 建立了完整的写作闭环：

| Phase | 关键能力 |
|---|---|
| 1 | 文件结构 / 写作工具 / plan-first HITL / session diff |
| 2 | 一致性检查 / FTS 搜索 / StoryBible 重建 |
| 3 | AdvisorAgent / 角色深度 pass / proposal system |
| 4A | PlannerAgent + ConsistencyAgent 独立 sub-agent / logicAudit / 常识检查 |
| 4B | 语言一致性 / Premise·Theme·Promise / 流式泄漏 / OQ 闭环 / 章节 CRUD / 单章 cycle |

**Phase 5 聚焦的问题**：

1. **没有版本控制**：作者写到关键节点无法快速打标，回溯靠手动。
2. **方向探索缺失**：作者在关键分叉点时无法"看到"两条路各自是什么样子——必须凭空想象，容易选错或陷入犹豫。
3. **WriterAgent 感知层薄弱**：感官接地、展示 vs 叙述、伏笔植入三类技法 skill 缺失，写出的正文在具象感和结构精度上有明显短板。
4. **ConsistencyAgent 缺失弧光追踪与风格一致检查**：多章节弧光停滞和风格漂移问题无法被系统性检出。
5. **StoryBible 无压缩机制**：随写作推进，StoryBible 超过 4000 token 阈值后没有自动缩减路径，上下文窗口被稀释。

---

## 1. 关键决策

> **HITL 术语说明**：代码层没有 L1/L2 抽象。判别依据是 `interruptOn` map 中是否登记 + `allowedDecisions` 数组（`['approve','edit','reject']` 三决策 vs `['approve','reject']` 两决策）。下文一律以 `allowedDecisions` 显式列出。

| # | 决策 | 选择 | 备注 |
|---|---|---|---|
| 1 | ExplorerAgent 探索存储 | 临时目录 `.iwriter/explorations/` 而非 git branch | git branch 探索需切换工作区状态，iWriter 文件树会随之更换，UX 复杂；临时文件方案独立于 git 状态，MVP 可用。Phase 6 可升级为 git branch。 |
| 2 | ExplorerAgent 执行方式 | MainAgent 可在同一 turn 中并发发出多个 `task(explorer)` tool_calls | deepagents 1.8.4 已支持并行 task：framework 的 state reducer 明确启用 concurrent subagent updates（`node_modules/deepagents/dist/index.js:651,676`）。并发不强制——LLM 视方向独立性决定。方向数 schema 硬约束 `min(2).max(3)`（防止决策疲劳）。 |
| 3 | Git 集成范围 | 只读（status/log/diff，无 HITL）+ 写操作（commit/tag，带 HITL）| 不做 branch 操作（留 Phase 6）；所有写操作必走 HITL，不静默执行任何 git 命令。 |
| 4 | Git 实现方式 | Node `child_process.execFile('git', ...)` + 显式 `timeout` | 项目已有 `child_process` 使用（App.ts, PandocService.ts）；避免引入 `simple-git` 等第三方依赖。Git 工具只在检测到 `.git/` 目录时启用。**注意**：`PandocService.run` 未设 timeout，直接照搬会造成 git 操作挂死；本阶段实现需显式 `timeout: 15000`（read 类）/ `30000`（write 类）。 |
| 5 | 探索 → 主线融合 | `promote_exploration`（`allowedDecisions: ['approve','edit','reject']`）| **promote 直接写入 `draft/{target_chapter}`，不再触发 plan-first cycle**——探索阶段 ExplorerAgent 已完成场景规划，相当于内置 plan。审批卡片显示 before（现有内容）/ after（探索内容）对比，作者可在 edit 时调整 after 内容。可选：作者后续手动发起 `task(consistency_checker)` 做一致性检查。 |
| 6 | StoryBible 压缩 | 新增 `compress_storybible_history`（`allowedDecisions: ['approve','reject']`，与现有 storybible 工具对齐）| 为已完成章节生成 100-150 字摘要追加到 `## Story State` 归档子节，**不删除任何现有内容**。摘要以 chapter filename 作 key upsert（同章节重复压缩幂等）。触发条件：`storybible_token_estimate > 3500`。 |
| 7 | 语义搜索（embedding）| **暂缓至 Phase 6** | 需要独立选型（OpenAI embeddings / 本地模型）和索引维护策略；对 < 5 万字小说收益有限；与本阶段工作性质差异大。 |
| 8 | Skills 补全范围 | 6 个新 skill：WriterAgent 3 个 + ConsistencyAgent 2 个 + ExplorerAgent 1 个 | 以 `sensory-grounding`、`show-vs-tell`、`foreshadowing-placement`、`foreshadowing-audit`、`arc-progression-check`、`branch-comparison` 为本阶段优先级 |
| 9 | 命名冲突消歧 | 保留 `ExplorerAgent`，在 i18n / system prompt 显式区分 | 与现有 `ExplorerPanel`（文件树侧栏）同名。i18n key 一律前缀 `creativeExplorer.*` 与 `fileExplorer.*`；ExplorerAgent system prompt 顶部声明 "narrative-direction explorer, not the file-tree panel"；`branch-comparison` skill 在描述中强调 *narrative branches, not VCS branches*。 |

---

## 2. ExplorerAgent 工作流程

```
作者："我想看看两种结局走向"
  ↓
MainAgent：
  1. 与作者确认探索参数：分叉点（从哪里开始）、方向列表（2-3 个，各一句话描述）
  2. 调用 start_exploration(context, directions[])  ← L2 HITL（作者审批探索计划）
  3. 用户审批后，对每个方向顺序调用 task(explorer)：
     ↓ ExplorerAgent（独立上下文，每次调用携带单一方向描述）：
        - read_storybible()              ← 获取全局约束
        - read_chapter(context_chapter)  ← 读取分叉点上下文
        - 载入 scene-structure / character-arc-planning / branch-comparison skills
        - 规划该方向的场景走向（侧重叙事可能性，而非 PlannerAgent 的因果严格性）
        - 调用 write_exploration_draft(direction_name, content)
          → 写入 .iwriter/explorations/{direction_name}.md
        - 返回 { direction, summary, narrative_consequences, sample_prose }
     ↑
  4. 所有方向完成后，MainAgent 汇总各方向返回值，生成对比报告：
     - 每个方向的核心特征（1-2 段）
     - 对后续故事线的影响分析
     - 不评判"哪个更好"，只描述差异
  5. 调用 finish_exploration()  ← L2 HITL（展示探索对比卡片，作者浏览）
  
作者选定方向后（或作者想放弃探索）：
  6A. 作者选定某方向：
      调用 promote_exploration(direction_name, target_chapter, mode)
        ← allowedDecisions: ['approve','edit','reject']
      → 审批卡片显示 before（现有内容）/ after（探索内容）对比
      → 作者可在 edit 决策中调整 after 内容
      → 批准后直接写入 draft/{target_chapter}（mode: append / replace）
      → 不再触发 plan-first cycle；后续可选 task(consistency_checker)
  6B. 作者放弃全部探索：
      调用 delete_exploration(direction_name) × N
      → 软删除：rename 到 .iwriter/explorations/.trash/{name}-{ts}.md
      → 保留 N 天后由清理任务回收（Phase 6 实现，本阶段仅保留 trash 目录）
      → allowedDecisions: ['approve','reject']（不允许无审批批量删除）
```

---

## 3. ExplorerAgent Sub-agent 定义

> **命名消歧**：`ExplorerAgent` 指 *narrative-direction explorer*，与文件树侧栏 `ExplorerPanel` 同形不同义。System prompt 顶部必须声明这一区分，i18n key 一律前缀 `creativeExplorer.*`。

### 3.0 ExplorerAgent vs PlannerAgent 职能边界

二者都"规划场景走向 + 输出结构化结果 + 引用 skills"，差异在严格度与下游路径：

| | PlannerAgent | ExplorerAgent |
|---|---|---|
| 输出对象 | 严格 plan + logicAudit + alternatives | summary + narrative_consequences(2-4) + 300-500 字 sample prose + craft_notes |
| 因果严格度 | 必须通过 causal-chain-construction / character-decision-logic / common-sense-audit | 仅要求 storybible 约束 + 角色声音；**不做因果审计** |
| 触发场景 | 单条主线推进 | 作者面对分叉点，需要"试着看一眼" |
| 与作者交互 | 必经 `confirm_writing_plan` 审批后才写章 | `finish_exploration` 报告 → 作者选定后 `promote_exploration` 直接落盘 |
| 草稿落盘位置 | 直接进 `draft/chXX.md` | 进 `.iwriter/explorations/{name}.md`（中间态），promote 后才进 `draft/` |

### 3.1 SubAgent 定义代码

```ts
// electron/ai/domain/creative/subAgents/explorer.ts
import { z } from 'zod'
import type { SubAgent } from 'deepagents'
import type { StructuredTool } from '@langchain/core/tools'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

export const ExplorerResponseSchema = z.object({
  direction: z.string().describe('Direction name as given in the brief'),
  summary: z.string().describe('2-3 sentence narrative summary of this direction'),
  narrative_consequences: z.array(z.string()).min(2).max(4)
    .describe('What downstream story implications this direction creates or forecloses'),
  craft_notes: z.string().optional()
    .describe('Brief craft observation: tone, pacing, thematic resonance'),
})

export type ExplorerResponse = z.infer<typeof ExplorerResponseSchema>

export function buildExplorerSubAgent(
  explorerTools: StructuredTool[],
  language: DetectedInputLanguage = 'en-US'
): SubAgent {
  return {
    name: 'explorer',
    description: 'Generates a single narrative direction exploration. Reads story context, sketches the scene, writes a short exploratory draft, and reports narrative consequences. Does NOT plan exhaustively or check logic — the goal is to produce a vivid, credible draft so the author can see what this direction actually feels like.',
    systemPrompt: buildOutputLanguagePrompt(language) + EXPLORER_SYSTEM_PROMPT,
    tools: explorerTools,
    skills: ['/skills/'],
    responseFormat: ExplorerResponseSchema,
  }
}
```

**EXPLORER_SYSTEM_PROMPT 核心内容**：

```
You are ExplorerAgent. The term "explorer" here refers to narrative-direction exploration only — it is NOT the file-tree Explorer panel and NOT a VCS branch tool.

Your function is to draft one specific narrative direction so the author can see what it feels like.

You do NOT plan exhaustively. You do NOT check logic or consistency. You explore.

Workflow:
1. Call read_storybible. Note established constraints, character states, tone.
2. Call read_chapter for the divergence context.
3. Load: scene-structure, character-arc-planning, branch-comparison skills.
4. Draft the exploration:
   - Sketch what happens in this direction (plot beats, key moments).
   - Write 300-500 words of sample prose at the most pivotal moment.
   - Be vivid and committed to the direction — do not hedge with "perhaps" or "maybe".
5. Call write_exploration_draft(direction_name, full_content).
6. Return: summary, narrative_consequences (what this direction opens or closes), craft_notes.

Stay true to the author's established character voices and world rules.
Do not comment on whether this direction is "better" than others.
```

---

## 4. Git 集成工具设计

### 4.1 工具列表

| 工具 | allowedDecisions | 功能 |
|---|---|---|
| `git_status()` | —（无 HITL，只读）| 返回工作区 git 状态：staged / unstaged / untracked 文件列表 |
| `git_log(limit?)` | —（无 HITL，只读）| 最近 N 条（默认 10）提交记录，含 short hash / message / date |
| `git_diff(from?, to?)` | —（无 HITL，只读）| 变更内容：默认 unstaged diff；可指定 commit 或 ref 范围 |
| `git_commit(message, files?)` | `['approve','edit','reject']` | Stage `files`（默认 `['storybible.md', 'draft/']`）并提交；message 由 agent 起草，作者可在 edit 决策中调整 message 与 files 列表 |
| `git_tag(name, message?)` | `['approve','reject']` | 为当前 HEAD 打 annotated tag；打完后 rebuild signal 中 `last_git_tag` 由 `git describe` 实时返回（**不写 CreativeDb**） |

### 4.2 实现要点

- 文件：`electron/ai/tools/CreativeGitTools.ts`
- 使用 Node `child_process.execFile` 调用 `git` 二进制（参照 `electron/PandocService.ts:180-194` 的 Promise wrapper 形态）
- **timeout 必须显式设置**：`PandocService.run` 未传 timeout，复制时易遗漏。读类工具 `timeout: 15000`，写类工具 `timeout: 30000`。超时返回明确 `GIT_TIMEOUT` errorCode，不抛 raw error
- **maxBuffer**：与 PandocService 一致使用 20 MB（git log/diff 在大仓库可能输出较大）
- **前置检查（每个工具入口）**：
  1. `{workspacePath}/.git` 是否存在 → 不存在返回 `"Not a git repository — git tools require the workspace to be initialized with git init."`
  2. `git --version` 可用性（首次调用时缓存结果）→ 失败返回 `"git binary not found on PATH"`
- **`git_commit` 额外前置**：检查 `git config user.name` 与 `git config user.email`，任一缺失返回 `"Git is not configured with an author identity. Run \`git config user.name\` and \`git config user.email\` first."`（不报 raw stderr，避免泄漏路径与 hint）
- **路径安全**：`files` 参数所有路径均按相对 workspace 解析，禁止绝对路径和 `../` 逃逸；走 §7.2 抽出的 `resolveWorkspaceSubpath` helper
- **errorCode 分类**：`NOT_A_REPO` / `GIT_NOT_INSTALLED` / `AUTHOR_NOT_CONFIGURED` / `INDEX_LOCKED`（检测到 `.git/index.lock`）/ `GIT_TIMEOUT` / `COMMAND_FAILED`
- **`git_commit` 流程**：agent 调用前先调 `git_status` 确认有变更；commit message 由 agent 起草，作者在 edit 决策中可调整 message 与 files 列表（见 §4.1 的 `allowedDecisions`）
- **`git_tag` 完成后**：rebuild signal 中 `last_git_tag` 由 `git describe --tags --abbrev=0` 实时读取，**不需要写 CreativeDb**

### 4.3 Rebuild Signal 增强

`get_storybible_rebuild_signal` 返回对象新增字段：

```ts
{
  // 现有字段...
  last_git_tag: { name: string; commit: string; message: string } | null,
  commits_since_last_tag: number | null,   // null if no .git or no tag yet
  storybible_token_estimate: number,        // uses estimateTextTokens() from src/ai/token-estimation.ts
  recommended_action: string | null,        // 见 §6.2，超阈时由本工具填写
}
```

- `last_git_tag`：调 `git describe --tags --abbrev=0` 拿 tag name，再调 `git rev-list <tag>..HEAD --count` 拿 commits 差；无 `.git` 或无 tag 时 `last_git_tag = null`、`commits_since_last_tag = null`（避免 -1 sentinel 与 last_git_tag 的 null 不一致）
- `storybible_token_estimate`：读取 `storybible.md` 后调用 `estimateTextTokens(content)`（`src/ai/token-estimation.ts:1`，已存在）

### 4.4 System Prompt 新增规则（git 部分）

```
## Git checkpoints

git is available when the workspace has a .git directory (visible from git_status).

Natural checkpoint moments:
- After a chapter draft is approved and written (offer git_commit).
- After StoryBible rebuild or major restructure (offer git_commit).
- After a narrative milestone (e.g. end of an arc, story midpoint) — offer git_tag.

Never commit or tag without explicit author approval.
Do not run git_commit if git_status shows no tracked changes.

Commit message:
- Follow the same language as the author's last user turn (matches DetectedInputLanguage). Do not switch language inside a single message.
- Format: "<action>: <brief description>" e.g. "write: ch03 A 与 B 对峙场景".

First-time .git detection:
- If `.gitignore` does not contain `.iwriter/`, propose adding it (single-line patch, HITL approve/reject). Reason: `.iwriter/creative.db` is a binary database and `.iwriter/explorations/` holds throwaway drafts — neither belongs in version control by default.
```

---

## 5. 写作技法 Skills 补全

以下 6 个 SKILL.md 文件是 Phase 5 新建内容。
**所有 skill 必须使用现有 22 个 skill 的 frontmatter 格式**：`name` + `description`（描述"何时加载"而非"是什么"），否则 `/skills/` 目录扫描会失败。

### 5.1 WriterAgent Skills

**`sensory-grounding`（感官接地）**

```markdown
---
name: sensory-grounding
description: Load when WriterAgent is drafting or revising a scene with emotional weight or environment establishment, especially key emotional moments, first-time location reveals, or sensory-heavy passages. Skip for transitional summary, pure dialogue without staging, or rapid time-jump exposition.
---
```

WriterAgent 核心痛点：场景以情绪和想法为主，缺乏具象锚点，读者难以"在场"。

内容要点：
- 每个重要场景至少提供一个视觉细节 + 一个非视觉感官细节（声音、触感、气味、味道）
- 感官细节要与当前情境产生关联，不是装饰（角色情绪状态影响感知方式）
- 避免类别：纯情绪叙述（"他感到痛苦"）、抽象环境（"空间里弥漫着紧张气氛"）
- 实践路径：在关键场景前问"此刻角色能看到什么 / 听到什么 / 触碰到什么？"

**When NOT to load**：纯过渡叙述、跨日跨月时间跳跃段、信息交代段。不要把每段都套用感官清单，会拖慢节奏。

**`show-vs-tell`（展示与叙述）**

```markdown
---
name: show-vs-tell
description: Load when WriterAgent is drafting a high-emotional-tension scene or when reviewing a draft suspected of stating feelings directly. Use to convert "tell" conclusions to "show" through behavior, dialogue, body language. Skip for intentional summary, background exposition, or rapid pacing transitions.
---
```

痛点：关键情感时刻只叙述结论，缺乏感染力；或过度展示导致节奏缓慢。

内容要点：
- 展示（show）：用行为、对话、身体反应、感知细节传递情感——读者自己推断
- 叙述（tell）：直接陈述情感状态或背景信息——适合过渡、交代、节奏控制
- 判断原则：
  - 高情感张力时刻 → 展示（让读者体验）
  - 背景交代、时间跳跃、节奏过渡 → 叙述（快速通过）
  - 常见误用："他愤怒地冲了出去"（叙述结论）→ "他推开椅子，不看她，径直走向门口"（展示）

**When NOT to load**：刻意的快节奏过渡段、必须用简洁叙述压缩的时间跨度段。

**`foreshadowing-placement`（伏笔植入与回收）**

```markdown
---
name: foreshadowing-placement
description: Load when WriterAgent finishes a chapter draft or is planning a chapter that should set up later payoffs. Use to embed plant-able details (objects, gestures, line drops) for ch+2 or later, and to verify earlier plants get acknowledged. Skip for the very first chapter (no prior plants exist) and for pure dialogue scenes with no narrative scaffolding.
---
```

痛点：章节结束后没有伏笔植入意识；已植入的伏笔在后续被遗忘。

内容要点：
- **植入时机**：在角色行为、对话、环境描写中自然嵌入，不以评论句（"这将会……"）揭示意义
- **回收原则**：每个植入的伏笔需要在后续章节被明确回应（不一定"兑现"，也可以是角色有意识地反向行动）
- **章节尾检查**：每章写完后问"是否有机会在此植入一个可在 ch+2 或更后回收的细节？"
- **植入前检查**：StoryBible `## Open Questions` 中是否有可通过本章内容间接预示的问题

**When NOT to load**：首章（无既有伏笔可回收）、过场对话章节、明确的高潮回收章（此时应聚焦兑现而非新植入）。

### 5.2 ConsistencyAgent Skills

**`foreshadowing-audit`（伏笔审计）**

```markdown
---
name: foreshadowing-audit
description: Load during ConsistencyAgent post-write review to verify that plants from earlier chapters have appropriate echoes or deliberate non-acknowledgment in the current chapter, and that characters have not gained information that was supposed to remain hidden.
---
```

痛点：随章节推进，早期植入的伏笔在后期被遗忘，形成叙事债务。

内容要点：
- 从 StoryBible `## Story State` 和正文中识别已植入的伏笔标记
- 对当前章节检查：
  - 是否有伏笔本应在此回收但未回收？
  - 是否有角色在此提前知晓了仍处于伏笔状态的信息？
  - 是否无意中揭示了作者想保留的悬念？
- 报告格式：`layer: continuity`，`locationRef` 指向可疑段落

**`arc-progression-check`（弧光推进检查）**

```markdown
---
name: arc-progression-check
description: Load during ConsistencyAgent post-write review when checking whether the current chapter advances each protagonist's arc relative to the previous chapter. Flags stagnation (2+ chapters without substantive arc movement) and unbacked leaps (sudden psychological shifts without setup).
---
```

痛点：角色在多个章节内停留在同一心理状态，读者感受到弧光停滞；或突变缺乏铺垫。

内容要点：
- 从 StoryBible 中提取每个主角的弧光初始状态和目标状态
- 对比当前章节与前一章，判断：
  - 弧光是否有实质推进（角色的虚假信念是否受到了挑战？是否有内在冲突激活？）
  - 弧光停滞：连续 2+ 章无实质推进 → `severity: minor`
  - 弧光飞跃：心理状态突变但缺乏铺垫 → `severity: major`
- 推进不等于变化量大：一个微小但真实的动摇比一次不可信的彻底转变更有价值

### 5.3 ExplorerAgent Skill

**`branch-comparison`（方向对比分析）**

```markdown
---
name: branch-comparison
description: Load when the MainAgent is assembling a comparison report across multiple narrative-direction explorations (results from parallel/sequential task(explorer) calls). Use to compare directions along narrative, character, cost, and reader-promise dimensions. "Branches" here means narrative branches — this is NOT a git branch tool.
---
```

ExplorerAgent 完成所有方向草稿后辅助 MainAgent 生成对比报告。

内容要点：
- 对比维度：叙事特征（基调/节奏/情感走向）、角色影响（谁获益谁受损）、后续成本（哪些设定需新建、哪些设定被废弃）、读者承诺（对读者体验的影响）
- 对比原则：
  - 不以"更好"定义差异，以"不同"定义差异
  - 每个方向都应被诚实呈现，而不是将其中一个作为显然的正确选择
  - 若某个方向有结构性风险（如破坏已建立的核心主题），可在 craft_notes 中注明，但不做判断

---

## 6. StoryBible 压缩策略

### 6.1 新工具 `compress_storybible_history`

```ts
schema: z.object({
  completed_chapters: z.array(z.string())
    .describe('Chapter filenames whose content can be summarized (e.g. ["ch01.md", "ch02.md"])'),
})
```

- **HITL**：L2 approve/reject
- **功能**：
  1. 读取 `completed_chapters` 列表中各章完整内容
  2. 为每章生成 100-150 字的事件摘要（关键事件 + 角色状态变化 + 已回收伏笔）
  3. 在 StoryBible `## Story State` 段追加子节 `### Archived Chapters`（首次创建）或更新已有归档节
  4. 不删除、不替换任何 StoryBible 现有内容，只追加归档摘要
- **审批卡片**：显示将追加的内容 + 涉及的章节列表 + 预期节省的 token 数

### 6.2 触发时机

- `get_storybible_rebuild_signal` 返回 `storybible_token_estimate > 3500` 时：
  - **强提示**：rebuild signal 返回值中追加 `recommended_action: "StoryBible has reached {N} tokens. Suggest archiving completed chapters via compress_storybible_history."`。LLM 看到 tool 输出中的明文比仅在 system prompt 中读到规则更易行动。
  - **system prompt 规则**：要求 agent 在 startup 响应中向作者提议压缩
- `git_tag` 打里程碑后，agent 可顺带建议将该 tag 之前的章节归档
- 作者明确反馈"StoryBible 太长了"

### 6.3 幂等性

`### Archived Chapters` 子节内的条目以 chapter filename 作 key 做 **upsert**：

- 首次压缩某章节：追加新摘要条目
- 同章节再次调用 `compress_storybible_history`：替换该条目（不重复追加）
- 同时不删除/不修改其他章节的现有摘要、不改动 StoryBible 其他段

### 6.4 System Prompt 新增规则（compression 部分）

```
## StoryBible size management

If get_storybible_rebuild_signal reports storybible_token_estimate > 3500:
- In your startup response, note that StoryBible is growing large.
- Offer compress_storybible_history for chapters the author considers complete.
- Do not compress a chapter the author is still actively revising.
- Never delete or overwrite existing StoryBible sections — only append to Archived Chapters.
```

---

## 7. 文件清单

### 7.1 新建文件

**工具与 sub-agent（3）**：

| 路径 | 用途 |
|---|---|
| `electron/ai/tools/CreativeGitTools.ts` | git_status / git_log / git_diff / git_commit / git_tag 工具实现 |
| `electron/ai/tools/CreativeExplorationTools.ts` | start_exploration / write_exploration_draft / finish_exploration / promote_exploration / list_explorations / read_exploration / delete_exploration 工具 |
| `electron/ai/domain/creative/subAgents/explorer.ts` | ExplorerAgent sub-agent 定义 + ExplorerResponseSchema |

**Skills（6）**：

| 路径 | 用途 |
|---|---|
| `electron/ai/builtin-skills/sensory-grounding/SKILL.md` | 感官接地 skill |
| `electron/ai/builtin-skills/show-vs-tell/SKILL.md` | 展示与叙述 skill |
| `electron/ai/builtin-skills/foreshadowing-placement/SKILL.md` | 伏笔植入与回收 skill |
| `electron/ai/builtin-skills/foreshadowing-audit/SKILL.md` | 伏笔审计 skill（ConsistencyAgent 使用）|
| `electron/ai/builtin-skills/arc-progression-check/SKILL.md` | 弧光推进检查 skill（ConsistencyAgent 使用）|
| `electron/ai/builtin-skills/branch-comparison/SKILL.md` | 叙事方向对比分析 skill（ExplorerAgent + MainAgent 使用，与 git branch 无关）|

**Review 卡片组件（4）**：

`CreativeReviewSurface.vue` 已经超过 1000 行，继续塞入新 kind 分支会失控。新增 kind 抽成独立组件，`CreativeReviewSurface.vue` 仅做 `kind` 分发。

| 路径 | 用途 |
|---|---|
| `src/components/ai/agent-panel/domains/creative/cards/GitCommitCard.vue` | git_commit 审批卡：message textarea + files 列表 + git diff 摘要 |
| `src/components/ai/agent-panel/domains/creative/cards/GitTagCard.vue` | git_tag 审批卡：tag name + 注释 message |
| `src/components/ai/agent-panel/domains/creative/cards/ExplorationCompareCard.vue` | `finish_exploration`：并排显示各方向 summary + narrative_consequences |
| `src/components/ai/agent-panel/domains/creative/cards/ExplorationMergeCard.vue` | `promote_exploration`：before（现有 draft）/ after（探索内容）对比 + after textarea（edit 决策）|
| `src/components/ai/agent-panel/domains/creative/cards/CompressPreviewCard.vue` | `compress_storybible_history`：将追加的归档摘要预览 + 涉及章节列表 |

> 注：建议同时把现有 4 个 kind（creative_plan/write/storybible/chapter_structure）也抽到同目录 `cards/` 下，作为本阶段顺手重构（PR 3 一起做）。如不想动现有结构，则仅新增上述 5 个组件文件即可。

### 7.2 修改文件

**Electron 主进程（5）**：

| 路径 | 主要变更 |
|---|---|
| `electron/ai/tools/CreativeTools.ts` | 新增 `compress_storybible_history` 工具；抽出 `resolveWorkspaceSubpath(workspacePath, subdir, filename, options)` 通用 helper，`resolveDraftMarkdownPath` 改为薄包装；exploration tools 引用同 helper 创建 `resolveExplorationPath` |
| `electron/ai/tools/CreativeAnalysisTools.ts` | rebuild signal 增加 `last_git_tag`、`commits_since_last_tag`、`storybible_token_estimate`、`recommended_action` 字段 |
| `electron/ai/domain/creative/buildCreativeCapabilities.ts` | 加入 git tools + exploration tools；注册 ExplorerAgent sub-agent；`interruptOn` 加新 HITL 工具（按 §4.1 / §1 决策 5 / §1 决策 6 的 allowedDecisions） |
| `electron/ai/domain/creative/subAgents/consistency.ts` | system prompt 新增 `foreshadowing-audit` / `arc-progression-check` skills 显式列入 "Load skills" 步骤 |
| `electron/ai/ipc/CreativeReviewAdapter.ts` | 新 review kinds 的 actionRequest → ReviewItem 映射（git_commit/git_tag/exploration_compare/exploration_merge/compress）|

**Renderer 前端（4）**：

| 路径 | 主要变更 |
|---|---|
| `src/ai/types.ts` | 1) 新增 `CreativeGitCommitReviewItem`（含 message/files）、`CreativeGitTagReviewItem`、`CreativeExplorationCompareReviewItem`、`CreativeExplorationMergeReviewItem`、`CreativeCompressReviewItem`，并加入 `CreativeReviewItem` 联合。2) **关键**：把所有新 HITL 工具名加入 `CREATIVE_REVIEW_TOOLS` 集合（line 609），否则 AgentEngine 不会把中断分流到 creativeReviews 分支 |
| `src/ai/store/modules/creativeReview.ts` | 为新 kind 在 `argsForReview` 中编写 edited 路径下 args 拼装（git_commit message/files、promote_exploration content/mode 等）|
| `src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue` | `kind` 分发新分支，调用 §7.1 新建的 card 组件；不再塞入实际表单逻辑 |
| `src/ai/thread/system-prompts/creative.ts` | 新增 git checkpoint 规则 + exploration workflow 规则 + StoryBible compression 规则；ExplorerAgent 引用消歧句（与 ExplorerPanel 区别）|

**i18n（1，但 2 个文件并行修改）**：

| 路径 | 主要变更 |
|---|---|
| `src/i18n/messages/{zh-CN,en-US}.ts` | git 工具名 + exploration 工具名（key 前缀 `creativeExplorer.*` 区分 `fileExplorer.*`）+ compress 工具名 + 新 review kind 文案。预估 30+ 字符串 × 2 locale |

**注意**：Phase 4B 落地的 `buildPlannerSubAgent(plannerTools, language)` 已传 language；本阶段无需再改 planner.ts。

---

## 8. PR 拆分

> **拆分原则**：低风险、纯资源类的 skill 改动前置，让 WriterAgent 与 ConsistencyAgent 立即受益；ExplorerAgent 的工具与 UI 在同一 PR 一并落地，避免出现"工具已 merged、UI 还在 fallback textarea"的中间态。

### PR 1 — 写作技法 Skills 补全（小 PR，先行）

新建 6 个 SKILL.md（每个含 frontmatter，见 §5）：

- `electron/ai/builtin-skills/sensory-grounding/SKILL.md`
- `electron/ai/builtin-skills/show-vs-tell/SKILL.md`
- `electron/ai/builtin-skills/foreshadowing-placement/SKILL.md`
- `electron/ai/builtin-skills/foreshadowing-audit/SKILL.md`
- `electron/ai/builtin-skills/arc-progression-check/SKILL.md`
- `electron/ai/builtin-skills/branch-comparison/SKILL.md`

修改：
- `electron/ai/domain/creative/subAgents/consistency.ts`：`CONSISTENCY_SYSTEM_PROMPT` 的 "Load skills" 步骤显式加入 `foreshadowing-audit` 和 `arc-progression-check`
- `src/ai/thread/system-prompts/creative.ts`：WriterAgent 写作步骤引用 `sensory-grounding` / `show-vs-tell` / `foreshadowing-placement`

完成后：WriterAgent 写作时有感知层参考；ConsistencyAgent 能系统检出伏笔遗失和弧光停滞；后续 PR 3 ExplorerAgent 直接复用 `branch-comparison` skill。零工具/类型改动，零运行时风险。

---

### PR 2 — Git 工具 + Rebuild Signal 增强

文件改动：
- 新建：`electron/ai/tools/CreativeGitTools.ts`（含 §4.2 全部前置检查、timeout、errorCode 分类）
- 修改：`electron/ai/tools/CreativeAnalysisTools.ts`（rebuild signal 新字段：`last_git_tag` / `commits_since_last_tag` / `storybible_token_estimate` / `recommended_action`）
- 修改：`electron/ai/domain/creative/buildCreativeCapabilities.ts`（加 git tools；`git_commit: ['approve','edit','reject']` / `git_tag: ['approve','reject']` 加入 `interruptOn`）
- 修改：`src/ai/types.ts`（`CreativeGitCommitReviewItem` / `CreativeGitTagReviewItem`；加入 `CREATIVE_REVIEW_TOOLS` 集合）
- 修改：`src/ai/store/modules/creativeReview.ts`（git_commit edit 路径的 argsForReview）
- 修改：`electron/ai/ipc/CreativeReviewAdapter.ts`
- 新建：`src/components/ai/agent-panel/domains/creative/cards/GitCommitCard.vue`、`GitTagCard.vue`
- 修改：`src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue`（kind 分发新分支）
- 修改：`src/ai/thread/system-prompts/creative.ts`（§4.4 git checkpoint 规则，含 commit message 语言对齐与 `.gitignore` 建议）
- 修改：i18n

完成后：agent 可在 git 工作区中感知版本状态、提议提交（含可编辑 message）和打标，作者可审批/编辑/拒绝。

---

### PR 3 — ExplorerAgent + 探索工具 + 探索 Review UI（核心 PR，合并原 PR 2+3）

**3a. 探索工具实现**

| 工具 | allowedDecisions | 功能 |
|---|---|---|
| `list_explorations()` | —（无 HITL）| 列出 `.iwriter/explorations/` 中现有探索草稿（文件名 + 首行摘要）|
| `start_exploration(context, directions[])` | `['approve','reject']` | 审批探索计划。schema 硬约束 `directions: z.array(...).min(2).max(3)` |
| `write_exploration_draft(direction_name, content)` | —（仅 ExplorerAgent 调用，无 HITL）| 写入 `.iwriter/explorations/{direction_name}.md`；走 `resolveWorkspaceSubpath` 校验 |
| `read_exploration(direction_name)` | —（无 HITL）| 读取指定探索草稿内容 |
| `finish_exploration(comparison_report)` | `['approve','reject']` | 提交对比报告供作者浏览（不修改任何 draft/ 文件）|
| `promote_exploration(direction_name, target_chapter, mode)` | `['approve','edit','reject']` | 直接写入 `draft/{target_chapter}`；mode: `append` / `replace`；不再触发 plan-first cycle |
| `delete_exploration(direction_name)` | `['approve','reject']` | 软删除：rename 到 `.iwriter/explorations/.trash/{name}-{ts}.md`，保留 N 天 |

**3b. ExplorerAgent sub-agent + UI 卡片一起落地**

文件改动：
- 新建：`electron/ai/tools/CreativeExplorationTools.ts`
- 新建：`electron/ai/domain/creative/subAgents/explorer.ts`（见 §3 完整定义）
- 新建：`src/components/ai/agent-panel/domains/creative/cards/ExplorationCompareCard.vue`
- 新建：`src/components/ai/agent-panel/domains/creative/cards/ExplorationMergeCard.vue`
- 修改：`electron/ai/tools/CreativeTools.ts`（抽出 `resolveWorkspaceSubpath` 通用 helper）
- 修改：`electron/ai/domain/creative/buildCreativeCapabilities.ts`（加探索 tools；ExplorerAgent sub-agent 注入；按 3a 表加入 `interruptOn`）
- 修改：`src/ai/types.ts`（`CreativeExplorationCompareReviewItem` / `CreativeExplorationMergeReviewItem`；加入 `CREATIVE_REVIEW_TOOLS` 集合）
- 修改：`src/ai/store/modules/creativeReview.ts`（promote_exploration edit 路径的 argsForReview）
- 修改：`electron/ai/ipc/CreativeReviewAdapter.ts`
- 修改：`src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue`（kind 分发新分支）
- 修改：`src/ai/thread/system-prompts/creative.ts`（exploration workflow 规则：触发时机 / max 3 方向 / promote 流程 / ExplorerAgent 与 ExplorerPanel 命名消歧）
- 修改：i18n（`creativeExplorer.*` 前缀 vs `fileExplorer.*`）

完成后：MainAgent 可在收到探索请求时（可并发地）调用 ExplorerAgent，生成多方向草稿，对比报告通过 ExplorationCompareCard 展示；作者选定后通过 ExplorationMergeCard 审批/编辑/批准融合。

---

### PR 4 — StoryBible 压缩

文件改动：
- 修改：`electron/ai/tools/CreativeTools.ts`（新增 `compress_storybible_history` 工具，含 §6.3 幂等性 upsert 逻辑）
- 修改：`electron/ai/tools/CreativeAnalysisTools.ts`（rebuild signal 填写 `recommended_action` 文本，超阈时返回明确建议）
- 修改：`electron/ai/domain/creative/buildCreativeCapabilities.ts`（`compress_storybible_history: ['approve','reject']` 加入 `interruptOn`）
- 修改：`src/ai/types.ts`（`CreativeCompressReviewItem`；加入 `CREATIVE_REVIEW_TOOLS` 集合）
- 修改：`electron/ai/ipc/CreativeReviewAdapter.ts`
- 新建：`src/components/ai/agent-panel/domains/creative/cards/CompressPreviewCard.vue`
- 修改：`src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue`（kind 分发新分支）
- 修改：`src/ai/thread/system-prompts/creative.ts`（§6.4 compression 触发规则）
- 修改：i18n

完成后：StoryBible 超过 3500 token 时 agent 主动建议压缩（rebuild signal 中 `recommended_action` 强提示 + system prompt 规则双保险），压缩后归档摘要追加到 StoryBible `### Archived Chapters`，同章节再次压缩走 upsert，不丢失任何既有内容。

---

## 9. 核心文件索引

- `electron/ai/tools/CreativeGitTools.ts` — git 工具实现（含 timeout / errorCode / author preflight）
- `electron/ai/tools/CreativeExplorationTools.ts` — 探索工具实现
- `electron/ai/domain/creative/subAgents/explorer.ts` — ExplorerAgent 定义
- `electron/ai/tools/CreativeAnalysisTools.ts` — rebuild signal 增强（last_git_tag / commits_since_last_tag / storybible_token_estimate / recommended_action）
- `electron/ai/tools/CreativeTools.ts` — compress_storybible_history + resolveWorkspaceSubpath 通用 helper
- `electron/ai/domain/creative/buildCreativeCapabilities.ts` — 工具集整合（git + exploration + ExplorerAgent 注入 + interruptOn 新条目）
- `src/ai/types.ts` — 新增 5 个 ReviewItem 类型（GitCommit/GitTag/ExplorationCompare/ExplorationMerge/Compress），全部加入 `CREATIVE_REVIEW_TOOLS` 集合（line 609）
- `src/ai/store/modules/creativeReview.ts` — 新 kind 的 argsForReview edit 路径
- `electron/ai/ipc/CreativeReviewAdapter.ts` — 新 review kind 映射
- `src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue` — kind 分发；实际表单逻辑下沉到 cards/ 子目录
- `src/components/ai/agent-panel/domains/creative/cards/{GitCommit,GitTag,ExplorationCompare,ExplorationMerge,CompressPreview}Card.vue` — 5 个独立卡片组件
- `src/ai/thread/system-prompts/creative.ts` — git + exploration + compression 规则；ExplorerAgent 与 ExplorerPanel 命名消歧句
- `electron/ai/builtin-skills/{sensory-grounding,show-vs-tell,foreshadowing-placement,foreshadowing-audit,arc-progression-check,branch-comparison}/SKILL.md`（含 frontmatter）
- `src/i18n/messages/{zh-CN,en-US}.ts` — 新文案（`creativeExplorer.*` 前缀区分文件树 `fileExplorer.*`）

---

## 10. 验证矩阵

每个 PR 后必跑：

```bash
npm run lint
npm run type-check
```

| PR | 端到端测试 |
|---|---|
| 1 skills | 让 agent 写一个感情激烈的场景：正文中出现非视觉感官细节（smell / sound / touch，via sensory-grounding）；ConsistencyAgent 在角色前后章节无弧光推进时报告 `severity: minor` + `layer: character`（via arc-progression-check）；有未回收伏笔时报告 `layer: continuity`（via foreshadowing-audit）|
| 2 git | 在有 `.git` + 完整 user.name/user.email 的 workspace：`git_status` 正确返回 staged/unstaged 文件；写一章后 agent 提议 `git_commit`，作者通过 edit 决策修改 message 后批准，文件被实际 commit（`git log` 可见，message 为修改后版本）；`git_tag` 打标后 rebuild signal 中 `last_git_tag` 正确更新。**异常路径**：无 `.git` 的 workspace 下所有 git 工具返回 "Not a git repository"；有 `.git` 但 user.email 未配置时 `git_commit` 返回 `AUTHOR_NOT_CONFIGURED` 明确错误，不抛 raw stderr；存在 `.git/index.lock` 时返回 `INDEX_LOCKED`；超长 git log 触发 timeout 返回 `GIT_TIMEOUT` |
| 3 explorer | MainAgent 在同一个 assistant turn 中并发发出两个 `task(explorer)` tool_calls，二者实际并发执行（trace 中两次 invoke 时间窗重叠）；`.iwriter/explorations/` 下出现两个文件；`finish_exploration` actionRequest 通过 `ExplorationCompareCard` 并排显示两方向摘要；`promote_exploration` 通过 `ExplorationMergeCard` 显示 before/after，作者 edit 调整 after 内容后 approve，`draft/{chapter}` 写入修改后的内容；`promote_exploration` 不再触发 plan-first cycle；`delete_exploration` 软删除到 `.trash/` 而非真删；schema `directions.length > 3` 时 `start_exploration` 直接拒绝 |
| 4 compress | storybible.md 超过 3500 token：rebuild signal 中 `recommended_action` 字段被填写；startup 响应中 agent 提议压缩；审批 `compress_storybible_history` 后 StoryBible `## Story State` 下出现 `### Archived Chapters` 子节；现有 StoryBible 内容无删除、无修改。**幂等性**：对同章节再次调用 `compress_storybible_history`，归档条目以 chapter filename 为 key upsert（不重复追加） |

---

## 11. 暂缓内容（Phase 6）

- **语义搜索（embedding）**：需独立选型（OpenAI / Ollama 本地模型）+ 索引构建 + 增量维护策略，与本阶段工作性质差异较大，单独规划。对 < 5 万字小说收益有限，可在规模增长后引入。
- **ExplorerAgent git branch 探索**：当前使用 `.iwriter/explorations/` 临时文件；升级为 git branch 需解决 branch 切换时 iWriter 工作区文件树同步问题，留 Phase 6。
- **`.iwriter/explorations/.trash/` 自动清理**：本阶段仅做软删除并保留 trash 目录；定期清理任务（按 mtime 回收 N 天前的条目）留 Phase 6。
- **探索批量管理 UI**：本阶段作者只能通过 agent 调用 `list_explorations` 查看，缺少直接的侧栏面板浏览/对比；留 Phase 6 引入独立的 *Narrative Branches Panel*（注意与文件树 ExplorerPanel 不同）。
