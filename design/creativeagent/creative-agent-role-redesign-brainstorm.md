# Creative Agent 角色重构 · 头脑风暴

> 性质：**头脑风暴 + 诊断**，不是定稿方案。用于指导下一步对 ① 角色定义 ② 流程设计 ③ skills 设计 ④ 角色对应的 subagent 设计 的重构。
> 来源：由一次 planner 子代理失败的 trace（`conversion01.json`）出发，逐步上升到对整个 creative domain 角色范式的反思。
> 日期：2026-05-31

---

## 0. 起点

修复 planner 子代理"连续两次返回 invalid result、降级到 general-purpose"的过程中，发现问题不止于一个校验 bug，而暴露出 **creative domain 的角色/流程范式本身**存在更深的错配。本文沉淀这场讨论。

---

## 1. 核心诊断：把"工程师 Agent"架构套到了文学写作上

iWriter creative 域现在的脊椎是：

```
先严密规划(planner) → 精确执行(writer) → 事后审计(consistency)
```

这套 plan→execute→audit 范式对**写代码/改 bug** 是对的：先想清因果、再精确落地、不要乱发挥。
但**文学散文的生命恰恰长在"发挥"里**——一个手势、半句话、一个节奏断裂、一个意象回旋。
当"写"被降级成"按 spec 渲染"，**意图与执行被切开，那道缝就是读者感到的"硬"。**

> **一句话病根**：结构化的纪律本属于"逻辑与审查"，却被强加给了"生成与声音"。

---

## 2. 四个症状 → 根因 → 代码元凶

用户观察到的四个明显问题，是同一病根的投影：

| # | 症状 | 根因 | 代码元凶 |
|---|---|---|---|
| 1 | 小的修改也要走完整规划 | 架构只有**一条重路径**，无用力梯度；风格润色被误路由进重型 planner | 主路由逻辑（creative.ts 系统提示）缺"轻量修订"分流 |
| 2 | 规划教条 → 文本套路化、程式化 | planner schema 强迫每个场景过同一分析格栅；模板化字段 | `planner.ts`：motivationTraces/causalChain/commonSenseFlags 必填；`"Theme tie:"` 强制行 |
| 3 | 用户的调整较难进入规划 | 子代理 one-shot + 计划过刚；模糊人话无处可去、无法映射 schema | deepagents 无状态子代理；无编排层"产物 patch"机制 |
| 4 | 输出文本很硬、不像人写的 | 生成被降级为"按计划精确渲染"；**用推理模型写散文** | `writer.ts`：*"Execute the approvedPlan precisely. Do not improvise…"*；`ChatDeepSeek.ts:802` `reasoning_effort` 最低 `'high'`、最高 `'max'` |

### 问题 4 的两个直接元凶（最重要）

- **writer 被禁止即兴**：`writer.ts` 明确 *"Do not improvise plot changes, character decisions, or structural deviations."* 对逻辑安全是好事，对散文是致命的——句子层的微即兴正是"活"的来源。
- **用推理模型写小说**：推理模型生成散文像"工程师写诗"，会把文字斟酌死；reasoning 模型散文天生偏谨慎、求稳、信息密度高而节奏感低，本身就"硬"。**这是单一最大杠杆，却一直没被当成变量。** （见 `ChatDeepSeek.ts:802`：`reasoning_effort` 最低也是 `'high'`）

### 问题 2 的放大器：风格被做成了"配方 + checklist"

鲁迅风格被抽成 **"Generation Recipe 八步 + Self-check 七条"**。**声音不是配方**；让 writer 逐句满足七点 checklist，几乎保证机械化输出。

---

## 3. 框架视角：为什么结构化是应用层责任

对比 deepagents / Claude Code / Codex / Gemini CLI，子代理设计几乎全行业收敛到同一范式：

- **配置** = markdown/toml（frontmatter 元数据 + 正文 system prompt）+ 工具子集 + 隔离上下文
- **输入** = 一段自然语言 prompt/brief 字符串，**无输入 schema**
- **输出** = 最终一条消息/summary，**默认自由文本**；结构化基本靠 prompt 约定（唯一框架级例外：Codex 的 CSV 批量 `output_schema`）
- **核心价值** = 上下文隔离，而非 I/O 契约

> 推论：**严格 I/O 是应用层责任**。iWriter 给 planner 加 `responseFormat` + 归一化/校验中间件，是在补框架普遍不提供的"输出契约层"——这是常态，不是绕路。但**不应一刀切套到所有角色**。

### deepagents 关键事实（供 subagent 重构参考）

- 子代理输入 = `task(description, subagent_type)`，仅一个自由文本 `description`，包成单条 HumanMessage
- 共享 state 经 `filterStateForSubagent` 过滤（剔除 messages / todos / structuredResponse / skillsMetadata / memoryContents），子代理拿到**全新消息历史** + 共享文件等 state
- 输出经 `returnCommandWithStateUpdate`：有 `structuredResponse`（responseFormat）则回灌干净 JSON，否则回最后一条消息文本
- `responseFormat` 走 ProviderStrategy（因 deepseek-reasoner profile `structuredOutput:true`），**不强制 tool_choice:"any"**，旧的"#31403 阻塞"已不成立（2025-06-01 关闭）

---

## 4. 设计原则（重构指南）

### 原则 A — 结构化分级：按"输出被谁消费"决定 I/O 严格度

| 类别 | 角色 | 输出消费者 | I/O 取向 |
|---|---|---|---|
| ① 审批产物 | planner | **用户**（confirm_writing_plan 审批卡） | 最严：responseFormat + 校验 + 归一化 |
| ② 可比较分析 | consistency / researcher | **代码聚合**（findings 面板 / 研究引用） | 较严：结构化 schema，可容错 |
| ③ 创作内容 | writer / explorer | **文档/草稿本身**（块编辑、样稿落盘，经 interrupt） | 最松：工具调用即契约，末尾 JSON 仅回执 |

> **修正**：explorer 之前容易被归到"②可比较分析"，**实际更接近③**——它的主产物是 300-500 字 vivid 样稿（走 `write_exploration_draft` 工具落盘），schema 字段只是元数据索引。
>
> **普适判据**：主产物若是创作内容 → 走工具落盘，末尾 JSON 退化为引用/回执；只有主产物本身是结构化判断（计划/审查/研究）→ 才上 responseFormat。

### 原则 B — 调换 audit↔write 顺序，让"生成"当脊椎

现在是 `audit → write`（先审后写），对散文是反的。人是 `带意图与声音先写出有动量的草稿 → 再回头查逻辑`。让生成行为当脊椎，consistency 作为**并行/事后检查**而非前置闸门。同时缓解症状 2、4。

### 原则 C — 计划给"意图与边界"，不给"逐句 spec"

删掉 writer 的 "execute precisely / do not deviate"，换成：守住这几拍、这些人物真相、不可破的底线；句子/意象/节奏层面**全归 writer 自己**。计划负责**约束**，不负责**代笔**。

### 原则 D — 风格 = 范例 + few-shot，而非配方 + checklist

声音捕获为：(a) 一小段**真实原文样本**；(b) 三五条松散"惯用动作"；(c) 反模式清单。让 writer **对着样本写**，而非满足检查表。人学声音靠模仿，不靠对表。直击症状 2、4。

### 原则 E — 用力梯度路由

请求先分流：

- **局部 / 风格 / 行级修改 → 轻量"修订"路径**：不规划，直接带品味改块，顶多过一次声音校验
- **新场景 / 结构性改动 → 重型 planner 路径**

解决症状 1，并防止重规划的"硬"污染小改。（trace 中"用鲁迅风格调整第二章"应走轻量路径而非触发 planner。）

### 原则 F — 迭代放编排层，用 patch 而非 re-spawn

主代理**持有上一次 plan/draft 的结构化对象**；用户模糊 nudge → patch 该对象 → 只重写受影响的块，而非重 spawn 全新 planner。把"迭代"在编排层解决，绕开 deepagents 无状态限制。解决症状 3。

### 原则 G — 模型与采样：别用推理模型写散文

- 写散文时 **reasoning_effort 调低、temperature 调高**；甚至 **writer 改用非 reasoner 模型**
- 逻辑/规划/审查保留 reasoner + 低温（要确定性）
- 这是对"硬"最直接的物理干预，也是当前最被忽视的变量

### 原则 H — 输入侧：硬字段 typed，软意图留 free-text

creative 子代理 brief：路径/枚举（targetChapter、styleSlug）做 typed 校验（错误左移到调用点）；**意图与声音必须留成 free-text 正文，别拆碎**——拆碎会丢语气，拆成字段会让模型把一切塞进一个 string 字段（schema 形同虚设）。即"信封 + 自由正文"模式。

---

## 5. 落到四个重构维度的启示

### ① 角色定义

- **planner**：重新审视其权责边界。它是否被赋予了过多生成主导权？建议：planner 只产**逻辑骨架与边界**（防长篇逻辑崩坏），明确**不泄漏到句子层**。
- **reviser（新角色）**：引入轻量修订者，带品味的局部改写，不规划。与重型 planner 并存形成梯度（对应原则 E）。
- **writer**：从"计划渲染器"回归"有创作自主权的写作者"。
- **每个角色明确"主产物类型"**（创作内容 vs 结构化判断），据此定 I/O。

### ② 流程设计

- 路由层先分"轻改 / 重写"两条路（原则 E）
- 主链条由 `audit→write` 改为 `write→check`（原则 B）
- 迭代/调整走编排层 patch（原则 F），而非重 spawn
- 审批点（confirm_writing_plan / edit proposals）保留，但喂给审批 UI 的产物 schema 应与 UI 字段一一对应

### ③ skills 设计

- **风格类 skill** 去 checklist 化，改"范例 + few-shot + 反模式"（原则 D）
- **craft skill**（show-vs-tell、deep-pov 等）警惕被当作"逐句检查表"机械执行——应作为**写作时的视角**而非**事后打分项**
- 区分"**生成型 skill**"（启发写作，宜松）与"**审查型 skill**"（检查逻辑/一致性，宜严）

### ④ subagent 设计（对应角色）

- **planner**：保留 responseFormat + 归一化兜底（已实现）；schema 对齐审批 UI；产物限定为逻辑骨架，不含散文建议
- **writer**：去 responseFormat（工具调用即契约）；解除"禁止即兴"约束；低 reasoning / 高 temperature / 或换非 reasoner 模型；输入用"信封 + 自由正文"
- **explorer**：重新定位为③创作内容类；样稿走 `write_exploration_draft` 工具，末尾 JSON 仅元数据索引
- **consistency / researcher**：②类，结构化 schema + 容错归一化；可考虑把 planner 的归一化中间件**泛化为按 subagent_type 查 schema 的通用关卡**
- **输入侧**：为需要硬字段的子代理配 typed brief-builder 工具（仅校验路径/枚举），软意图留 free-text

---

## 6. 开放问题（待决策）

1. **planner 的生成主导权边界**：是想削弱强规划（保留长篇逻辑保护但缩小 schema），还是保留强规划但禁止其泄漏到句子层？这个决定制约 B/C/E 如何组合。

2. **writer 是否换非 reasoner 模型**：质量收益 vs 成本/一致性（同一对话里多个角色用不同模型的切换开销）。

3. **reviser 的形态**：独立 subagent（隔离上下文）还是主代理直接带工具改（更快但上下文混入）？粒度与隔离的取舍。

4. **风格 few-shot 的样本存放**：原文样本从何来、存哪？writing-style skill 的文件结构是否需要重设计（当前是 SKILL.md + extraction JSON，是否加 `samples/` 子目录）？

5. **迭代 patch 的状态存放**：会话级创作上下文对象（上次 plan、上次写的块）放在哪里持久化？StateStorage（electron-store）？线程内存（LangGraph state channel）？还是 StoryBible 的子节？
