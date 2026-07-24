---
name: outline-template
description: Use when creating, reading, updating, or validating outline files (master / volume / chapter outlines) in a novel workspace.
---

# 大纲模板

**前置 Skill：** `novel-workspace`（含文件格式约定）

## 管理对象

```text
{workspace}/outline/
  master-outline.md     # 必需：全书结构骨架，一级标题「总纲」
  vol{NN}-outline.md    # 条件必需：启用卷纲后每卷一份，一级标题＝卷名（未定用「第N卷」）
  ch{NNN}-outline.md    # 懒创建：每章一份，章节正文的写作前提，一级标题＝章名（未定用「第N章」）
```

是否启用卷纲层由 `project.md` 的 `scale-plan`（是否分卷）决定。总纲粗（全书一份）、卷纲细（一卷一文件）、章纲承重（scenes）。

## 字段约定

`status` 用固定令牌 `draft` / `confirmed`——写作授权闸靠它判断，**不随输出语言本地化**（旧数据中文令牌 `草稿中` / `已确认` 等价识别）。字数为质量建议，非结构合法性依据。

**总纲 `master-outline.md`**（一级标题「总纲」）——

- `status`（必选）：`draft` / `confirmed`。
- `premise`（必选）：故事核心句，与 `project.md` 一致，可展开 2–3 句。
- `theme-beats`（必选）：主题落点，主题通过哪几个具体情节事件落地，每个指向大致结构节点。
- `storylines`（必选）：故事线。主线 + 复线，每条一个三级标题分节，写走向 + 与主线交汇点。
- `structure-nodes`（必选）：全书结构骨架。默认 8 个题材中立节点（开篇钩子 / 激励事件 / 早期试炼 / 中点转折 / 危机加深 / 至暗时刻 / 高潮 / 结局余波），每节点一个三级标题分节，填｛发生什么（20–60 字），大致章节区间，推进哪条 storyline + 哪个角色 arc｝。
- `arc-intersections`（必选）：人物弧光交汇点，主要角色弧光在哪些结构节点交汇 / 冲突（跨角色，弧光正身在 `characters/`）。
- `volume-index`（启用卷纲必选）：各卷目标 + 指向 `vol{NN}-outline.md`；未启用卷纲时不写，`structure-nodes` 的章节区间即索引。
- `candidate-directions`（可选）：主线未收敛方向，标"候选"并指向 `exploration/`。

**卷纲 `vol{NN}-outline.md`**（一级标题＝卷名）——

- `status`（必选）：`draft` / `confirmed`。
- `structural-role`（必选）：对应总纲哪段弧线 / 哪些结构节点（引用，不重列结构）。
- `core-conflict`（必选）：本卷核心冲突 / 阶段性主要阻碍。
- `arc-stage`（必选）：各主要角色本卷弧光推进到哪阶段、衔接上卷末（引用 `characters/` 的 arc，不复述全弧）。
- `volume-climax`（必选）：本卷高潮 + 收尾状态。
- `chapter-list`（必选）：本卷章节文件名，按故事序。
- `transition-notes`（可选）：与上一卷承接、给下一卷的铺垫。

**章纲 `ch{NNN}-outline.md`**（一级标题＝章名）——

- `structural-role`（必选）：对应总纲 / 卷纲哪个结构节点。
- `status`（必选）：`draft` / `confirmed`。
- `scenes`（必选）：核心，只写戏剧内容（发生什么），不规定文风、措辞与行文。每个场景一个三级标题分节（`### 场景-N`），含子项（四级标题）：`location-time`\*、`characters-pov`\*、`goal`\*（15–50 字，可验证是否达成）、`conflict`\*（15–60 字，写清阻碍来源）、`outcome`\*（20–70 字，达成但代价更大 / 未达成 / 达成但揭示新问题——不能是顺利达成）、`tone-pacing`、`information-reveal`（\* 必选）。场景无独立 status，状态以章纲文件为单位。
- `storyline-advance`（可选）：本章推进哪条 storyline（引用总纲）。
- `foreshadow-ops`（可选）：本章埋 / 强化 / 收哪根伏笔 + 内容 + 计划回收章。伏笔的源头，不做全书总表。
- `hook-cliffhanger`（可选）：开篇钩子 / 结尾悬念。
- `transition-notes`（可选）：与上一章承接、给下一章的过渡。

## 要点

- `master-outline.md` 必需；启用卷纲后每有效卷必须有 `vol{NN}-outline.md`；写章节正文前该章必须有 `confirmed` 的 `ch{NNN}-outline.md`。
- `status` `draft → confirmed` 是前提闸，不自动推进。
- 章纲才有"提纲的价值"：拿到 scenes 能直接知道写什么冲突与转折，而不是一句"去找某人问线索"自己现编。
- 伏笔只在章纲 `foreshadow-ops` 登记；全书伏笔状态、故事线与弧光的实际进度都属实际态，由 agent 派生，不在 outline 存。
