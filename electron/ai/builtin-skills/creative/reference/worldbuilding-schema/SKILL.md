---
name: worldbuilding-schema
description: Read before creating or editing worldbuilding/ objects (rules, forbidden-zones, factions, key-items, terminology). Defines required fields and the "no current-state" rule.
---

# worldbuilding/worldbuilding.md 字段规范（设定对象）

创建或修改设定对象前读本技能。字段用 kebab-case 标识，按标题分节（H3 `###`）。设定只写**恒定定义**，不写随剧情变化的当前状态。

## 字段

| 字段（英文标识） | 必选/可选 | 说明 |
| --- | --- | --- |
| 规则体系 (rule-systems) | 必选 | 题材相关：magic system / 科技水平 / 社会运作规则；现实主义题材可填"无超自然规则，遵循现实社会运作规则"。要求写到"这条规则在什么情况下会被测试/违反会怎样"，不是纯背景介绍 |
| 禁区 (forbidden-zones) | 必选 | 绝对不能出现的设定矛盾，必须写明原因（"因为 X 会破坏 Y 设定的根基"，不是只列"不能做 X"） |
| 时代背景 (era) | 可选 | — |
| 阵营与势力 (factions) | 可选 | 每个阵营的诉求、与主角的关系；规模变大后拆到 `factions.md` |
| 地理信息 (geography-locations) | 可选 | 地理、城镇、地图、场景档案；规模变大后拆到 `geography.md` |
| 历史沿革 (history-timeline) | 可选 | 世界历史、故事时间线、重大历史事件 |
| 关键物品 (key-items) | 可选 | 只登记满足以下之一的物品：带专属规则/约束、需跨章追踪归属或状态、或本身是剧情驱动核心（麦高芬）。普通道具不登记。每条写 {意义/功能, 约束规则, 归属流转的追踪要点}。只写**恒定定义**——物品的**当前状态**（此刻在谁手里/是否损坏）是剧情，权威来源是 `outline/` 与 `manuscript/`。物品**特有**约束写此；若是某套普适系统的实例，系统规则留在 rule-systems，此处只写特有部分并引用系统。规模变大后拆到 `items.md` |
| 名词体系 (terminology) | 可选 | 长尾专名的标准写法登记处（招式名、黑话、次要物品名、特殊概念）。**有归属对象的专名不在此重复登记**（主角名在 `characters/` 的 name-aliases、地名在 geography、阵营名在 factions）——避免冗余与漂移 |

规模增长后可拆分为 `worldbuilding.md`（规则/时代/历史）+ `factions.md`（阵营）+ `items.md`（关键物品）；拆分时机由 agent 判断（"够用就不拆"），不强制预先拆分。

## 完整示例

```markdown
# worldbuilding/worldbuilding.md

### 规则体系
无超自然规则，遵循现实社会运作规则；黑帮势力的运作逻辑遵循"人情债优先于法律"

### 禁区
阿坤不能轻易诉诸暴力解决问题——因为这会摧毁"他已经改过自新"这条主题落点的根基

### 时代背景
当代，南方某港口城市

### 阵营与势力
→ worldbuilding/factions.md

### 关键物品
- **那本旧账本**：记录了和盛帮二十年的走私流水，是全书的核心筹码（剧情驱动核心）。约束：账本一旦公开，阿坤和老周的攻守关系立刻反转，不能在第三幕前泄露内容。（当前在谁手里 → 以 outline/manuscript 当前叙述为准，不在此登记）

### 名词体系
| 标准写法 | 类型 | 说明 |
| --- | --- | --- |
| 跑单 | 黑话 | 帮内指"临时接一趟走私运输"，勿写作"跑腿" |
| 收线 | 黑话 | 指"结清一笔人情债"，与"收工"区分 |
```

（注：主角名"阿坤/陈国坤"不列名词体系表——权威写法在 `characters/阿坤.md` 的 name-aliases；"和盛帮"在 factions。本表只收没有归属对象的长尾专名。）
