---
name: style-template
description: 创建、读取、更新或校验 novel workspace 的 styles/{slug}.md 时使用；定义以作者认可范文为主锚、可记录本地文件或网络研究来源的全局叙述风格对象。
---

# 风格模板

**前置 Skill：** `novel-workspace`

## 管理对象

```text
{workspace}/styles/
  {slug}.md    # 可选、懒创建：全局写作风格对象
```

风格对象不是故事事实或作家研究报告，而是作者为当前小说确认的一套叙述声音参照；由 `project.md` 的 `constraints` 记录明确引用后才生效。

## 字段

H2 字段：

- `exemplar`（必选）：作者直接给出或确认选中的代表性原文短片段。writer 取其叙述模式，不复用情节、人物、场景、独特措辞或意象组合。每个片段使用 H3 `本地化名称（exemplar-1）` 分项；存在多个片段时递增数字后缀，只有一个片段时也保留该结构。
- `source-author`（可选）：作者、作品或“作者自写”等简要归属；不能代替来源定位。
- `source-references`（条件必选）：来源索引。使用本地文件或网络研究时必选；直接消息范文可选。表格列固定为 `来源（source）`、`类型（type）`、`定位（locator）`、`用途（usage）`。
- `profile`（必选）：围绕已确认范文的可执行画像。每个倾向使用 H3 `本地化模式名（profile-1）` 分项；存在多项时递增数字后缀。内容写成包含可观察模式、叙事效果、适用条件或失效边界的连贯短段；不是泛化形容词或逐条生成戒律。
- `avoid`（可选）：作者明确要求避开的写法或作品。

`source-references` 约定：

- 工作区内文件优先记工作区相对路径；工作区外文件记作者给出的真实绝对路径；网页记可核验的规范 URL。
- `type` 使用稳定值：`author-provided`、`local-file`、`web-primary`、`web-secondary`。
- `locator` 写标题、章节、页码、行号、块范围或网页段落锚；不能只写“见原文”。
- `usage` 说明该来源支持哪个 `exemplar-1` / `profile-1` 等条目。

## 规范示例

```markdown
# 古龙式武侠叙事

## 范文（exemplar）

### 范文 1（exemplar-1）

> 作者确认的短摘录

### 范文 2（exemplar-2）

> 作者确认的短摘录

## 来源归属（source-author）

古龙；重点参考《作品甲》《作品乙》。

## 来源索引（source-references）

| 来源（source） | 类型（type） | 定位（locator） | 用途（usage） |
|---|---|---|---|
| 规范 URL 或本地文件路径 | web-primary 或 local-file | 章节、页码或段落定位 | 支持 exemplar-1、profile-1 |

## 风格画像（profile）

### 信息切分与短句落点（profile-1）

这里写可观察模式、造成的叙事效果、适用条件与过量使用的失效边界。

## 回避项（avoid）

作者明确要求避开的写法。
```

## 语义校验

- `exemplar` 是主锚，优先于 `profile`；二者冲突时修正 profile，不改范文。
- `profile` 中的倾向必须能由 exemplar 或 source-references 支持；二手评论支持的解释必须与原文观察分开。
