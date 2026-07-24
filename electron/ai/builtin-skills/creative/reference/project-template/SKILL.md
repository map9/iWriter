---
name: project-template
description: Use when creating, reading, updating, or validating the root project.md file in a novel workspace.
---

# 项目模板

**前置 Skill：** `novel-workspace`（含文件格式约定）

## 管理对象

```text
{workspace}/project.md      # 必需：作品级立项信息的唯一来源
```

保存进入世界观 / 人物 / 提纲设计前需先定的核心决策；其他内容按 `novel-workspace` 的对象归属处理。

## 字段约定

文件一级标题：`小说项目`。字数为质量建议，非结构合法性依据。

- `title`（必选）：书名。1–30 字，可暂定。
- `genre-tags`（必选）：题材与标签。2–6 个自由标签。
- `premise`（必选）：故事核心句。40–80 字，含主角、目标、核心阻碍、失败代价。
- `theme`（必选）：主题命题。15–50 字，可争论的完整命题，不能只是主题词。
- `reader-promise`（必选）：读者承诺。20–80 字，作品需持续兑现的主要阅读体验。
- `core-change`（必选）：核心变化。20–80 字，什么对象从什么状态变为什么状态。
- `narrative-engine`（必选）：叙事发动机。30–100 字，能反复产生事件 / 选择 / 升级 / 揭示 / 悬念的机制，不是一次性开端。
- `scale-plan`（必选）：篇幅规划。子项用列表：作品形态、预计总字数、预计章节数、每章目标字数、是否分卷、预计卷数；不适用的填 `不适用`。
- `target-audience`（可选）：目标读者。阅读偏好、类型经验、接受度、阅读动机。
- `narrative-pov`（可选）：叙事视角。第一人称 / 第三人称有限 / 第三人称全知 / 多视角；未指定默认第三人称。
- `style`（可选）：全局写作风格，指向 `styles/{slug}.md`（如 `→ styles/main.md`）；缺省即无风格约束。

## 要点

- 创建须含全部必选字段；未知填 `待确定`，不编造。
- 二级标题的英文标识不改、不复用。
- 改 `premise` / `theme` / `reader-promise` / `core-change` / `narrative-engine` 时，提示世界观 / 人物 / 提纲可能需复核，不自动改下游。
- 调整 `style` 需向作者确认，并提醒这是对 project 的改动。
