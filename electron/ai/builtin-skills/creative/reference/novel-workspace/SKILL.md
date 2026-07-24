---
name: novel-workspace
description: Use when creating, locating, reading, updating, deleting, validating, or routing files in a Markdown-based novel project workspace.
---

# 小说工作区

## 职责

本 Skill 定义小说项目的公共契约：

- 文件树与文件命名；
- 文件生命周期；
- 模板路由；
- 通用 CRUD 规则；
- 对象归属与结构校验。

本 Skill 只规定**文件在哪里、何时存在、如何操作**。文件内容及内容校验由对应的 `*-template` Skill 定义。

## 文件树

```text
{workspace}/
  project.md
  worldbuilding/
    worldbuilding.md
    factions.md                # 可选：factions 规模增长后拆出
    geography.md               # 可选：geography-locations 拆出
    items.md                   # 可选：key-items 拆出
  characters/
    characters.md
    {slug}.md                  # 可选，懒创建：独立角色档案
  outline/
    master-outline.md
    vol{NN}-outline.md         # 条件必需：启用卷纲后存在
    ch{NNN}-outline.md         # 懒创建：章节正文写作前提
  manuscript/
    ch{NNN}.md                 # 懒创建：章节正文
  materials/
    fragments.md               # 可选
  process/
    open-questions.md          # 可选
    changelog.md               # 可选
    review-findings.md         # 可选
  exploration/
    {type}-{direction}.md      # 可选：候选方案
  styles/
    {slug}.md                  # 可选，懒创建：写作风格配置
  .iwriter/
    skills/
      {slug}/SKILL.md          # 可选：项目级自定义 Skill
    status.md                  # 可选：工程状态摘要
  .git/
```

## 文件生命周期

| 类型 | 规则 |
|---|---|
| 必需 | 项目初始化后必须存在。 |
| 可选 | 没有有效内容时可以不存在。 |
| 条件必需 | 启用对应能力后必须存在。 |
| 懒创建 | 第一次实际使用时创建，创建后成为该对象的唯一正式文件。 |

项目初始化时必须创建：

```text
project.md
worldbuilding/worldbuilding.md
characters/characters.md
outline/master-outline.md
```

依赖规则：

- 写作 `manuscript/ch{NNN}.md` 前，必须存在对应的 `outline/ch{NNN}-outline.md`。
- 启用卷纲后，每个有效卷必须存在对应的 `outline/vol{NN}-outline.md`。

## 模板路由

执行文件操作时，加载本 Skill 和目标文件对应的一个模板；除非跨对象操作，不加载无关模板。

| 文件 | 模板 |
|---|---|
| `project.md` | `project-template` |
| `worldbuilding/**` | `worldbuilding-template` |
| `characters/**` | `characters-template` |
| `outline/**` | `outline-template` |
| `manuscript/**` | `manuscript-template` |
| `styles/**` | `style-template` |
| `materials/**`、`process/**`、`.iwriter/status.md` | `others-template` |

## 文件格式约定

所有项目对象文件遵循同一 Markdown 结构，模板不再各自复述。

文件内容用作品的输出语言书写，标题随之本地化，但字段标识（identifier）固定不变：

- 字段用二级标题（H2），格式 `本地化名称（identifier）`。括号内的英文标识（如 `premise`、`rule-systems`）是语言无关的锚点，**任何语言都原样保留、绝不翻译**，定位字段与结构校验只认它；括号前的名称用输出语言写——中文作品 `## 故事核心句（premise）`，英文作品 `## Premise（premise）`。
- 文件一级标题（H1）用输出语言书写即可，文件由路径标识、标题不作锚点，如 `世界设定` / `Worldbuilding`。
- 必选字段标题必须存在；内容未定时用输出语言的待定占位符（中文 `待确定`）。
- 可选字段无内容时保留标题、内容置空。
- 字段内多个条目用无序列表分项；条目较复杂（多属性、可独立成档）时改用三级标题（H3）分节。表格等结构化形态由对应模板说明。

## 通用规则

1. 项目对象使用纯 Markdown 文件。
2. `{slug}`、`{type}`、`{direction}` 使用小写英文和连字符。
3. `NN` 为两位卷号，`NNN` 为三位章节号，均补零。
4. 一个对象只能有一个正式文件，不创建别名或重复副本。
5. 信息写入其归属对象，其他文件通过引用使用，不复制维护。
6. `exploration/` 中的内容是候选方案，不得直接视为正式设定。
7. 修改时保留未涉及的内容、批注、注释和未知扩展段落。
8. 默认只读取目标文件及其直接依赖，不扫描整个项目。

## 通用 CRUD

| 操作 | 规则 |
|---|---|
| Create | 校验路径和生命周期；使用对应模板；已存在时不得覆盖，转为 Update。 |
| Read | 优先读取目标文件；忠实返回内容，不擅自补写或规范化。 |
| Update | 进行满足请求的最小修改；修改信息的正式归属文件；不静默联动修改其他对象。 |
| Delete | 必需文件不可单独删除；条件必需或懒创建文件只有在无依赖时可删除；可选文件可显式删除。 |

删除整个项目属于工作区级操作，不属于任何文件模板的职责。

## 对象归属

| 内容 | 正式归属 |
|---|---|
| 作品前提、主题、读者承诺、篇幅、叙事视角 | `project.md` |
| 世界规则、地理、阵营、关键物品、名词、历史 | `worldbuilding/` |
| 角色、人物关系、人物弧光 | `characters/` |
| 主线、故事线、冲突、情节结构、伏笔、卷章提纲 | `outline/` |
| 正文及章节内批注 | `manuscript/` |
| 可复用写作风格 | `styles/` |
| 素材、问题、反馈、变更记录 | `materials/`、`process/` |
| 候选方案 | `exploration/` |
| Agent 或宿主工程状态 | `.iwriter/` |

发现内容归属错误时，应报告；没有明确请求时不得自动迁移。

## 结构校验

以下情况为错误：

- 缺少项目初始化必需文件；
- 文件位于约定之外的路径；
- 文件名不符合模式；
- 同一对象存在多个正式文件；
- 章节正文缺少对应章节提纲；
- 已启用卷纲但缺少对应卷纲文件。

以下情况为警告：

- 可选文件为空；
- 候选方案被当作正式对象引用；
- 被引用对象不存在；
- 上游对象发生变化，下游内容可能已经过期。

文件内部结构和语义由目标模板校验。
