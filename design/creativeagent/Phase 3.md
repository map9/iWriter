# Creative Agent Phase 3 实施方案

## 0. Context

Phase 1-2 完成了写作执行闭环（plan-first / write_to_chapter / consistency check / storybible 维护）。Phase 3 在**单 LLM 形态**不变的前提下，落地 AdvisorAgent 角色，补齐创意阶段的两个缺口：

1. **循环打转**：作者给出方向，agent 只在框架内执行，不能给出更好的角度或突破作者的框架限制。
2. **角色深度缺失**：角色建立期只记录事实标签（职业/性格/关系），缺乏心理深度，后续写作无法从角色内部生长出行为。

Phase 3 不引入真正的 sub-agent 编排（仍是单 LLM 角色扮演），不动 `subAgents: []` 字段，留到 Phase 4+ 按需填充。

Phase 3 也包含一个已独立完成的修复：**约束执行偏差修复**（`creative.ts` system prompt 的 pre-write anchor、冲突显式提出、patch 前 read、write 前必读 skill，已在 Stage 1 提交）。

**Phase 3 不做的事**：真正的 sub-agent 编排、git 集成、ExplorerAgent、语义搜索、Pilot Mode。

---

## 1. 关键决策

| # | 决策 | 选择 | 备注 |
|---|---|---|---|
| 1 | AdvisorAgent 形态 | 单 LLM 角色扮演 + 新工具返回素材 + skills 引导 | 与 Phase 1-2 形态一致 |
| 2 | 主动渗透 vs 被动触发 | 两者并存：被动（作者求助）+ 主动（plan 前夹带 alternative） | 04 §7 更新后的设计 |
| 3 | 角色深度建立时机 | 首次创建角色 section 时触发 depth pass（system prompt 规则，不需新工具）| 用现有 character-complexity skill |
| 4 | advisor 输出渲染 | 围栏块 `advisor-directions`，复用 consistency-findings 同套机制 | 不破坏现有渲染路径 |
| 5 | 新工具数量 | 2 个：`advise_directions` + `analyze_story_architecture`（可选）| 工具返回素材，LLM 在围栏块里输出建议 |
| 6 | splitTextWithFences 重构 | 抽象为 `splitTextWithFences(text, fenceMap)` 统一处理多种围栏 | 避免两个平行的正则循环 |
| 7 | 新 skills 数量 | 3 个：`plot-extrapolation`、`structural-diagnosis`、`character-potential` | 现有 15 个中已有 conflict-design / thematic-depth 等，不重复 |
| 8 | subAgents | 保持 `subAgents: []` 空数组 | Phase 4+ 填充 |

---

## 2. 复用与新建边界

**直接复用：**
- Phase 1-2 全部既有工具与协议
- `electron/ai/builtin-skills/` 中现有 15 个 skills（`character-complexity`、`brainstorm-quality`、`conflict-design`、`thematic-depth` 等）
- `src/ai/message/consistency-findings.ts` 的切分函数逻辑（重构后复用接口）
- `AgentMessageBubble.vue` 的 Path A（L75-88）+ Path B（L113-126）渲染注入点
- `ConsistencyFindingCard.vue` 的设计模式（新组件参照）

**不复用：**
- 不引入嵌套 LLM 调用（新工具只聚合素材，不调用 LLM）
- 不复用 CreativeReviewSurface（advisor 建议不阻塞，不进 review 通道）

**新建命名空间：**
- `electron/ai/tools/CreativeAdvisorTools.ts`：advisor 类工具（与 CreativeAnalysisTools 关注点分离）
- `src/ai/message/fenced-blocks.ts`：通用围栏切分器（替代 consistency-findings 内的专用正则）
- `src/ai/message/advisor-directions.ts`：advisor direction 类型定义与验证

---

## 3. 文件清单

### 3.1 新建（9 个文件）

| 路径 | 用途 |
|---|---|
| `electron/ai/tools/CreativeAdvisorTools.ts` | `advise_directions` + `analyze_story_architecture` |
| `electron/ai/builtin-skills/plot-extrapolation/SKILL.md` | 从当前状态延伸有意义的后续可能 |
| `electron/ai/builtin-skills/structural-diagnosis/SKILL.md` | 整体结构诊断（松弛段 / 节奏失衡 / 开头力量不足） |
| `electron/ai/builtin-skills/character-potential/SKILL.md` | 发现角色设定中未被探索的维度和关系动态 |
| `src/ai/message/fenced-blocks.ts` | `splitTextWithFences(text, fenceMap)` 通用切分器 |
| `src/ai/message/advisor-directions.ts` | `AdvisorDirection` 类型 + `normalizeDirection` |
| `src/components/ai/agent-panel/chat-area/views/AdvisorDirectionsBlock.vue` | 整组 advisor directions 容器 |
| `src/components/ai/agent-panel/chat-area/views/AdvisorDirectionCard.vue` | 单 direction 卡片 |
| `src/i18n/messages/{zh-CN,en-US}.ts` 中 `advisorDirection.*` 命名空间 | type 本地化（不是新文件，只是新增节段） |

### 3.2 修改（8 个文件）

| 路径 | 主要变更 |
|---|---|
| `electron/ai/domain/creative/buildCreativeCapabilities.ts` | 合并 `buildCreativeAdvisorTools` 产出 |
| `electron/ai/AgentEngine.ts` | 把 advisor tools 所需的依赖（snapshotBroker 已有）传给 buildCreativeAdvisorTools |
| `src/ai/thread/system-prompts/creative.ts` | 追加：advisor mode 主动激活规则、character depth pass 规则、`advise_directions` 调用时机、`advisor-directions` 围栏格式约定 |
| `src/ai/types.ts` | `inferToolKind` 加 `advise_directions: 'read'` / `analyze_story_architecture: 'read'` |
| `src/ai/message/display-normalizer.ts` | 加两个新工具的 case |
| `src/ai/message/consistency-findings.ts` | 把内部正则切分逻辑迁移为调用 `fenced-blocks.ts`（保持接口不变） |
| `src/components/ai/agent-panel/chat-area/AgentMessageBubble.vue` | Path A + Path B 加 `advisor-directions` 围栏识别，渲染 `AdvisorDirectionsBlock` |
| `src/i18n/messages/{zh-CN,en-US}.ts` | 加 `toolNames.advise_directions` / `analyze_story_architecture` / `advisorDirection.type.*` |

---

## 4. CreativeAdvisorTools 工具协议

### 4.1 `advise_directions`（L1，无 HITL）

```ts
schema: z.object({
  focus: z.string(),  // 作者当前的问题焦点或写作方向（由 LLM 根据对话概括）
  scope: z.enum(['character', 'plot', 'structure', 'scene', 'general']).optional(),
})
```

实现：
1. 读 storybible.md（截断 4000 字符）
2. 读 fragments.md（截断 2000 字符，取最近创意碎片）
3. 列出 draft/ 文件列表（不读全文，只取章节名和字数）
4. 把 `{ focus, scope, storybible_excerpt, fragments_excerpt, draft_overview, instructions }` 作为 JSON 返回

工具不直接产建议，**指示 LLM 在下一轮 assistant 输出中**用 `advisor-directions` 围栏块产方向。

调用时机（写在 system prompt）：
- 作者明确求助方向时
- plan 前的 alternative angle 检查（主动渗透），若发现有价值方向则调用
- 作者问"这段/这个角色有什么问题"时

### 4.2 `analyze_story_architecture`（L1，无 HITL）

```ts
schema: z.object({})
```

实现：
1. 读 storybible.md 完整内容
2. 列出 draft/ 所有章节文件，读取每个文件的前 200 字符（标题 + 开头）作为摘要
3. 返回 `{ storybible, chapter_outlines: [{filename, word_count, preview}], instructions }`

调用时机：作者明确问"整体架构怎样"、"故事现在在哪个阶段"、"节奏有没有问题"时。

### 4.3 advisor-directions JSON schema（围栏块内容）

```jsonc
{
  "type": "plot | character | structure | scene | theme | voice",
  "direction": "一句话描述这个方向——具体到读者能感受到的层面",
  "angle": "为什么这个方向有潜力——从已确立设定的哪个未被利用的元素出发"
}
```

`angle` 字段简短（30 字以内），是 agent 的创作直觉，不是对作者意图的解释。

围栏块示例：
````
```advisor-directions
[
  { "type": "character", "direction": "A 用沉默回应 B 的质问，但内心记录了每一句话", "angle": "StoryBible 里 A 的压抑特质从未在对话中被利用过" },
  { "type": "plot", "direction": "B 的信息优势在这场对话中意外失效，反而暴露了弱点", "angle": "目前 B 一直处于强势位，读者需要看到他有软肋" },
  { "type": "structure", "direction": "将这场冲突推迟到章末，用一个外部事件强制两人进入同一空间", "angle": "直接对话太提前消耗了第三幕的情感资本" }
]
```
````

---

## 5. advisor-directions 在 chat 中的非阻塞渲染

System prompt 约定：

```
When calling advise_directions or analyze_story_architecture, in the next assistant message
produce directions as a fenced code block with language tag "advisor-directions", containing
a JSON array of direction objects (max 3). Place normal prose before/after the block.
If you are embedding an alternative angle inside a confirm_writing_plan call, place the
advisor-directions block BEFORE the plan proposal.

Example:
```advisor-directions
[ { "type": "character", "direction": "...", "angle": "..." } ]
```
```

渲染路径：

1. `src/ai/message/fenced-blocks.ts` 提供 `splitTextWithFences(text, fenceMap)`:
   - `fenceMap = { 'consistency-findings': parseFindings, 'advisor-directions': parseDirections }`
   - 返回 `Array<{kind: 'prose', text} | {kind: string, data: unknown}>`

2. `AgentMessageBubble.vue` Path A（L75）：
   ```
   for each block:
     if kind === 'prose' → MarkdownContentView
     if kind === 'consistency-findings' → ConsistencyFindingsBlock
     if kind === 'advisor-directions' → AdvisorDirectionsBlock
   ```

3. `consistency-findings.ts` 内部重构为调用 `splitTextWithFences`（保持 `splitTextWithFindings` 接口不变，内部委托）。

容错：JSON 解析失败 → 退化为普通 markdown code block；缺字段 → `type='general'`，`angle` 不展示。

视觉规范（daisyUI 5）：
- 整体：`border-l-4 border-primary bg-primary/5 rounded-lg`
- type badge：`badge badge-primary badge-sm`
- direction：主文本，正常字重
- angle（小字，灰色，可折叠）：`text-xs text-base-content/60`

---

## 6. System prompt 追加内容（`creative.ts` 新增段）

### 6.1 AdvisorAgent 角色定义（追加到 Roles 节）

```
- **AdvisorAgent**: when the author is exploring direction or when proactive expansion is valuable—read story state, offer 2–3 diverging directions. Do not converge. Do not plan ahead of the author's decision.
```

### 6.2 主动渗透规则（追加到 Plan-first rules 节）

```
Before calling confirm_writing_plan, run a proactive expansion check:
- Is the author's direction leaving a stronger thematic or character angle untouched?
- Is there a sharper conflict form than the one described?
- Is there a structural reason to reconsider timing or placement?

If yes (and only if yes), call advise_directions and emit an advisor-directions block BEFORE the plan proposal. Keep it to 2–3 items. Do not call advise_directions if the author has already seen and dismissed alternatives.
```

### 6.3 角色深度建立规则（追加到 StoryBible maintenance 节）

```
Character depth pass: when creating a new character entry in the ## 角色 section of StoryBible,
first read character-complexity skill. The entry must include the psychology triangle:
- Core desire: the real driver behind the character's surface goal
- Core fear: what they cannot afford to lose
- False belief: a wrong assumption about the world or themselves that drives their arc

Do not create a character entry with only facts (job, trait, relationship). Depth is required at creation.
```

### 6.4 advisor-directions 围栏格式（追加到 Post-write consistency loop 节附近，新增段）

参见 §5 中的约定格式。

### 6.5 Skills 路由更新

```
- Story direction / "what next": plot-extrapolation (new)
- Structural problems / pacing: structural-diagnosis (new)
- Flat character / unexplored potential: character-potential (new)
```

---

## 7. 实施顺序（建议 PR 拆分）

### PR 1 —— 基础设施：fenced-blocks 重构 + 新 skills

文件改动：
- 新建：`src/ai/message/fenced-blocks.ts`
- 修改：`src/ai/message/consistency-findings.ts`（内部重构，接口不变）
- 新建：3 个 SKILL.md（`plot-extrapolation`、`structural-diagnosis`、`character-potential`）

完成后：fenced-blocks 切分器可用，一致性检查回归通过，新 skills 可被 agent 读取。

### PR 2 —— `advise_directions` 工具 + system prompt + UI

文件改动：
- 新建：`electron/ai/tools/CreativeAdvisorTools.ts`（advise_directions）
- 修改：`buildCreativeCapabilities.ts`（合并 advisor tools）
- 修改：`AgentEngine.ts`（如有新依赖）
- 修改：`src/ai/thread/system-prompts/creative.ts`（§6.1/6.2/6.3/6.5）
- 修改：`src/ai/types.ts`（inferToolKind）
- 修改：`src/ai/message/display-normalizer.ts`（新工具 case）
- 新建：`src/ai/message/advisor-directions.ts`
- 新建：`AdvisorDirectionsBlock.vue` + `AdvisorDirectionCard.vue`
- 修改：`AgentMessageBubble.vue`（Path A + Path B 加 advisor-directions）
- 修改：i18n（新条目）

完成后：advisor mode 可用，主动渗透逻辑触发，围栏块渲染正确。

### PR 3 —— `analyze_story_architecture` 工具 + 角色深度 system prompt 规则

文件改动：
- 修改：`CreativeAdvisorTools.ts`（追加 analyze_story_architecture）
- 修改：`buildCreativeCapabilities.ts`（工具已在，仅检查签名）
- 修改：`src/ai/thread/system-prompts/creative.ts`（§6.3 character depth pass 规则）
- 修改：i18n（analyze_story_architecture 条目）

完成后：Phase 3 完整闭环。

PR 1 是纯工程化改动（接口不变的重构 + 文本文件），可独立合并；PR 2 依赖 PR 1 的 fenced-blocks；PR 3 依赖 PR 2。

---

## 8. Verification

### 8.1 PR 1 回归

1. `npm run lint && npm run type-check` 通过
2. 拿 Phase 2 已部署 workspace 启动应用，一致性检查（write_to_chapter → run_consistency_check）的围栏块仍正确渲染
3. 新 skills 可被 agent 通过 read_file 调用（在 trace 中出现 plot-extrapolation 等 SKILL.md 的读取）

### 8.2 PR 2 端到端测试

**A. 被动触发**：作者说"我不知道接下来怎么写" → agent 调用 `advise_directions` → chat 中出现 `AdvisorDirectionsBlock` 卡片，type badge 正确，angle 灰色小字，不阻塞流程。

**B. 主动渗透**：作者说"帮我写 A 和 B 的吵架场景" → agent 在 plan 前调用 `advise_directions` → advisor block 出现在 plan 前，提供 1-2 个替代角度 → 作者忽略后 plan 正常进行。

**C. 角色深度 pass**（依赖 §6.3 system prompt，在 PR 3 前可先手动验证）：在空 workspace 描述一个主角 → StoryBible 中角色条目包含 core desire / core fear / false belief，而不只是"内向、聪明"等标签。

**D. 围栏容错**：截断 advisor JSON → 渲染退化为普通 code block，不崩溃。

**E. advisor + consistency 共存**：在同一 assistant message 中测试 prose + advisor-directions block + consistency-findings block 均正确渲染，互不干扰。

### 8.3 PR 3 端到端测试

**F. 宏观架构**：作者问"故事整体节奏怎样" → agent 调用 `analyze_story_architecture` → 回复中有章节摘要 + 结构分析，不调用 advise_directions（两个工具的触发时机不同）。

**G. 角色深度**：首次创建主角 → StoryBible 中该角色 section 出现心理三角，depth 明显高于"性格：压抑"的标签写法。

### 8.4 自动化检查（每 PR 必跑）

```bash
npm run lint
npm run type-check
npm run dev  # 主进程冷启动 ready
```

### 8.5 不在 Phase 3 验证范围

- 真正的 sub-agent 编排
- ExplorerAgent
- git 集成
- 语义搜索
- Pilot Mode
