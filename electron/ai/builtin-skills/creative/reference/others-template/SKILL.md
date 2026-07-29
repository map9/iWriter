---
name: others-template
description: 创建、读取、更新或校验 materials/、process/ 与 .iwriter/status.md 时使用；定义素材、待决问题、变更、评审结果和派生状态对象。
---

# 素材 / 过程 / 状态模板

**前置 Skill：** `novel-workspace`

## 管理对象

```text
{workspace}/
  materials/fragments.md         # 可选：素材捕获，单文件多条目
  process/open-questions.md      # 可选：待决创作抉择
  process/changelog.md           # 可选：累积创作叙事，追加写
  process/review-findings.md     # 可选、懒创建：审校 / 反馈缺陷清单（跨会话）
  .iwriter/status.md             # 可选：派生状态摘要缓存（可丢弃、非真相）
```

## 字段约定

**`materials/fragments.md`**（每条一个三级标题分节）
- `raw-content`（必选）：原始内容——一句话 / 几个词 / 情绪 / 问题，不强制分类。
- `type`（必选）：场景念头 / 对话片段 / 人物细节 / 伏笔想法 / 情绪意象 / 调研笔记 / 未分类。
- `recorded-at`（必选）：记录时间，按时序排。
- `adoption-status`（必选）：未采用 / 已采用。
- `related-refs`（可选）：可能关联的角色 / 章节 / 结构节点。
- `adopted-into`（已采用必选）：并入了哪个对象文件。

**`process/open-questions.md`**（待决创作抉择，非技术 TODO；表格或分条）
- `question`（必选）：问题描述。
- `context-ref`（必选）：出现章节 / 上下文。
- `raised-at`（必选）：提出时间。
- `status`（必选）：待决策 / 已解决。
- `resolved-into`（已解决必选）：解决后归档去向。

**`process/changelog.md`**（累积创作叙事，追加写、按时序；只记已确认的重要变化）
- `timestamp-version`（必选）：时间 / 版本号。
- `summary`（必选）：为什么这么改、对故事的影响。
- `scope`（必选）：影响的对象 / 章节。
- `trigger`（必选）：大修 / 精修 / 问题修补 / 版本回退。

**`process/review-findings.md`**（审校 / 反馈缺陷清单，跨会话载体）
- `finding`（必选）：问题描述。
- `severity`（必选）：`BLOCKING` / `MAJOR` / `MINOR` / `OPTIONAL`（与 reviewer 一致）。
- `evidence-refs`（必选）：依据对象 / 块位置。
- `source`（必选）：agent 评审（附镜头 / 范围）/ 外部反馈。
- `suggestion`（必选）：建议。
- `recorded-at`（必选）：记录时间。
- `status`（必选）：待处理 / 已修复 / 已忽略。
- `resolved-into`（已修复必选）：处理去向。

reviewer 只读、结果以响应回传；本文件由主 agent 落盘（普通编辑审批），落盘规则见 `revision-playbook`。

**`.iwriter/status.md`**（派生状态摘要缓存，目标 500–1000 token）
- `rebuilt-at`（必选）：重建时间。
- `progress`（可选）：当前进度。
- `character-status-digest` / `open-threads-digest` / `writing-constraints-digest` / `open-questions-digest`（可选）：各类摘要，只作快速提示、指向正式对象。

## 要点

- 五个对象边界不混用：捕获 `materials/` · 决策 `open-questions` · 叙事 `changelog` · 稿件缺陷 `review-findings` · 派生态 `status`。
- **`review-findings`＝具体稿件缺陷；`open-questions`＝待定创作抉择**。
- `fragments` 零摩擦：不强制作者记录时分类；agent 在合适时机提议并入某对象，作者决定。
- `status.md` 是可丢弃、可重建的**派生缓存、非真相**：系统不在启动时为它全局扫描 / 重建；缺失 / 过期 / 与正式对象冲突时以正式对象为准，不据它推断、不据它打断作者。改设定改 `worldbuilding.md` 本身，不改 `status.md`。
