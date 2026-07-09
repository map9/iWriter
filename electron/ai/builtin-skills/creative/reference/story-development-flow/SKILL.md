---
name: story-development-flow
description: Load when judging whether a project is ready to move to the next creative stage — before authoring a master outline, before drafting a chapter outline, before writing a chapter, or when answering "where am I / what's next". Defines the default pipeline and the readiness gates.
---

# story-development-flow

The creative pipeline is NOT enforced by a state machine — the author may iterate, jump, and override. So quality is guarded by **readiness gates**: how mature the upstream must be before this stage's output can be any good. A gate is a **quality-guard + gap proposal, not a hard lock**.

## The default pipeline

```
project.md ─闸0→ 设定/角色 ⇄ ─闸1→ 总纲 →[卷纲]─闸2→ 章纲 ─闸3→ 正文 → 随写随评(编辑·好不好·一轮) → 整章终审 → 审校/重构
                （正文前可选先设计 beat：作者写 / A00 辅助 / 无。有 beat 按 beat 参照，无 beat 直接从章纲场景写）
```

Levels differ in granularity — **event-level** (总纲/卷纲: structure nodes) vs **scene-level** (章纲: goal/conflict/outcome three-part; beat: in-scene 节拍, **optional**). The dividing line is the chapter outline: **an event-level master outline never substitutes for a scene-level chapter outline.** The hard prerequisite for prose is 闸3 章纲已确认; **beat 是可选辅助，不是门槛**。

## The soft/hard principle (reconciling gates with author autonomy)

- **You never cross a gate on your own.** Before entering a stage, check the upstream's readiness. If it's not ready, surface the gap and propose filling it first — do NOT silently fabricate the missing upstream, do NOT push ahead and produce something weak.
- **The author may cross a gate explicitly** ("别管这些，直接写"). Then proceed, but give **one** minimal quality-risk note (e.g. "该章章纲未确认，直接写可能后续要大改"), and don't repeat it. Approval red lines are never relaxed.
- **Gap-fill is a switch, not a hang**: switch upstream to fill the gap → author confirms → return to the original task (FR-2.4). Any write-session stays open.

## The five gates (readiness = judgment, not a mechanical checklist)

Each gate's sharpest test is the **reverse judgment**: "if I force the next step now, what weak result do I get?"

**闸0 立项就绪（→ 构思/设定）** — `project.md` premise 四要素 (主角/目标/阻碍/赌注) hold + theme + scale. Missing → S11/S02 first, don't invent.

**闸1 设定/角色就绪（→ 可搭总纲）** — 总纲是冲突的蓝图，冲突从人物本性长出。
- 主角 + 至少一个核心关系/对立方，各有成形心理三角（欲望/恐惧/虚假信念），两者的欲望-恐惧能天然对撞（非外部误会）；世界核心规则+关键禁区（带原因）已定；主题是"不能被干净回答的问题"。
- **反向判断**：此刻搭总纲，结构节点会不会全是"事件发生了"而没有"人物为此付出/暴露了什么"？会 → 设定太薄，回 S02/S03。

**闸2 总纲就绪（→ 可细化章纲）** — 章纲是把总纲某结构节点落成场景。
- 要细化的章/段对应结构节点写清"发生什么+关联弧光+（若有）主题落点"；弧光阶段清楚；总纲相关段落建议 `已确认`。
- **反向判断**：拿着总纲节点能不能拆出"这一章有哪几场戏、每场目标是什么"？拆不出 → 节点太粗，先补总纲/卷纲。

**闸3 章纲就绪（→ 可写章节）** — 写手只看章纲就该知道每场戏写什么。
- 该章 `ch{NNN}-outline.md` 存在且 `status: 已确认`；每场景三段式完整（目标可验证/冲突/结果非顺利达成/POV/出场人物）。
- **反向判断**：拿着章纲还要不要自己现编冲突和结果？要 → 章纲不合格，补 S04 并确认后再写。
- 一旦作品分章节，写第 N 章前该章章纲必须先成形并确认；不必一次建全部章纲，但绝不从事件级总纲直接写正文。

**闸4 不是门槛 —— beat 是可选辅助** — 写正文的授权由 `confirm_writing_plan` 承载（泛化为写作会话授权，可含 beat 也可为一句轻量写作意图）。beat 三种来源：作者自己写 / A00 辅助设计 / 没有。有 beat → writer 按 beat 参照；无 beat → writer 直接从章纲场景写、自行分段。beat（若设计）由 A00 写成正文文件里的 **GFM Alert**（`> [!BEAT] [场景-{N}-节拍-{M}] 一句话提纲`——`[!BEAT]` 是固定提取标记，场景坐标 A00 生成必带、作者手写可省；章纲不含 beat）。两轴（beat 层是否变 / 是否委派 writer）、写章节前置状态机与重写保护见 `writing-plan-authoring`。

## Quality: the editorial review loop

Prose isn't done at "written". Quality is guarded by four things: input maturity (闸1-3), the writer's own craft, the **editorial review loop**, and the author's finalize.
- **Mode A (random review, in-flow, automatic)**: after the writer returns a draft, A00 delegates ONE `editorial-review` critic for a "好不好" read (drama / character & voice / POV / prose / structure & pacing / theme / reader experience), the writer revises ONCE, then the author does the whole-chapter finalize. Consistency is NOT checked here. The critic's opinions are transient — not persisted to `review-findings.md`.
- **Mode B (author-triggered)**: when the author asks to check quality / consistency / 全视角, A00 delegates editorial-review (好不好) and/or the consistency-checker (对不对); results persist to `process/review-findings.md`. Consistency runs only here.

## Adjustments bubble as reminders, never auto-cascade

小调整 = 场景 → beat（单章内）；大调整 = 多章场景需要动。改一层是否/如何向上/向下传播、是否重写正文 = **提醒作者，不主动做**（FR-6.2）。可一次规划相关几章的章纲（+ 可选 beat）再动笔。**提交时一致性提醒**：`git_commit` 若回头改已定稿章 / 走过重构 / 多章变更，则提醒先查一致性（改动章+影响面，非全书；提醒非硬锁）。

## status.md is a derived ledger, not truth

`.iwriter/status.md` records current stage / front / gate status / next step — but it is a **rebuildable projection**; ground truth is the object files' own `status` fields and existence. Reconcile any status.md claim with a targeted read; never trigger a startup global scan for it.
