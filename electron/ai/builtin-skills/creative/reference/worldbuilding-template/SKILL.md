---
name: worldbuilding-template
description: Use when creating, reading, updating, or validating worldbuilding/ files in a novel workspace.
---

# 世界设定模板

**前置 Skill：** `novel-workspace`（含文件格式约定）

## 管理对象

```text
{workspace}/worldbuilding/
  worldbuilding.md      # 必需：设定主文件，一级标题「世界设定」
  factions.md           # 可选：factions 拆出，一级标题「阵营势力」
  geography.md          # 可选：geography-locations 拆出，一级标题「地理环境」
  items.md              # 可选：key-items 拆出，一级标题「关键物品」
```

拆分：字段规模变大后其小节独立成对应文件，文件一级标题＝该字段名（随输出语言本地化），原小节内容照搬（其中三级标题提升为二级）；主文件该字段小节改为一行引用（如 `→ factions.md`）。

## 字段约定

主文件一级标题：`世界设定`。设定只写恒定定义；当前状态（物品此刻在谁手里、阵营敌友态势）属剧情，以 `outline/`、`manuscript/` 为准。

- `rule-systems`（必选）：规则体系。力量 / 科技 / 社会的运作规则，每条一项；每条写明"何时被测试、违反的后果"，不是背景介绍。
- `forbidden-zones`（必选）：禁区。作品硬禁忌（设定矛盾与创作禁止项），每条一项并写明原因。
- `era`（可选）：时代背景。历史时期、历法；架空题材写明架空起点与程度。
- `factions`（可选）：阵营势力。每个阵营 / 势力 / 族群一个三级标题分节，写其诉求、内部结构、与主角关系。
- `geography-locations`（可选）：地理环境。总述世界结构、大陆与区域、气候生态；重要城镇 / 场景各一个三级标题分节。
- `history-timeline`（可选）：历史沿革。世界历史线、重大事件、故事时间线，按时间列项。
- `key-items`（可选）：关键物品。列表，每条一件物品｛意义或功能，约束，归属追踪要点｝；只登记带专属规则、需跨章追踪、或剧情核心（麦高芬）的物品。
- `terminology`（可选）：名词体系。表格（标准写法 ｜ 类型 ｜ 说明）；有归属对象的专名（角色 / 地名 / 阵营）不在此重复。

## 要点

- `worldbuilding.md` 必需，必含 `rule-systems`、`forbidden-zones`。
- 改 `rule-systems` / `forbidden-zones` 时提示下游（人物 / 提纲 / 正文）可能需复核，不自动改。
