# Creative Agent Phase 4A 实施方案
## 逻辑质量加固 / SubAgent 化

> **命名说明**：原 03 概要设计 §10 和 04 角色设计 §11 中的"Phase 4（方向探索 + 语义搜索 + git branch）"改编号为 Phase 5。本阶段（Phase 4A）专项解决测试暴露的逻辑质量问题，不涉及 ExplorerAgent、语义搜索、git 集成。

---

## 0. Context

Phase 1–3 完成了写作执行闭环（plan-first / write / consistency check / storybible 维护）和创意顾问能力（advisor directions / character depth pass）。但测试结果暴露了两类系统性质量问题：

1. **角色行为逻辑断裂**：Phase 3 建立的心理三角（核心欲望 / 核心恐惧 / 虚假信念）被正确写入 StoryBible，但写作阶段 agent 并未从角色心理推导行为——角色行动由情节便利驱动，而非由心理内在驱动。

2. **情节因果薄弱 + 常识缺失**：事件发生是因为"故事需要"，而非由先前状态必然引发。同时出现物理、社会、心理层面的常识性错误：角色在不合理时间出现于不合理地点、情绪反应与刺激严重不成比例、机构或权力关系不符合现实逻辑、角色使用了只有作者才知道的信息。

**根因**：

| 角色 | 当前（单 LLM） | 问题 |
|---|---|---|
| 规划者 | 同一个 LLM 既负责深度推理，又想写出让用户满意的正文 | 写作目标压过逻辑目标，路径阻力最小方向优先 |
| 一致性检查者 | 用写完内容的同一个 LLM 检查自己写的内容 | 确认偏差——刚写完的内容往往被默认为"正确" |

加更多 skill 和 prompt 规则，改变的是参考信息，**不改变 LLM 的优化方向**。Phase 4A 的核心是将规划和检查分离为独立 sub-agent 上下文。

**deepagents SubAgent 机制（已验证）**：
- 主 agent 通过 `task` 工具启动 sub-agent（ephemeral，一次性）
- Sub-agent 有独立的 `systemPrompt`、`tools`、`skills`
- `responseFormat` 接受 Zod schema，结果以 JSON 返回给主 agent
- Sub-agent **不继承主 agent skills**（需显式指定 virtual skill 路径）

**Phase 4A 不做的事**：ExplorerAgent（Phase 5）、语义搜索、git 集成。

---

## 1. 关键决策

| # | 决策 | 选择 | 备注 |
|---|---|---|---|
| 1 | PlannerAgent 形态 | SubAgent（独立上下文，专用 tools + skills + responseFormat） | 无写作目标竞争，专注因果逻辑推导 |
| 2 | ConsistencyAgent 形态 | SubAgent（独立上下文，responseFormat: findings JSON） | 无确认偏差，独立检查 |
| 3 | AdvisorAgent 形态 | 保持主 LLM 角色扮演（Phase 3 形态不变）| 创意生成而非逻辑核验，独立性不是核心需求 |
| 4 | run_consistency_check 工具 | 从主 agent 工具集移除；`buildCreativeAnalysisTools` 拆分，保留 `get_storybible_rebuild_signal` | 两个工具在同一 builder，不能整体移除 |
| 5 | get_character_psychology | 新建（L1 工具），**仅注入 PlannerAgent**，不暴露给主 agent | 主 agent 不需要它；避免歧义调用 |
| 6 | Sub-agent skills 路径 | 与主 agent 一致：`'/skills/'`（virtual 路径）| `buildCreativeCapabilities` 现有实现使用 `/skills/` 虚拟挂载 |
| 7 | confirm_writing_plan schema | 追加可选 `logicAudit` 字段 | 需同步 `CreativePlanReviewItem`、`CreativeReviewAdapter`、`CreativeReviewSurface` |
| 8 | common_sense layer | 加入 `ConsistencyFindingLayer` union 和 `VALID_LAYERS`，以及 i18n | ConsistencyAgent responseFormat 会输出此值，parser 需同步 |
| 9 | logicAudit 可读性 | motivation traces ≤5 条，causal beats ≤8 条，common sense flags ≤5 条 | 避免 plan 审批变成读报告 |
| 10 | StoryBible 解析 | case-insensitive 标题匹配，支持中英文（`Characters` / `角色`），partial 三角返回 `missing_fields` 而非整体 missing | StoryBible 无强制格式，解析须健壮 |
| 11 | subAgents 类型 | `domain/types.ts`：`subAgents?: unknown[]` → `subAgents?: SubAgent[]` | Phase 4A 收紧 |

---

## 2. 写作任务流程（更新后）

```
作者："帮我写第三章 A 和 B 的冲突场景"
  ↓
MainAgent：
  1. task(planner, "scene: A 和 B 第一次正面冲突, ch03...")
     ↓ PlannerAgent（独立上下文）：
        - read_storybible()
        - get_character_psychology(['A', 'B'])
        - read_chapter('ch02.md')          ← 获取上文衔接
        - 加载 behavior-from-psychology、causal-chain-construction、
          common-sense-audit、character-decision-logic、scene-structure skills
        - 推导动机 → 构建因果链 → 常识核验
        - 返回 { plan, rationale, logicAudit: { motivationTraces, causalChain, commonSenseFlags } }
          （字段数量受限：traces ≤5，beats ≤8，flags ≤5）
     ↑
  2. confirm_writing_plan(plan, rationale, logicAudit)
     ← HITL：用户在审批 UI 中看到 plan + 可折叠的 Logic Audit 节
  ↓
  3. write_to_chapter('ch03.md', content, mode, approved_plan)
     ← HITL：用户审批正文内容
  ↓
  4. task(consistency_checker, "ch03.md")
     ↓ ConsistencyAgent（独立上下文，无确认偏差）：
        - read_storybible()
        - read_chapter('ch03.md')
        - 加载 pov-consistency-check、character-behavior-check、
          story-logic、common-sense-audit skills
        - 返回 { findings: [...], checkedLayers: [...] }
     ↑
  5. 将 findings 格式化为 consistency-findings 围栏块输出
  6. patch_storybible（新确认事实）
```

---

## 3. 文件清单

### 3.1 新建（7 个）

| 路径 | 用途 |
|---|---|
| `electron/ai/domain/creative/subAgents/planner.ts` | PlannerAgent SubAgent 定义 + LogicAuditSchema |
| `electron/ai/domain/creative/subAgents/consistency.ts` | ConsistencyAgent SubAgent 定义 + ConsistencyResponseSchema |
| `electron/ai/tools/CreativeLogicTools.ts` | `get_character_psychology`（仅 PlannerAgent 使用）|
| `electron/ai/builtin-skills/behavior-from-psychology/SKILL.md` | 从心理三角推导角色行为 |
| `electron/ai/builtin-skills/causal-chain-construction/SKILL.md` | 构建情节因果链，消除情节巧合 |
| `electron/ai/builtin-skills/common-sense-audit/SKILL.md` | 物理 / 社会 / 心理层的常识核验 |
| `electron/ai/builtin-skills/character-decision-logic/SKILL.md` | 压力下角色决策的真实逻辑 |

### 3.2 修改（11 个）

| 路径 | 主要变更 |
|---|---|
| `electron/ai/domain/creative/buildCreativeCapabilities.ts` | 拆分工具集（mainTools / readOnlyTools / plannerTools）；填充 `subAgents`；从主 agent 移除 `run_consistency_check` |
| `electron/ai/domain/types.ts` | `subAgents?: unknown[]` → `subAgents?: SubAgent[]` |
| `electron/ai/tools/CreativeAnalysisTools.ts` | 拆分 builder：`buildCreativeRebuildTools`（保留 `get_storybible_rebuild_signal`）与废弃 `run_consistency_check`；或从返回数组中排除后者 |
| `electron/ai/tools/CreativeTools.ts` | `confirm_writing_plan` schema 追加可选 `logicAudit` 字段（与 Planner responseFormat 对齐）|
| `src/ai/types.ts` | `CreativePlanReviewItem` 追加 `logicAudit?: LogicAudit` 字段；`inferToolKind` 加 `get_character_psychology: 'read'`，删除 `run_consistency_check` case |
| `electron/ai/ipc/CreativeReviewAdapter.ts` | `confirm_writing_plan` 分支透传 `logicAudit`（`asLogicAudit(args.logicAudit)`）|
| `src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue` | `creative_plan` 审批卡片增加折叠式 Logic Audit 节；`approve/edit` 路径保留 `logicAudit` 字段 |
| `src/ai/message/consistency-findings.ts` | `ConsistencyFindingLayer` union 加 `'common_sense'`；`VALID_LAYERS` Set 加 `'common_sense'` |
| `src/ai/thread/system-prompts/creative.ts` | 更新规划/检查流程：`task(planner)` / `task(consistency_checker)` 替代原 `run_consistency_check` 直接调用 |
| `src/i18n/messages/{zh-CN,en-US}.ts` | 加 `toolNames.get_character_psychology`；加 `consistencyFinding.layer.common_sense`；删除 `toolNames.run_consistency_check` |
| `src/ai/review/creativeReview.ts` 或相关 store | `approve/edit` 路径确保 logicAudit 随 args 回传 |

---

## 4. PlannerAgent SubAgent 定义

```ts
// electron/ai/domain/creative/subAgents/planner.ts
import { z } from 'zod'
import type { SubAgent } from 'deepagents'
import type { StructuredTool } from '@langchain/core/tools'

const MotivationTraceSchema = z.object({
  character: z.string(),
  action: z.string(),
  activatedDesireOrFear: z.string(),
  falseBelief: z.string(),
  derivation: z.string(),
})

const CausalBeatSchema = z.object({
  beat: z.string(),
  priorState: z.string(),
  trigger: z.string(),
  characterInterpretation: z.string(),
  decision: z.string(),
  consequence: z.string(),
})

const CommonSenseFlagSchema = z.object({
  dimension: z.enum(['physical', 'social', 'psychological']),
  issue: z.string(),
  correction: z.string(),
})

export const LogicAuditSchema = z.object({
  motivationTraces: z.array(MotivationTraceSchema).max(5),
  causalChain: z.array(CausalBeatSchema).max(8),
  commonSenseFlags: z.array(CommonSenseFlagSchema).max(5),
})

export const PlannerResponseSchema = z.object({
  plan: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.string()).max(3).optional(),
  logicAudit: LogicAuditSchema,
})

export type LogicAudit = z.infer<typeof LogicAuditSchema>

export function buildPlannerSubAgent(plannerTools: StructuredTool[]): SubAgent {
  return {
    name: 'planner',
    description: 'Produces a logically rigorous writing plan. Reads story context, derives character motivations from psychology triangles, builds a causal chain for each plot beat, and performs common-sense checks. Returns structured plan with Logic Audit. Max: 5 motivation traces, 8 causal beats, 5 common-sense flags.',
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    tools: plannerTools,
    skills: ['/skills/'],
    responseFormat: PlannerResponseSchema,
  }
}
```

**PLANNER_SYSTEM_PROMPT 核心内容：**

```
You are PlannerAgent. Your sole function is rigorous logic-first story planning.
You do NOT write prose. You plan what will happen and why it must happen.

Workflow:
1. call read_storybible
2. call get_character_psychology for every character named in the brief
   - Characters with missing psychology triangle: include in logicAudit.commonSenseFlags
     (dimension="psychological"), note the author needs to establish it first
3. call read_chapter or search_draft for prior context as needed
4. Load: behavior-from-psychology, causal-chain-construction, common-sense-audit,
   character-decision-logic, scene-structure skills

For each character with significant action:
- Which core desire or fear is activated? State it explicitly.
- How does their false belief filter their reading of the situation?
- Derive their action from this state. Do not use plot convenience.

For each major plot beat (max 8):
- State Prior State, Trigger, Character Interpretation, Decision, Consequence
- Is this event causally necessary? Would it happen without the Trigger?
- Does the character act only on information they actually possess?

Common sense check (flag violations, max 5; state "none" if clean):
- Physical: presence, movement time, capability, resources
- Social: institutional logic, power relations, information flow
- Psychological: reaction proportionality, decision complexity under stress

Keep plan text author-readable and concise.
Keep logicAudit entries brief — each field should be one clear sentence.
```

---

## 5. ConsistencyAgent SubAgent 定义

```ts
// electron/ai/domain/creative/subAgents/consistency.ts
import { z } from 'zod'
import type { SubAgent } from 'deepagents'
import type { StructuredTool } from '@langchain/core/tools'

const ConsistencyFindingSchema = z.object({
  layer: z.enum(['pov', 'character', 'logic', 'voice', 'pacing', 'continuity', 'common_sense', 'other']),
  severity: z.enum(['info', 'minor', 'major']),
  locationRef: z.string(),
  description: z.string(),
  suggestion: z.string(),
})

export const ConsistencyResponseSchema = z.object({
  findings: z.array(ConsistencyFindingSchema),
  checkedLayers: z.array(z.string()),
})

export function buildConsistencySubAgent(readOnlyTools: StructuredTool[]): SubAgent {
  return {
    name: 'consistency_checker',
    description: 'Checks a draft chapter for consistency issues: POV violations, character behavior deviating from StoryBible, plot logic gaps, voice drift, pacing, continuity errors, and common-sense violations (physical, social, psychological plausibility). Returns structured findings array.',
    systemPrompt: CONSISTENCY_SYSTEM_PROMPT,
    tools: readOnlyTools,
    skills: ['/skills/'],
    responseFormat: ConsistencyResponseSchema,
  }
}
```

**CONSISTENCY_SYSTEM_PROMPT 核心内容：**

```
You are ConsistencyAgent. Your sole function is finding consistency problems.
You do NOT plan or write. You verify.

Workflow:
1. call read_storybible — load constraints, character psychology, world rules
2. call read_chapter(target_file) — load the content to check
3. Load: pov-consistency-check, character-behavior-check, story-logic,
   common-sense-audit skills

Check these layers:
- pov: narration outside the POV character's direct perception?
- character: action, reaction, dialogue inconsistent with StoryBible psychology or state?
- logic: causal gaps, coincidences, information the character could not possess?
- common_sense: physical plausibility (time/space/capability), social/institutional logic,
  psychological reaction proportionality?
- voice: significant drift from established tone, style, or character voice?
- continuity: contradiction with established timeline, world rules, or prior chapter facts?

Severity:
- major: breaks the story contract (direct contradiction, POV violation)
- minor: weakens the story (behavior slightly off, reaction somewhat disproportionate)
- info: worth noting but low impact (potential accumulation risk)

Report only findings that matter. Do not generate findings for coverage.
```

---

## 6. `get_character_psychology` 工具（仅 PlannerAgent 使用）

```ts
// electron/ai/tools/CreativeLogicTools.ts
schema: z.object({
  names: z.array(z.string()),
})
```

**实现要点：**

1. 读取 `storybible.md`
2. 定位 `## Characters` 或 `## 角色`（**大小写不敏感**，中英文均支持）下的角色子节
3. 对每个 `name`，做**模糊匹配**（case-insensitive，忽略前后空格；先精确匹配，再做 includes 降级）
4. 提取心理三角字段（核心欲望 / 核心恐惧 / 虚假信念）和当前状态
5. 区分两种缺失：
   - `missing`：StoryBible 中完全找不到该角色的条目
   - `missing_fields`：找到角色条目，但心理三角字段缺失或不完整（`{ name, presentFields: [...], missingFields: [...] }`）

**返回格式：**
```jsonc
{
  "characters": {
    "A": {
      "core_desire": "被认可为能独当一面的人",
      "core_fear": "暴露出自己其实不知道答案",
      "false_belief": "展现脆弱等于失去他人尊重",
      "current_state": "刚经历了一次公开的失败，自我怀疑加剧"
    }
  },
  "missing": ["C"],
  "missing_fields": [
    { "name": "B", "presentFields": ["core_desire"], "missingFields": ["core_fear", "false_belief"] }
  ]
}
```

`missing_fields` 列出角色存在但三角不完整的情况，PlannerAgent 应在 `logicAudit.commonSenseFlags` 中标记，建议作者补全后再规划。

---

## 7. 工具集拆分策略（`buildCreativeCapabilities` 更新）

```ts
export function buildCreativeCapabilities(...): DomainAgentCapabilities {
  // 1. 拆分 CreativeAnalysisTools
  const analysisTools = buildCreativeAnalysisTools({ workspacePath, creativeDb, snapshotBroker })
  // run_consistency_check 不再加入主 agent；get_storybible_rebuild_signal 保留
  const rebuildSignalTools = analysisTools.filter(t => t.name === 'get_storybible_rebuild_signal')

  // 2. 主 agent 工具集（无 run_consistency_check，无 get_character_psychology）
  const mainTools = [
    ...buildCreativeTools({ workspacePath, creativeDb, snapshotBroker }),
    ...rebuildSignalTools,
    ...buildCreativeAdvisorTools({ workspacePath }),
  ]

  // 3. 只读工具集（给 sub-agents 使用）
  const READ_TOOL_NAMES = new Set([
    'read_storybible', 'read_chapter', 'read_fragments',
    'search_draft', 'get_session_diff',
  ])
  const readOnlyTools = mainTools.filter(t => READ_TOOL_NAMES.has(t.name))

  // 4. PlannerAgent 工具集（只读 + get_character_psychology）
  const logicTools = buildCreativeLogicTools({ workspacePath })
  const plannerTools = [...readOnlyTools, ...logicTools]

  // 5. SubAgent 定义
  const plannerAgent = buildPlannerSubAgent(plannerTools)
  const consistencyAgent = buildConsistencySubAgent(readOnlyTools)

  return {
    tools: mainTools,
    skills: ['/skills/'],
    backend,
    interruptOn: CREATIVE_INTERRUPT_ON,
    subAgents: [plannerAgent, consistencyAgent],
  }
}
```

---

## 8. logicAudit 在 HITL 链路中的完整透传

Phase 4A 需同步以下数据链路，缺一不可：

**① `confirm_writing_plan` tool schema（`CreativeTools.ts`）**
```ts
z.object({
  plan: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.string()).optional(),
  logicAudit: LogicAuditSchema.optional(),  // 从 planner.ts 导出
})
```

**② `CreativePlanReviewItem`（`src/ai/types.ts`）**
```ts
export interface CreativePlanReviewItem extends BaseCreativeReviewItem {
  kind: 'creative_plan'
  toolName: 'confirm_writing_plan'
  plan: string
  rationale: string
  alternatives?: string[]
  logicAudit?: LogicAudit  // 新增
}
```

**③ `CreativeReviewAdapter`（`CreativeReviewAdapter.ts`）**
```ts
if (action.name === 'confirm_writing_plan') {
  return {
    ...
    logicAudit: asLogicAudit(args.logicAudit),  // 新增；类型转换/校验
  }
}
```

**④ `CreativeReviewSurface.vue`**
- `creative_plan` 卡片：若 `logicAudit` 非空，渲染折叠式 "Logic Audit" 节（默认折叠）
- Motivation Traces / Causal Chain / Common Sense Flags 各为子折叠
- `approve/edit` 路径：editedArgs 保留 `logicAudit` 字段（edit 时不清除它）

---

## 9. `common_sense` layer 同步

`src/ai/message/consistency-findings.ts`：
```ts
export type ConsistencyFindingLayer =
  | 'pov' | 'character' | 'logic' | 'voice' | 'pacing' | 'continuity'
  | 'common_sense'   // ← Phase 4A 新增
  | 'other'

const VALID_LAYERS = new Set<ConsistencyFindingLayer>([
  'pov', 'character', 'logic', 'voice', 'pacing', 'continuity',
  'common_sense',    // ← Phase 4A 新增
  'other',
])
```

i18n 同步加 `consistencyFinding.layer.common_sense` 的中英文翻译。

---

## 10. 新 Skills 内容设计

### 10.1 `behavior-from-psychology`

角色的每个重要行动必须从心理三角中推导，而非从情节需要出发。

推导路径：
1. 当前情境激活了角色的哪个核心欲望或核心恐惧？
2. 角色的虚假信念如何过滤这个情境？（他认为发生了什么，与实际发生的有何不同？）
3. 在这种认知驱动下，这个角色的第一反应是什么？
4. 这个反应如何转化为可观察到的行动或对话？

常见失误：行为由情节需要驱动；两个不同心理三角的角色在同一情境下做出相同反应；角色展现出与虚假信念矛盾的洞察力，但没有促成这种变化的外部事件。

### 10.2 `causal-chain-construction`

情节事件的六要素：**Prior State → Trigger → Character Interpretation → Decision → Action → Consequence**。

常见因果漏洞：
- **信息漏洞**：角色知道只有作者才知道的信息
- **动机漏洞**：行动不符合角色当前状态下的任何合理利益
- **巧合替代因果**：用"恰好"解决叙事节点，没有在 Prior State 中预埋条件
- **时间漏洞**：事件在物理上不可能完成的时间窗口内完成
- **后果遗忘**：前一行动的后果在下一场景中被忽略

测试方法：每个重要事件能回答"如果 Trigger 不存在，这个事件还会发生吗？"

### 10.3 `common-sense-audit`

**物理维度**：时空一致性（位置与移动时间是否匹配）、能力约束、资源约束。

**社会维度**：机构逻辑（官僚体系、职场、法律程序）、权力关系（行动是否符合角色在结构中的位置）、信息流（谁会知道什么，以何种方式知道）。

**心理维度**：反应比例（情绪强度与刺激成比例）、认知边界（角色只能用实际拥有的信息做决策）、压力下的简化（极度压力时行为简化而非复杂化）。

### 10.4 `character-decision-logic`

真实决策的三层次：意识层（角色自认为的理由）/ 情绪层（当前情绪对判断的过滤）/ 心理层（核心欲望恐惧的底层驱动）。

常见错误：情绪激动状态下做出需要冷静头脑的精确推理；角色有意识地分析并克服自己的深层动机（需要极强外部冲击才合理）。

信息限制原则：角色只能基于他们当前实际拥有的信息做决策。作者知道的事，角色不知道。

---

## 11. System prompt 追加内容（`creative.ts`）

### 11.1 规划流程更新

```
## Planning flow (Phase 4A)

Before calling confirm_writing_plan for any scene with significant character
action or dialogue:

1. Call task with subagent_type="planner", describe:
   - Scene brief (what needs to happen, which characters are involved)
   - Relevant prior context (chapter, recent events)

2. Review planner's result:
   - If logicAudit.commonSenseFlags contains missing/incomplete psychology triangles:
     stop and ask the author to complete them before proceeding
   - If commonSenseFlags contains other correctable issues: incorporate corrections

3. Call confirm_writing_plan using the planner's plan, rationale, and logicAudit.
   Do NOT call confirm_writing_plan without first calling task(planner).
```

### 11.2 一致性检查流程更新

```
## Consistency check flow (Phase 4A)

After write_to_chapter is approved and applied:
- Call task with subagent_type="consistency_checker", specify the chapter filename
- Format the returned findings array as a consistency-findings fenced block
- If findings is empty, say so in plain prose; do not emit an empty block

Do NOT call run_consistency_check. Use consistency_checker subagent only.
```

---

## 12. 需同步更新的上游设计文档

| 文件 | 需更新的内容 |
|---|---|
| `design/creativeagent/03_概要设计.md` §10 | Phase 4 → Phase 4A（逻辑质量加固）；原 Phase 4 内容（方向探索 + 语义搜索）移至 Phase 5 |
| `design/creativeagent/04_agent角色设计.md` §11 | Phase 4 → Phase 4A；Phase 5 = ExplorerAgent + 语义搜索 + git |

---

## 13. 实施顺序（PR 拆分）

### PR 1 —— Skills + SubAgent 定义 + get_character_psychology（零行为变更）

文件改动：
- 新建：4 个 SKILL.md
- 新建：`electron/ai/tools/CreativeLogicTools.ts`（`get_character_psychology`）
- 新建：`electron/ai/domain/creative/subAgents/planner.ts`（定义 + LogicAuditSchema，未接入）
- 新建：`electron/ai/domain/creative/subAgents/consistency.ts`（定义，未接入）
- 修改：`electron/ai/domain/types.ts`（`subAgents` 类型收紧）
- 修改：`src/ai/message/consistency-findings.ts`（加 `common_sense` layer）
- 修改：i18n（`common_sense` 翻译，提前加入）

完成后：新工具和 sub-agent 定义可用，主 agent 行为不变。Phase 1–3 全部回归通过。

### PR 2 —— 工具集拆分 + SubAgent 接入

文件改动：
- 修改：`electron/ai/tools/CreativeAnalysisTools.ts`（从返回值排除 `run_consistency_check`，保留 `get_storybible_rebuild_signal`）
- 修改：`electron/ai/domain/creative/buildCreativeCapabilities.ts`（拆分 mainTools / readOnlyTools / plannerTools；填充 `subAgents`）
- 修改：`src/ai/types.ts`（`inferToolKind` 加 `get_character_psychology`；删除 `run_consistency_check` case）
- 修改：i18n（`get_character_psychology` 工具名；删除 `run_consistency_check` 条目）

完成后：sub-agents 已注入，`task` 工具可用，`run_consistency_check` 从主 agent 消失，`get_storybible_rebuild_signal` 仍在。System prompt 未更新，主 agent 暂时不会自动调用 sub-agents。

### PR 3 —— logicAudit 数据链路 + System prompt + UI

文件改动：
- 修改：`electron/ai/tools/CreativeTools.ts`（`confirm_writing_plan` schema 加 `logicAudit?`）
- 修改：`src/ai/types.ts`（`CreativePlanReviewItem` 加 `logicAudit?` 字段）
- 修改：`electron/ai/ipc/CreativeReviewAdapter.ts`（透传 `logicAudit`）
- 修改：`src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue`（折叠 Logic Audit 节；edit 路径保留 `logicAudit`）
- 修改：相关 review store（approve/edit 路径保留 `logicAudit`）
- 修改：`src/ai/thread/system-prompts/creative.ts`（§11.1 / §11.2 全部内容）

完成后：Phase 4A 完整闭环。Planner sub-agent 在每次规划任务前被调用；Consistency sub-agent 在写后被调用；logicAudit 在审批 UI 中可见且不丢失。

---

## 14. Verification

### 14.1 PR 1 回归

1. `npm run lint && npm run type-check` 通过
2. `get_character_psychology` 正确处理：完整三角 → 返回 characters；角色缺失 → missing；字段不完整 → missing_fields
3. `get_character_psychology` 对中文标题（`## 角色`）和英文标题（`## Characters`）均可定位
4. ConsistencyFindingLayer `common_sense` 不会被归到 `other`
5. Phase 1–3 行为全部回归

### 14.2 PR 2 行为验证

- `task` 工具出现在 agent 工具列表中
- **task schema 的可用 sub-agent 列表包含 `planner` 和 `consistency_checker`**（不能只验证 task 工具存在）
- `run_consistency_check` 不再出现在主 agent 工具列表中
- `get_storybible_rebuild_signal` 仍在主 agent 工具列表中
- `get_character_psychology` 不在主 agent 工具列表中

### 14.3 PR 3 端到端测试

**A. Planner 独立推理**

给定有完整心理三角的角色，要求写一个场景：
- trace：`task(planner)` 调用存在
- `confirm_writing_plan` 的 `logicAudit` 字段非空
- CreativeReviewSurface 中出现可折叠的 Logic Audit 节
- Motivation Traces 具体引用角色心理三角（不是格式占位）
- 每项 ≤ 规定上限（traces ≤5，beats ≤8，flags ≤5）

**B. 心理三角缺失拦截**

给定缺少三角的角色：
- `get_character_psychology` 返回 `missing` 或 `missing_fields`
- `logicAudit.commonSenseFlags` 包含对应标记
- plan 中告知作者先完善

**C. Consistency sub-agent 无确认偏差**

写完一章后：
- trace：`task(consistency_checker)` 调用存在
- 返回 findings 格式化为 `consistency-findings` 围栏块
- `common_sense` layer 的 finding 正确渲染（不降级到 `other`）

**D. logicAudit 全链路**

verify：approve 后 `logicAudit` 不丢失（can be observed via `write_to_chapter` 的 `approved_plan` 和 `confirm_writing_plan` tool result）

**E. get_storybible_rebuild_signal 回归**

会话启动时 `get_storybible_rebuild_signal` 仍被调用，行为与 Phase 2 一致。

### 14.4 自动化检查（每 PR 必跑）

```bash
npm run lint
npm run type-check
npm run dev  # 主进程冷启动 ready
```

### 14.5 不在 Phase 4A 验证范围

- ExplorerAgent（Phase 5）
- 并行 sub-agent 调用
- 语义搜索、git 集成
- Sub-agent 的 HITL 配置（planner/consistency 均为 L1，无 HITL）
