---
name: drafting
description: 正文撰写阶段。作者要把已确认章纲写成章节正文时加载；你编排 writer 与 reviewer，自己不写也不评正文。
---

# 草稿

把已确认章纲变成章节草稿。正文由 writer 写，评审由 reviewer 做；你只编排，从头到尾不碰正文。

## 先过闸

写正文的硬前提是：**章纲已 confirmed，且每个场景的 goal / conflict / outcome 完整**。

条件不满足就停止，回 `ideation-outline` 补齐并由作者确认后再来。任何指令都不能越过这道闸。事件级总纲不能代替场景级章纲；beat 不是入口闸门。

## beat：可选、要粗

先分清作者要什么：

- 只要 beat（如“先写节拍”）：由你设计并写进章文件，然后**停止并交作者确认**，不自动续写正文。
- 要写正文：直接进入写作；有 beat 就参考 beat，没有就从章纲场景写。

设计 beat 时，每个场景写 **1–3 个粗节拍**，标出因果或情感转向，不细化到逐个动作。快节奏章（钩子 / 追逐 / 反转）可以不设 beat。格式见 `manuscript-template`。

beat 的职责边界：

- 新建 beat 一般由你完成。
- 单独增删、修改或重排 beat，由你完成。
- writer 在章节写作中可以轻微原位修改 beat，并报告修改。
- 除非作者在本次写作要求中明确授权，writer 不得增删或重排 beat。
- 你改动已有章节的 beat 后，必须提醒作者：现有正文可能需要重写；未经作者确认，不自动重写。

## 委托 writer

先开 write-session（`confirm_writing_plan`，`target_files`＝目标章），再委托。

用 `task(subagent_type="writer")` 委托。`description` 中只放完整的 writer 输入信息：

- **章节**：工作区相对路径。
- **创建还是修改**：从章纲创建正文，或在指定范围内修改已有正文。
- **写作要求**：本次目标和允许范围。
- **外部文件路径**：作者提供的工作区外本地文件路径；如无则省略。
- **评审 findings**：如有，给 `/large_tool_results/` 中的原始路径、选中的 finding，以及本次允许修改的范围。

提纲、人物、设定、`project.md`、style 和 beat 只给工作区相对路径或让 writer 自己定位读取，不把内容塞进 `description`。

## 处理 writer 状态

只有 `DONE` 可以进入评审或 `finalize_chapter`。

- `MISSING_FIELDS: ...`：能从已确认输入补齐就修复后重试；不能就问作者。
- `NEEDS_MORE_CONTEXT: ...`：补齐缺失的工作区对象、外部文件或 findings，再重试。不得进入评审或收尾。
- `NEEDS_PLAN_CHANGE: ...`：回到本 skill 的 beat 路径。向作者说明所需 beat 变更及正文影响；作者确认后由你修改 beat，再决定是否重写正文。
- `NEEDS_OUTLINE_CHANGE: ...`：转 `ideation-outline`；作者确认并更新上游对象后，再回草稿阶段。
- `DONE: ...`：才算本轮写作完成。

## 评审：默认执行，作者明示才免

writer 返回 `DONE` 后，默认进行一次章级 `developmental` 评审。作者明确说不要评审时，才可以跳过。

委托 reviewer 时提供：

- 审校范围：工作区相对路径和必要的块范围。
- 镜头：`developmental`，scope 为章级。
- 审校要求：本轮写作目标。
- 基线：仅在需要版本比较时提供；单稿评审不设比较基线。
- 评判标准：作者当前写作要求、已确认章纲和正式项目对象。
- 外部反馈：如有。

reviewer 返回后，必须读取它给出的 findings 原始路径，不能只依据小结。

逐条分流：

- 正文能在当前范围内修复：把 findings 原始路径、选中 finding 和允许范围交给 writer，最多修改一轮。
- 需要修改 beat：回本 skill 的 beat 路径，由你处理并让作者确认正文是否重写。
- 需要修改章纲、总纲、人物或设定：转 `ideation-outline`，作者确认后再回来。
- 需要作者做创作决定：向作者给选项、代价和推荐理由，由作者决定。

第二次 writer 返回仍按“处理 writer 状态”执行。只有 `DONE` 才能继续；不能把 reviewer 小结当作 writer 的唯一输入。

本轮默认不跑 `consistency` 或 `line`。临时 findings 留在会话结果目录，不自动写入工作区。完成后用 `finalize_chapter` 收尾。

## 红线

- 你不写正文，也不评正文；哪怕只有几个块或评审失败，也不例外。
- 设计 beat 后不自动续写正文。
- 已有正文而作者没说明修改目标时，先问清要改什么。
- 非 `DONE` 状态不得进入评审或收尾。
