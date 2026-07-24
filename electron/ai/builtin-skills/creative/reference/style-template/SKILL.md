---
name: style-template
description: Use when creating, reading, updating, or validating styles/ writing-style objects in a novel workspace.
---

# 风格模板

**前置 Skill：** `novel-workspace`（含文件格式约定）

## 管理对象

```text
{workspace}/styles/
  {slug}.md    # 可选、懒创建：一套可复用的全局写作风格，一级标题＝风格名
```

风格对象是"项目专属技能"（一套可操作的生成技术），不是故事事实，故独立于 `worldbuilding/`、`characters/`。主锚是 `exemplar`（具体范文）。生效的风格由 `project.md` 的 `style` 字段指向。

## 字段约定

`exemplar` 是主锚：一段具体范文胜过一堆分析描述。`profile` 是围绕范文的整体描述，均非逐条规则清单——过度堆 craft 规则会让正文变差。

- `exemplar`（必选）：范文，主锚。一到几段能代表目标嗓子的具体正文，覆盖叙述 / 对话 / 描写 / 情感处理等关键侧面；写稿时照这个嗓子写、别照抄内容。提取要求：从作者认可的来源正文中选取，由作者亲写 / 亲选 / 亲改（不由 agent 代写），长度以能传达嗓子为准。
- `source-author`（可选）：来源。一句话说明提炼自谁 / 哪部作品。
- `profile`（可选）：文风画像。用词 / 句式 / 节奏 / 对话 / 描写等习惯的整体描述（一段连贯文字，非逐条清单）。提取要求：从范文或作者已定稿章节中提炼这些习惯，写成连贯描述。
- `avoid`（可选）：想避开的写法或作品。

## 要点

- `exemplar` 是主锚：writer 模仿范文的嗓子，不是勾选清单；`profile` 是可选轻支撑，故意精简（过度堆 craft 规则会让正文变差）。
- `exemplar` 由作者拥有（亲写 / 亲选 / 亲改）；`profile` 可由 agent 提炼。
- 风格全局生效，不做 per-character（角色嗓子归 `characters/` 的 `voice`）。