---
name: outline-template
description: 创建、读取、更新或校验 novel workspace 的总纲、卷纲和章纲时使用；定义三层提纲 schema、状态令牌与职责边界。
---

# 大纲模板

**前置 Skill：** `novel-workspace`

## 管理对象

```text
{workspace}/outline/
  master-outline.md     # 必需：全书因果骨架
  vol{NN}-outline.md    # 条件必需：启用卷纲后每卷一份
  ch{NNN}-outline.md    # 懒创建：写对应章节前必须存在
```

总纲和卷纲是事件/阶段级骨架；章纲是场景级直接写作依据。三类文件的 `status` 固定为 `draft` / `confirmed`，不随输出语言本地化。

## 总纲

`master-outline.md` 的 H2 字段：

- `status`（必选）：`draft` / `confirmed`。
- `premise`（必选）：与 `project.md` 一致，可展开为 1–3 句。
- `storylines`（必选）：至少包含主线；复线按作品需要存在。每条故事线使用 H3 分节，写推动者、戏剧问题、对抗来源、变化路径、主线交汇与闭合方式。
- `structure-nodes`（必选）：全书因果骨架。节点数量和结构法不固定；每个 H3 节点包含：
  - `entry-state`：进入节点时的承重状态；
  - `character-decision`：人物基于当前信息作出的决定；
  - `opposition-response`：对抗方或世界的回应；
  - `irreversible-change`：不可逆变化；
  - `cost-or-reveal`：代价或揭示；
  - `next-pressure`：由此产生的下一重压力；
  - `storyline-arc-refs`：推进的故事线和人物弧光。
- `theme-beats`（必选）：主题通过哪些具体选择及后果落地，引用结构节点。
- `arc-intersections`（必选）：主要人物弧光在哪些节点互相改变。
- `foreshadow-intents`（可选）：伏笔的叙事作用、真实指向和大致揭示节点；具体埋/强/收仍归章纲。
- `volume-index`（启用卷纲时必选）：各卷目标和对应文件引用。
- `candidate-directions`（可选）：只引用 `exploration/` 中尚未确认的方向，不把候选写成结构事实。

## 卷纲

`vol{NN}-outline.md` 的 H2 字段：

- `name`（必选）：卷名。
- `status`（必选）：`draft` / `confirmed`。
- `structural-role`（必选）：对应总纲的范围和本卷必须完成的变化。
- `dramatic-question`（必选）：贯穿本卷、卷末会得到阶段性回答的问题。
- `entry-state`（必选）：人物、关系、资源和信息的本卷入口状态。
- `core-conflict`（必选）：持续施压的对抗来源及其升级逻辑。
- `phase-shifts`（必选）：本卷因果阶段；每段写触发、人物策略、对抗回应、代价和新状态，不按章节数平均切割。
- `arc-stage`（必选）：主要人物本卷的测试、选择与阶段变化，引用角色完整弧光。
- `volume-climax`（必选）：本卷高潮中的关键决定、代价和兑现。
- `exit-state`（必选）：卷末具体状态和进入下一卷的新条件。
- `chapter-list`（必选）：按故事顺序列出本卷章纲文件；规划早期可以使用本地化待定占位符。
- `transition-notes`（可选）：与相邻卷的承接。

## 章纲

`ch{NNN}-outline.md` 的 H2 字段：

- `name`（必选）：章名。
- `status`（必选）：`draft` / `confirmed`。
- `structural-role`（必选）：对应总纲/卷纲的结构任务。
- `chapter-question`（必选）：本章由谁推动、要解决什么、主要阻力是什么。
- `entry-state`（必选）：本章开始时直接影响行动的状态。
- `scenes`（必选）：场景链。每个实例使用 `### 本地化名称（scene-N）`，其内部字段为 H4：
  - `location-time`（必选）：地点与时间；
  - `characters-pov`（必选）：出场人物与 POV；
  - `entry-state`（必选）：进入场景时的处境、认知或关系状态；
  - `goal`（必选）：POV 人物可验证的短期目标；
  - `conflict`（必选）：主动回应其策略的阻力；
  - `turn`（必选）：迫使人物改变策略、选择或理解的转折；
  - `outcome`（必选）：未达成、带代价达成、或达成后暴露新问题；
  - `causal-handoff`（必选）：结果怎样造成下一场或下一章的条件；
  - `tone-pacing`（可选）：情绪基调和戏剧速度；
  - `information-reveal`（可选）：读者与人物各自获得或仍缺失的信息。
- `exit-state`（必选）：本章结束后的承重状态。
- `storyline-advance`（可选）：推进的故事线引用。
- `foreshadow-ops`（可选）：本章具体埋、强化或回收的伏笔，含内容、真实作用和计划回收位置。
- `hook-cliffhanger`（可选）：由本章已有因果产生的开篇钩子或结尾悬念。
- `transition-notes`（可选）：与相邻章节的必要承接。

## 状态与边界

- Agent 新写或修改 `manuscript/ch{NNN}.md` 前，目标章纲必须存在、`status: confirmed`，且场景的 goal / conflict / outcome 完整；`novel-import` 机械导入既有正文的例外遵循 `novel-workspace`。
- `draft → confirmed` 只能由作者确认推动，不自动推进。
- 提纲只写故事事实，不写文风、措辞、镜头强调或给 writer 的操作指令。
- 伏笔的具体操作只在章纲 `foreshadow-ops` 维护；总纲只保留叙事意图，避免两份状态表漂移。
