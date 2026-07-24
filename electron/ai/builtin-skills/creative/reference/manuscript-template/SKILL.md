---
name: manuscript-template
description: Use when creating, reading, updating, or validating manuscript/ chapter prose files in a novel workspace.
---

# 正文模板

**前置 Skill：** `novel-workspace`（含文件格式约定）

## 管理对象

```text
{workspace}/manuscript/
  ch{NNN}.md    # 懒创建：章节正文，一级标题＝章名（与该章 ch{NNN}-outline 一致）
```

写正文前该章须有 `confirmed` 的 `ch{NNN}-outline.md`（依赖见 novel-workspace）。正文是"实际发生了什么"的真相来源，实际态派生自此。

## 内容结构

正文文件含三类内容；`> [!TYPE]` GFM Alert 靠 TYPE 区分（TYPE 是固定标记、不本地化，标记内文字用输出语言）：

- **正文**：段落文字。
- **情感节拍 `[!BEAT]`**：`> [!BEAT] [scene-N-beat-M] 一句情感 / 叙事转向`。
  - `[!BEAT]` 是提取锚点（靠标记找，不靠坐标正则）；磁盘上 `\[…\]` 转义等价。
  - 坐标 `[scene-N-beat-M]` 标明对应的提纲场景，agent 需要遵守，但作者可能会不遵守，这个不是强制约定。
  - 内容为一句因果必要的情感 / 叙事转向，不带解释尾、文风指令、逐句措辞。
  - 场景间用 `* * *` 分隔；agent 写入时，同场景内 beat 之间空一行，避免相邻无空行会并成一个 alert。
- **注释 `[!TYPE]`**：除 `[!BEAT]` 外的其他 GFM Alert（`NOTE` / `COMMENT` / `WARNING` / `TIP`…），TYPE 表注释类型，非正文。

## 要点

- `ch{NNN}.md` 懒创建；写正文前该章须有 `confirmed` 的 `ch{NNN}-outline.md`。
- 正文是实际态的真相来源；伏笔实际状态、角色处境等派生自此，不回写规划对象。
