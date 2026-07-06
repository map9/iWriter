---
name: materials-and-process-schema
description: Read before creating or editing materials/fragments.md or process/ objects (open-questions, changelog, review-findings) or the derived .iwriter/status.md cache. Defines their fields and boundaries.
---

# materials/ 与 process/ 字段规范（素材 + 过程对象）

创建或修改素材/过程对象前读本技能。字段用 kebab-case 标识，按标题分节。这些对象承载捕获、决策、叙事、审校结果，各有明确边界，不要混用。

## `materials/fragments.md`（素材对象，单文件，多条目）

素材捕获区 + 路由前暂存区，涵盖一句对话、一个场景念头、一个人物细节、一个伏笔想法等归宿不同的碎片。

| 字段（英文标识） | 必选/可选 | 说明 |
| --- | --- | --- |
| 原始内容 (raw-content) | 必选 | 一句话/几个词/情绪/问题，**不强制作者分类**——零摩擦记录是核心价值 |
| 采用状态 (adoption-status) | 必选 | 未采用 / 已采用 |
| 类型 (type) | 必选 | 场景念头 / 对话片段 / 人物细节 / 伏笔想法 / 情绪意象 / 调研笔记 / 未分类——**agent 在处理相关任务时顺带标注**，作为编辑动作提交审批 |
| 记录时间 (recorded-at) | 必选 | 用于按时序排序 |
| 关联线索 (related-refs) | 可选 | 可能关联的角色/章节/结构节点 |
| 采用去向 (adopted-into) | 条件必选（已采用） | 被并入了哪个对象文件 |

agent 不要求作者记录时分类，但在合适时机（如下次涉及相关对象的任务）主动提议"这条碎片要不要并入 XX"，由作者决定。

### 示例

```markdown
# materials/fragments.md

## 老周左手缺两指

### 原始内容
老周左手缺了两指，是旧工伤，握手时会下意识把手藏在背后。

### 类型
人物细节

### 记录时间
2026-03-02

### 关联线索
老周，ch003.md

### 采用状态
已采用

### 采用去向
并入 characters/老周.md 的外显特征
```

## `process/open-questions.md`（过程对象，单文件）

登记**创作决策层面**悬而未决的问题——故事该怎么走、设定有没有矛盾——不是开发缺陷或技术 TODO。**与 review-findings 的边界**：open-questions 登记"作者要做的选择"（决策问题），review-findings 登记"稿件要修的错"（执行性缺陷）。

字段：问题描述 (question)*、出现章节/上下文 (context-ref)*、提出时间 (raised-at)*、状态 (status)*（待决策 / 已解决）、解决后归档去向 (resolved-into)（已解决时条件必选，记录指向哪个文件）。

## `process/changelog.md`（过程对象，单文件）

承担**累积性创作叙事**：用人类语言记录"这次为什么这么改、对故事产生了什么影响"——git commit message 不会写、`.iwriter/status.md`（无历史的即时快照）也不承担。单文件追加写，按时间顺序堆叠。只记录已确认的重要变化，不是每次工具调用的自动流水账。

字段：时间/版本号 (timestamp-version)*、变更摘要 (summary)*、影响范围 (scope)*（涉及哪些对象文件/章节）、触发原因 (trigger)*（大修 / 精修 / 问题修补 / 版本回退）。

## `process/review-findings.md`（过程对象，单文件，多条目，可选懒创建）

审校结果与外部反馈问题清单的**持久化落点**（跨会话载体）。SA03 只读、结果以响应文本回传；本文件由 **A00 落盘**（经普通编辑审批）：全稿审校与外部反馈整理默认提议落盘，局部自查默认只在对话呈现、作者要求时才落盘。修订任务以本文件为输入，修复后顺带更新条目状态（经审批）。

字段：问题描述 (finding)*、等级 (severity)*（高/中/低）、依据对象/位置 (evidence-refs)*、来源 (source)*（agent 自查（附核查颗粒度/批次）/ 外部反馈）、建议 (suggestion)*、记录时间 (recorded-at)*、状态 (status)*（待处理 / 已修复 / 已忽略）、处理去向 (resolved-into)（已修复时条件必选）。

## `.iwriter/status.md`（可选派生状态摘要缓存）

**不是数据源**，是可丢弃、可重建、按需读取的派生摘要缓存，目标 500-1000 token。系统不在会话启动时为它主动执行全局 diff / mtime 扫描 / 全量重建；只有任务确实需要快速全局态势、且逐个读取正式对象成本过高时，才读取或提议重建。缺失/过期/与正式对象冲突时，不能凭它推断，也不应默认打断作者——正确做法是按当前任务读取相关正式对象。

字段：重建时间 (rebuilt-at)*、当前进度 (progress)、角色状态摘要 (character-status-digest)、开放伏笔摘要 (open-threads-digest)、写作约束摘要 (writing-constraints-digest)、待解决摘要 (open-questions-digest)。所有摘要字段只作快速提示、指向正式对象，不替代读取正式对象。不存在"作者直接编辑 status.md 改设定"的用法——改设定改 `worldbuilding.md` 本身。
