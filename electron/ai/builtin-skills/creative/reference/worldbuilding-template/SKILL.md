---
name: worldbuilding-template
description: 创建、读取、更新或校验 novel workspace 的 worldbuilding/ 文件时使用；定义世界设定对象的 schema、拆分和结构规则。
---

# 世界设定模板

**前置 Skill：** `novel-workspace`

## 管理对象

```text
{workspace}/worldbuilding/
  worldbuilding.md      # 必需：设定主文件
  factions.md           # 可选：阵营规模增长后拆出
  geography.md          # 可选：地理与地点规模增长后拆出
  items.md              # 可选：关键物品规模增长后拆出
```

设定对象只写相对稳定的定义；人物、物品或势力的当前剧情状态以 `outline/` 和 `manuscript/` 为准。

## 主文件字段

H2 字段：

- `rule-systems`（必选）：故事依赖的力量、科技、社会或制度规则。复杂规则使用 H3 分节，每项至少说明：
  - `definition`：规则定义与适用范围；
  - `cost-limit`：使用成本、限制或例外；
  - `enforcement-consequence`：谁执行，或违反后发生什么；
  - `story-pressure`：这条规则会怎样改变人物选择或情节可行性。
- `forbidden-zones`（必选）：作品不能违反的设定禁区。每项说明禁区和破坏的设定根基；不能把临时写作偏好放在这里。
- `era`（可选）：时代、历法、架空起点和虚构程度。
- `factions`（可选）：每个阵营使用 H3 分节，记录目标、资源、内部张力和与核心冲突的关系；规模增长后迁至 `factions.md`。
- `geography-locations`（条件可选）：地理、生态、聚落、交通与故事地点。只有当地理会改变资源、行动空间或冲突时才需要展开；规模增长后迁至 `geography.md`。
- `history-timeline`（可选）：与当前故事因果相关的历史事件和时间锚点。
- `key-items`（可选）：仅登记具有专属规则、需跨章追踪或驱动剧情的物品；规模增长后迁至 `items.md`。
- `terminology`（可选）：长尾名词的标准写法。

## 拆分规则

字段规模增长后可独立成对应文件：

1. 将原字段内容原样移动，不改写事实。
2. 主文件保留原 H2 字段，并将内容改为相对引用，例如 `→ factions.md`。
3. 独立文件继续使用本模板中对应对象的字段结构。

## 语义边界与影响

- `geography-locations` 不是所有题材的强制字段；不得为室内剧、现实短篇等无关作品强造宏大地理。
- 规则条目若只有背景介绍、没有边界或故事压力，结构可以合法，但语义验收不通过。
- 不得把物品当前持有人、角色当前位置、阵营当前胜负等动态事实写成恒定定义。
- 修改 `rule-systems` 或 `forbidden-zones` 时提示人物、提纲与正文可能需要复核，不自动修改。
