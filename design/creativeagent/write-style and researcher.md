# 写作风格与 Researcher 改造计划

## 目标

Creative Domain 不只服务小说正文写作，也应服务创意采集、资料研究、作者/作品分析、名家写作风格提取与复用。

本轮改造的核心目标：

1. 将 Researcher 拆回通用研究子代理。
2. 新增 WritingStyleExtractor，用于从作者、作品、链接、文件、研究结果中提取写作风格。
3. 新增 WritingStyleSkillCreator，用于把提取结果创建为 deepagents 原生 writing-style skill。
4. 名家写作风格 skill 存放在 writing-style 下的子目录。
5. Creative Domain 根据用户意图选择工作 lane，风格提取与资料研究不再无条件读取 StoryBible。

## Skill 目录

使用 deepagents 原生 skill 目录形态：

```txt
~/.iwriter/ai/skills/
  writing-style/
    SKILL.md
    lu-xun/
      SKILL.md
    zhang-ai-ling/
      SKILL.md
```

deepagents 当前不会从 `/skills/` 自动递归发现嵌套 skill，因此 Creative capabilities 需要同时声明：

```ts
skills: ['/skills/', '/skills/writing-style/']
```

`/skills/` 用于加载 `writing-style` 路由 skill，`/skills/writing-style/` 用于加载名家风格子 skill。

## 子代理职责

### Researcher

通用研究子代理，和 Planner 同级。

职责：
- 依据问题进行资料研究。
- 可使用 web_search、fetch_url 和文件读取能力。
- 输出带来源、证据、局限性的研究结果。
- 不创建 skill，不知道 writing-style 的保存规则。

适用场景：
- 名家风格研究的资料收集阶段。
- 社会新闻、时代背景、行业职业、地点风貌、作者作品分析等创意资料收集。

### WritingStyleExtractor

写作风格提取子代理。

职责：
- 从 Researcher 的研究结果、作者名、作品名、链接摘要、用户提供文件中提取写作风格。
- 根据 `writing-style/SKILL.md` 中定义的提取协议输出结构化风格结果。
- 不写文件，不创建 skill。

### WritingStyleSkillCreator

写作风格 skill 创建子代理。

职责：
- 读取 `writing-style` 与 `skill-creator` 的规则。
- 把 WritingStyleExtractor 的结果组织成 deepagents 原生 `SKILL.md`。
- 调用保存工具写入 `writing-style/<slug>/SKILL.md`。
- 保存工具负责 YAML 安全、目录安全、覆盖保护、缓存刷新。

## Creative Intent Gate

Creative Domain 在执行具体流程前先判断用户意图：

- `story_state_lane`: 写章节、改剧情、维护 StoryBible、重建故事状态。保留当前 StoryBible 启动流程。
- `style_skill_lane`: 提取、创建、测试、调整名家写作风格 skill。跳过 StoryBible 启动。
- `research_lane`: 创意采集、资料收集、社会新闻、时代背景、作者/作品分析。使用 Researcher，跳过 StoryBible 启动，除非用户明确要求结合当前小说设定。
- `conversation_lane`: 澄清、偏好选择、普通讨论。直接回应。

当前无条件 “session startup 必须读取 StoryBible” 的规则改成仅适用于 `story_state_lane`。

## writing-style Skill 职责

`writing-style/SKILL.md` 是名家写作风格体系的协议文档：

- 说明何时使用已有名家风格 skill。
- 说明何时创建新名家风格 skill。
- 定义 Researcher -> WritingStyleExtractor -> WritingStyleSkillCreator 的流程。
- 定义 WritingStyleExtractor 应提取的风格维度。
- 定义名家风格 SKILL.md 的基本正文结构。
- 定义测试样文与用户反馈更新流程。

风格提取维度先放在 skill 中约定，后续可迭代，不写死在 TypeScript 中。

## 工具边界

工具保持低自由度：

- `list_writing_styles`: 扫描 `writing-style/*/SKILL.md`。
- `get_writing_style`: 读取指定名家风格 skill。
- `save_writing_style_skill`: 保存完整 SKILL.md，做 YAML 与目录校验。
- `update_writing_style`: 根据用户反馈追加 refinement 或替换正文。
- `delete_writing_style`: 删除名家风格 skill，继续走审批。

工具不负责研究、不负责风格判断、不负责模板内容创作。

## 不在本轮完成

- 不修复已有鲁迅测试 skill。
- 不做旧 writing-style skill 数据迁移。
- 不引入 LocalShellBackend 或开放 execute。
- 不把用户自定义小说风格归集为 skill。
- Creative 附件挂载可后续补齐，不阻塞主体验证。

## 验收标准

1. 用户请求“提取鲁迅风格并测试”时，不应先读 StoryBible。
2. Researcher 可用于任意资料研究，不再写死为作家风格研究。
3. 名家风格 skill 写入 `writing-style/<slug>/SKILL.md`。
4. 新 skill frontmatter 必须是合法 YAML。
5. 写作风格创建流程能产出测试样文，并能根据用户反馈更新 skill。
