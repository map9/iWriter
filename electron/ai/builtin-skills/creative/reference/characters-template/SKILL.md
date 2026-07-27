---
name: characters-template
description: 创建、读取、更新或校验 novel workspace 的 characters/ 文件时使用；定义角色登记表、重要角色档案和升格规则。
---

# 角色模板

**前置 Skill：** `novel-workspace`

## 管理对象

```text
{workspace}/characters/
  characters.md         # 必需：全部角色的唯一登记入口
  {slug}.md             # 懒创建：主角和重要角色的个人档案
```

角色对象只写相对稳定的人物事实与规划弧光；即时位置、伤势、持有物、关系胜负和当前弧光进度由 `outline/`、`manuscript/` 派生，不在人物档案重复维护。

## 角色登记表

`characters.md` 包含两个 H2 区域：

**已建档角色区域：** H2 `本地化名称（profiled-characters）`

表格列：

- `name-aliases`（必选）：姓名和别名。
- `importance-tier`（必选）：主角 / 重要配角 / 配角。
- `profile-ref`（必选）：指向 `characters/{slug}.md`；不在登记表复制档案内容。

**其他角色区域：** H2 `本地化名称（supporting-characters）`

表格列：

- `name-aliases`（必选）：姓名和别名。
- `importance-tier`（必选）：配角 / 路人。
- `story-function`（必选）：在叙事机器中的功能，不是性格标签。
- `visible-traits`（必选）：足以区分其说话、移动或行为的一句外显特征。
- `motivation`（必选）：在当前故事中的直接动机；不强制背景角色建立完整心理三角。
- `relation-to-protagonist`（必选）：与主角或核心群体的关系。
- `profile-status`（可选）：建档建议状态，例如“待决定”或“作者拒绝”。作者拒绝后没有新证据不得反复询问。

示例表头：

```markdown
## 其他角色（supporting-characters）

| 姓名与别名（name-aliases） | 重要性（importance-tier） | 功能定位（story-function） | 外显特征（visible-traits） | 动机（motivation） | 核心关系（relation-to-protagonist） |
| --- | --- | --- | --- | --- | --- |
```

## 个人档案

H2 字段：

- `name-aliases`（必选）：姓名、别名和称呼边界。
- `importance-tier`（必选）：主角 / 重要配角 / 配角。
- `story-function`（必选）：人物在叙事机器中制造的独特压力或作用。
- `visible-traits`（必选）：身体、年龄、阶层、职业、语域和可观察习惯；只保留会影响正文表现的事实。
- `desire`（必选）：核心欲望。
- `fear`（必选）：核心恐惧。
- `false-belief`（必选）：可被故事推翻或修正的错误认知，不能是“骄傲、善良”等标签。
- `default-strategy`（必选）：承压时惯用的争取、回避、控制、交换或攻击方式。
- `contradiction`（必选）：优点与缺陷如何来自同一根源。
- `arc`（必选）：规划的初始策略 → 递增测试 → 有代价的关键选择 → 可能达到的目标状态；不写当前进度。
- `relationships`（必选）：双向关系；A 对 B 的认知、欲求和筹码不能默认等于 B 对 A。
- `voice`（必选）：词汇、语速、句式、惯常回避和沉默点。
- `moral-line`（可选）：人物认为绝不能跨越的底线，以及被逼近时的风险。
- `background`（可选）：只写会被正文引用、能解释当前策略的经历。
- `key-abilities`（可选）：直接影响情节可行性的能力、资源和限制。

## 升格与校验

- 所有出现的角色都必须在 `characters.md` 有一行。
- 主角和重要配角必须建立个人档案。
- 其他角色满足任一条件时提议升格：在第二个不同章节有实质行动/对话；承担独立故事线；作者指定重要；登记表已经不足以解释其行为。
- 升格经一次作者审批；拒绝后记录状态，直到角色职责发生实质变化再提。
- 个人档案不得把“路人”列为 importance-tier；仍是路人时留在登记表。
- 字数增加不代表人物成立；语义质量由 `character-design` 任务验收。
