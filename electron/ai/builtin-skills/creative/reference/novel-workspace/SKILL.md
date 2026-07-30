---
name: novel-workspace
description: 对 Markdown 小说工作区执行创建、定位、读写、删除、校验或对象路由时使用；定义紧凑文件树、稳定 ID、唯一事实源、卡片流转、兼容规则与最小读取方式。
---

# 小说工作区

## 职责

本 Skill 只规定项目对象放在哪里、怎样引用和怎样修改。各创作对象是否成立，由构思阶段对应任务模块判断；不要把分析方法变成文件字段。

## 新项目文件树

```text
{workspace}/
  project.md
  storylines.md                 # 可选、懒创建：全部故事线
  worldbuilding/
    worldbuilding.md
  characters/
    characters.md
  outline/
    master-outline.md
    vol{NN}-outline.md          # 条件必需
    ch{NNN}-outline.md          # 懒创建
  manuscript/
    ch{NNN}.md
    front-matter.md             # 可选
    back-matter.md              # 可选
  materials/
    cards.md                    # 可选、懒创建：未归位想法
  process/
    open-questions.md           # 可选
    changelog.md                # 可选
    review-findings.md          # 可选
  exploration/
    {type}-{direction}.md       # 可选：成组候选方案
  styles/
    {slug}.md                   # 可选
  .iwriter/
    skills/{slug}/SKILL.md      # 可选
    status.md                   # 可选派生缓存
```

初始化只创建 `project.md`、`worldbuilding/worldbuilding.md`、`characters/characters.md` 和 `outline/master-outline.md`。空的故事线、卡片、过程和风格文件不要预建。

## 对象关系

- 人物、世界、故事线和卡片是并列对象，不从总纲派生。
- `storylines.md` 保存“某条变化如何发展”；总纲只安排已确认故事线及其节点的全书位置与交汇。
- 章纲保存已归位场景；正文保存实际写出的内容。
- 当前伤势、位置、持有物、关系胜负等实际状态从正文与相邻章纲判断，不在稳定人物或世界对象中另存一份。

## 唯一归属

| 内容 | 唯一正式归属 |
| --- | --- |
| 作品身份、核心故事约定、规模、视角与创作边界 | `project.md` |
| 稳定世界规则、地点、组织、历史与物品事实 | `worldbuilding/worldbuilding.md` |
| 稳定人物事实、重要经历、关系与可观察表现 | `characters/characters.md` |
| 独立的情节线、关系线、变化线或悬念线 | `storylines.md` |
| 全书顺序、结构节点与多线交汇 | `outline/master-outline.md` |
| 单卷结构 | `outline/vol{NN}-outline.md` |
| 已归位的章节与场景事实 | `outline/ch{NNN}-outline.md` |
| 未确认或未归位的原子想法 | `materials/cards.md` |
| 已写出的故事 | `manuscript/` |

一个事实只在归属对象中写完整内容。其他文件只写稳定 ID 或短链接，不复制解释性摘要。需要人物表、故事线推进表或状态摘要时动态生成；派生视图不是事实源。

## 紧凑记录契约

新建或明确重写的非正文对象默认使用“一个核心句 + 最多三条必要补充”：

- 核心句通常不超过 120 个中文字符或 60 个英文单词。
- 补充项每条通常不超过 80 个中文字符或 40 个英文单词。
- 故事线阶段、结构节点和场景可以有多条，但每条各自用一个因果句完成。
- 先删定义、方法说明、同义复述和无证据推测；不能为满足长度而截断已确认事实。
- 确有多个独立事实时，建立带稳定 ID 的子条目，不扩成一组分析字段。

模板规定记录形状和长度预算；关键语义由对应任务模块在内部检查。检查通过后，把结论压缩成直接的故事语言，不逐项输出检查术语。

## 标题、ID 与引用

- H1 只写本地化文件标题。
- 每个可引用对象使用 `本地化名称（type-slug）` 标题，例如 `## 陈默（char-chenmo）`、`### 拒绝二留一（beat-refuse-one）`。
- ID 使用小写 kebab-case，在项目内唯一且不随显示名称改变。
- 引用写 ID；需要方便作者阅读时可写 `陈默（char-chenmo）`，不得复制被引用对象的完整内容。
- 只有少数运行状态使用固定字段标题，例如 `## 状态（status）`；创作方法术语不作为机器字段。
- 可选内容没有有效事实时省略，不写成排队的 `待确定` 字段。

## 文件生命周期

| 类型 | 规则 |
| --- | --- |
| 必需 | 初始化后存在，可以只有 H1。 |
| 可选 | 没有有效内容时不存在。 |
| 条件必需 | 启用对应结构后存在。 |
| 懒创建 | 第一次确认需要时创建，之后成为该对象的唯一正式文件。 |

- 新写或修改 `manuscript/ch{NNN}.md` 前，对应 `outline/ch{NNN}-outline.md` 必须为 `confirmed`，且场景在语义上可直接写作。
- `novel-import` 可以先机械导入正文再重建章纲；之后 writer 修改正文仍受前一条约束。
- 启用卷纲后，每个有效卷必须存在对应卷纲。

## 模板路由

| 文件 | 模板 |
| --- | --- |
| `project.md` | `project-template` |
| `worldbuilding/worldbuilding.md` | `worldbuilding-template` |
| `characters/characters.md` | `characters-template` |
| `storylines.md`、`outline/**` | `outline-template` |
| `manuscript/**` | `manuscript-template` |
| `styles/**` | `style-template` |
| `materials/**`、`process/**`、`.iwriter/status.md` | `others-template` |

## 最小读取

1. 先读目标文件结构，再取目标 ID 对应块。
2. 只解析会改变当前结果的直接引用；第二跳引用只有在事实冲突或因果缺口无法判断时才读取。
3. `characters.md`、`storylines.md`、`cards.md` 等单文件多对象集合不得默认整份读取。
4. 已读取唯一事实源后，不再加载其派生摘要、变更记录或同义索引。
5. 当前会话已经包含且未被修改的内容不重复从磁盘读取。

## 卡片流转

卡片用于低摩擦捕获，不要求作者在记录时分类。作者确认采用后：

- 稳定人物事实移入人物对象；
- 稳定世界事实移入世界对象；
- 因果变化移入故事线；
- 已归位场景移入章纲；
- 仍未确定或未归位时继续留在卡片池。

移动后不得保留事实副本；原卡可以删除，或只保留 `→ 目标 ID` 的去向指针。

## 旧项目兼容

- 旧项目中的 `characters/{slug}.md`、`worldbuilding/factions.md` 等拆分文件、总纲内嵌故事线和 `materials/fragments.md` 均可读取和原位修改。
- 未经作者明确要求，不扫描、迁移或批量改写旧项目，也不创建一套新文件与旧事实并存。
- 旧字段只有本地化标题、旧 identifier 或不同标题层级时，在含义唯一的情况下读取；不能仅因格式旧而判断内容缺失。
- 作者以后单独批准迁移时，按“移动完整事实、原处仅留引用、一次只保留一个事实源”处理。

## CRUD 与校验

- **Create**：按生命周期创建最小文件；已存在时转 Update，不覆盖。
- **Read**：忠实返回目标块，不顺手补字段或规范化。
- **Update**：只改唯一归属对象中的最小块；保留未涉及内容、批注和未知扩展。
- **Delete**：必需文件不可单独删除；其他对象在没有有效引用后才删除。

错误：必需文件缺失、同一事实存在两个正式归属、ID 冲突、已启用卷纲缺文件。

警告：正文缺少可写章纲、引用不存在、候选被当成正式事实、上游变化可能使下游过期。
