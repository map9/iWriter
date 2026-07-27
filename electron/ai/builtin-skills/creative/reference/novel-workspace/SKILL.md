---
name: novel-workspace
description: 对 Markdown 小说工作区执行创建、定位、读写、删除、校验或对象路由时使用；定义文件树、生命周期、标题 ID、CRUD 与对象归属。
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
    front-matter.md            # 可选：扉页、版权、目录、献词等非章节前置材料
    back-matter.md             # 可选：附录、后记、致谢等非章节后置材料
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

- Agent 新写或修改 `manuscript/ch{NNN}.md` 前，必须存在对应且 `confirmed` 的 `outline/ch{NNN}-outline.md`。
- `novel-import` 物理导入已有正文是前一条的例外：可以先导入再反向重建章纲；但 writer 后续修改该章前仍须满足章纲依赖。
- `front-matter.md`、`back-matter.md` 是非章节材料，不要求章节提纲；叙事性序章或尾声仍作为 `ch{NNN}.md` 管理。
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

所有项目对象文件遵循同一 Markdown 结构，模板不再各自发明标题格式。

文件内容使用作品的输出语言；给作者看的名称本地化，机器定位使用固定 identifier：

- **H1 只写本地化对象标题，不带 identifier。** 文件路径已经标识对象，H1 不作为机器锚点。例如 `# 世界设定` / `# Worldbuilding`。
- **所有 schema 字段标题使用 `本地化名称（identifier）`。** 顶层字段通常为 H2；嵌套字段按结构使用 H3/H4，但仍保留同一格式。例如 `## 故事核心句（premise）`、`#### 结果（outcome）`。
- identifier 只使用小写 kebab-case，任何输出语言都原样保留、绝不翻译。定位字段与结构校验只认 identifier，不依赖本地化名称。
- 表格列也是 schema 字段时，列头同样使用 `本地化名称（identifier）`；不能只写本地化列名。
- 重复条目的实例标题可以使用本地化实体名；需要稳定对齐时附实例 ID，例如 `### 场景 1（scene-1）`。实例 ID 不能代替其内部字段 ID。
- 必选字段标题必须存在；内容未定时使用输出语言的待定占位符，例如中文 `待确定`、英文 `TBD`。**占位符只满足结构合法，不代表语义就绪。**
- 可选字段没有有效内容时可以不创建；修改已有文件时保留未涉及的可选字段和未知扩展字段。
- 字段内简单条目使用列表；具有多个属性、需要单独引用或检查的条目使用 H3 分节。具体形态由目标模板定义。

规范示例：

```markdown
# 小说项目

## 故事核心句（premise）
待确定
```

### 旧格式兼容

- 新建文件和本轮明确重写的目标文件必须使用上述规范。
- 旧文件只有本地化字段标题、使用 H3 顶层字段、或 H1 带路径式名称时，可以在含义唯一时读取；将其报告为结构警告，**不要仅因旧格式判定故事内容缺失**。
- 作者批准更新该文件时，可以同时把已识别的 schema 标题规范化为本地化名称 + 固定 ID，但必须保留原内容、未知扩展字段和批注。
- 不为格式迁移扫描或批量改写整个工作区；只处理当前任务明确涉及的文件。

## 通用规则

1. 项目对象使用纯 Markdown 文件。
2. `{slug}`、`{type}`、`{direction}`：CJK 转为拼音、拉丁文字不变，全部小写并以短横 `-` 连接。
3. `NN` 为两位卷号，`NNN` 为三位章节号，均补零。
4. 字数、条目数、角色数、章节数和场景数只能是任务建议，不是结构合法或语义就绪的依据。
5. 一个对象只能有一个正式文件，不创建别名或重复副本。
6. 信息写入其归属对象，其他文件通过引用使用，不复制维护。
7. `exploration/` 中的内容是候选方案，不得直接视为正式设定。
8. 修改时保留未涉及的内容、批注、注释和未知扩展段落。
9. 默认只读取目标文件及其直接依赖，不扫描整个项目。

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
- 已启用卷纲但缺少对应卷纲文件。

以下情况为警告：

- 可选文件为空；
- 已有章节正文缺少对应章纲，或章纲仍为 `draft`；既有正文可以保留，但 Agent 不得进入该章写作或修改；
- 候选方案被当作正式对象引用；
- 被引用对象不存在；
- 上游对象发生变化，下游内容可能已经过期。

文件内部结构由目标模板校验；内容能否支撑下一阶段，由对应阶段任务的语义验收判断。二者不得互相替代。
