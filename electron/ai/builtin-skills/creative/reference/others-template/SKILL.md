---
name: others-template
description: 创建、更新、迁移或结构校验 materials/cards.md、process/ 与 .iwriter/status.md 时使用；定义低摩擦卡片、紧凑过程记录与派生状态边界。
---

# 卡片、过程与状态模板

**前置 Skill：** `novel-workspace`

## 卡片池

`materials/cards.md` 是尚未确认或尚未归位的原子想法池。每张卡一个 H2：

```markdown
# 卡片

## 魏志红刀伤（card-weizhihong-injury）

陈默曾为魏志红打架受刀伤，住院两个月。

`设想 · 未归位 · 关联：char-chenmo、char-weizhihong`
```

- 内容默认一句话，不强制类型、时间或用途。
- 元数据压成一行，最多记录确定程度、位置和直接关联。
- 确定程度与位置是两件事：可以“已确认但未进入故事线”，也可以“设想中但已关联某条线”。
- 作者说“记一下”“先放着”时直接记录，不追问分类。
- 采用后把完整事实移动到唯一归属对象；原卡删除或仅保留去向指针，不保留副本。

## 过程文件

- `process/open-questions.md`：每项一个问题句，加必要上下文 ID；解决后写一行去向，不复述答案全文。
- `process/changelog.md`：只记已确认的重要变化、原因和对象 ID；不复制改前改后的故事内容。
- `process/review-findings.md`：保存确需跨会话处理的稿件缺陷、证据引用、严重度和状态；详细临时评审优先留在 `/large_tool_results/`。
- `.iwriter/status.md`：可丢弃的派生缓存，目标 500–1000 token；与正式对象冲突时始终以正式对象为准。

过程文件不是默认上下文。只有当前任务直接涉及未决问题、历史原因、遗留 finding 或恢复进度时才读取。
