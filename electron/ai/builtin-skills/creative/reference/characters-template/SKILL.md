---
name: characters-template
description: Use when creating, reading, updating, or validating characters/ files (the registry and individual profiles) in a novel workspace.
---

# 角色模板

**前置 Skill：** `novel-workspace`（含文件格式约定）

## 管理对象

```text
{workspace}/characters/
  characters.md         # 必需：全部角色登记表，一级标题「角色登记」
  {slug}.md             # 懒创建：升格后的重要角色个人档案，一级标题＝角色名
```

## 字段约定

角色只写安定事实；当前状态属剧情（看 `outline/`、`manuscript/`），不存出场章节索引（`find_references` 按需解析）。

**登记表 `characters.md`**：表格，一级标题「角色登记」，整表替换编辑，列头随输出语言本地化。列——

- `name`（必选）：姓名。
- `profile-status`（必选）：档案状态，`合集内` / `已升格`。
- `story-function`（合集内必选）：功能定位，一词。
- `relation-to-protagonist`（合集内必选）：与主角关系，一句。
- `notable-traits`（合集内必选）：显著特征，1–2 句够区分声音即可。
- `profile-ref`（已升格必选）：独立档案引用，如 `→ characters/{slug}.md`；已升格只填此列，其余列留空。
- `aliases`（可选）：别名，供 `find_references` 解析（合集内角色无独立 name-aliases 时用此列补位）。

**个人档案 `{slug}.md`**：H2 字段，一级标题＝角色名。字数为质量建议，非结构合法性依据。字段——

- `name-aliases`（必选）：姓名 / 别名。
- `importance-tier`（必选）：角色重要性，主角 / 重要配角 / 配角。
- `story-function`（必选）：功能定位，在叙事机器里承担的功能（导师 / 对手 / 催化者…），不是性格描述；一句内。
- `visible-traits`（必选）：外显特征。20–60 字，性别 / 年龄 / 身体 / 阶层 / 职业 / 语域；说话、移动、情绪外露应能从这组机械推导。
- `desire`（必选）：核心欲望。10–40 字，心理三角。
- `fear`（必选）：核心恐惧。10–40 字，心理三角。
- `false-belief`（必选）：虚假信念。15–50 字，心理三角；须是可被推翻的错误认知，"他很骄傲"这类标签不算。
- `arc`（必选）：成长弧光。15–50 字，规划的初始状态 → 目标状态；角色当前走到哪属实际态，由 agent 从正文 / 纲要派生，不写此处。
- `relationships`（必选）：关系网络。双向标注——A 对 B 的认知 ≠ B 对 A，这种不对称常是冲突源。
- `voice`（必选）：声音特征。15–50 字，词汇 / 语速节奏 / 惯常沉默点。
- `key-abilities`（可选）：关键能力 / 资源。仅当直接影响情节可行性时才填。
- `background`（可选）：独特背景。只写会被正文引用到的过去经历。

## 要点

- 所有角色在 `characters.md` 有一行；升格只留一句 `→ characters/{slug}.md`，不复制内容。
- 升格触发（任一）：第 2 个不同章节有实质动作 / 对话；作者指定重要；承担独立副线。
- 重要角色（已建档 + 待处理）≤ 5 时可继续留合集；超过后新升格走一次审批（作者可拒，留标记下次再问）；某条目显著特征超 3–4 句时提议建档。
- 不自动降级；不存出场索引与当前状态。
