# Agent Chat 设计规范

本文档用于约束 iWriter Agent Chat 的前端显示逻辑，避免后续迭代再次把：

- proposal 审核 UI
- tool call 卡片 UI
- thinking 挂载规则
- 流式与持久态的消息重组

混在一起分别修改。

虽然文件名仍沿用 `proposal-navigator-ux-spec.md`，但本文档现在描述的是更完整的 Agent Chat 设计规范，`ProposalNavigator` 只是其中一个子系统。

适用文件：

- `src/components/ai/agent-panel/chat-area/ProposalNavigator.vue`
- `src/components/ai/agent-panel/chat-area/AgentMessageBubble.vue`
- `src/components/ai/agent-panel/chat-area/views/ToolCallCard.vue`
- `src/components/ai/agent-panel/chat-area/views/EditSessionCard.vue`
- `src/components/ai/agent-panel/chat-area/views/EditSummaryCard.vue`
- `src/components/ai/agent-panel/TaskPlanCard.vue`
- `src/components/ai/agent-panel/domains/edit/EditMessageSession.vue`
- `src/ai/store/modules/runtimeDisplay.ts`
- `src/ai/store/modules/editReview.ts`
- `src/ai/message/display-normalizer.ts`

## 1. 目标

Agent Chat 的核心目标不是原样复刻底层 message 数据，而是稳定地表达用户在对话里真正关心的三个东西：

1. AI 当前在做什么
2. 哪些内容需要用户审批
3. 哪些结果已经完成、跳过或失败

因此，前端允许对消息做显示层重组，但这种重组必须遵守统一规则，不能随局部组件自行发挥。

## 2. 基本原则

### 2.1 这是显示层逻辑，不是后端数据逻辑

- 后端负责产生原始消息、tool calls、tool results、proposal、thinking。
- 前端负责把这些原始消息整理成稳定的聊天显示效果。
- 不允许为了修 UI 现象而反向要求后端改变消息组织方式。

### 2.2 消息重组必须整体考虑

不允许分别在：

- `AgentMessageBubble`
- `ProposalNavigator`
- `EditSummaryCard`
- `TaskPlanCard`
- `runtimeDisplay`

各自偷偷定义一套“谁挂谁、谁吞谁、谁合并谁”的规则。

所有显示层重组都必须以统一的 chat 规则为准。

### 2.3 流式与持久态必须一致

这是强约束。

不允许出现：

- streaming 时是一组 tool cards，done 后拆开
- streaming 时 think 可见，done 后消失
- interrupted/resume 后显示宿主发生切换

如果某种显示重组规则只适用于 streaming 或只适用于 persisted，那它就是错误的。

## 3. Chat 输出分类

Agent Chat 中 assistant 的可见输出，统一分成 4 类：

1. 正文 bubble
2. `TaskPlanCard`
3. `EditSummaryCard` / `ProposalNavigator`
4. `ToolCallCard`

不同类别有不同的 thinking 挂载规则。

## 4. Thinking 挂载总规则

### 4.1 thinking 不应优先单独成泡

除非没有任何可见宿主，否则 thinking 不应单独渲染成一个独立 bubble。

优先策略：

1. 挂到当前语义最接近的可见宿主上
2. 如果当前消息没有可见宿主，则挂到同轮次最近的前一个可见宿主
3. 只有在完全没有可挂载对象时，才允许独立显示 thinking

### 4.2 thinking 的挂载是显示层行为

thinking 实际属于哪条底层消息，不等于它最终必须显示在哪个 bubble 上。

前端可以为了可读性做宿主迁移，但必须遵守本规范。

## 5. `write_todos` 与 `TaskPlanCard`

### 5.1 显示归属

`write_todos` 不在 `AgentMessageBubble` 内直接渲染成普通 `ToolCallCard`。

它应单独映射为 `TaskPlanCard`。

### 5.2 thinking 挂载

与 `write_todos` 相关的 thinking 仍然显示在 `AgentMessageBubble` 中，不挂在 `TaskPlanCard` 上。

挂载规则：

1. 优先挂到它前面的正文 bubble 或普通 tool bubble
2. 如果前面没有可见宿主，则挂到后面的第一个可见宿主
3. 不为 `write_todos` 单独制造一个空白 bubble 只为了显示 thinking

### 5.3 不允许的情况

- `write_todos` 本身变成普通 `ToolCallCard`
- 因 `write_todos` 产生空白 assistant bubble
- `TaskPlanCard` 与 thinking 重复显示同一语义

## 6. Edit 相关 tool call

### 6.1 显示归属

edit 相关 tool call 不直接显示成普通 `ToolCallCard`。

它们统一映射到 edit domain UI：

- 审核中：`ProposalNavigator`
- 审核完成后：`EditSummaryCard`

### 6.2 thinking 挂载

与 edit proposal / edit summary 相关的 thinking，必须挂到 edit 宿主上：

- 审核阶段挂到 `ProposalNavigator` 所在宿主
- 结果阶段挂到 `EditSummaryCard` 所在宿主

在 `AgentMessageBubble` 内，这类 edit tool call 本体应视为不可见内容。

### 6.3 不允许的情况

- edit tool call 又显示成普通 `ToolCallCard`
- edit summary 有结果卡，但 thinking 被丢到旁边空 bubble
- 为了容纳 edit thinking 而额外产生一个只带时间戳的空消息

## 7. 其他 tool call 与 `ToolCallCard`

### 7.1 显示归属

除 `write_todos` 和 edit 相关 tool 外，其他 tool call 都使用 `ToolCallCard`。

### 7.2 连续 tool call 必须成组展示

连续的普通 tool call 必须以组的形式展示，而不是每条 persisted message 一张卡。

“连续”的判定基于显示层而不是原始消息数组：

- 同一轮次
- 中间没有正文 bubble
- 中间没有 edit summary / proposal review
- 中间没有真正可见的其他宿主
- 可以跨过最终不会显示出来的空 assistant message

### 7.3 thinking 挂载

当前存在的核心问题是：普通 tool call 带 thinking 时，经常无法参与分组。

规范要求：

1. 普通 tool call 即使带 thinking，也仍然要参与连续分组
2. 成组后的 thinking 统一挂到这组最后一个 `ToolCallCard` 所在宿主上
3. 不允许因为某条 tool message 带 thinking，就把整组拆散

### 7.4 不允许的情况

- streaming 中是成组的，persisted 后拆散
- 前两个 tool card 不分组，后几个分组，且差异只来自中间夹了不可见消息
- 组内某条 tool 的 thinking 消失
- thinking 被单独渲染成空 bubble，而不是挂到最后一个 tool 宿主

## 8. 空白 Bubble 规则

### 8.1 不允许的空白 bubble

以下消息不应显示为独立 bubble：

1. 没有正文
2. 没有可见 tool card
3. 没有 summary
4. 没有可见 thinking toggle

即使这条底层消息里存在：

- edit tool call
- `write_todos`
- 被其它宿主吸收的 thinking

也不应产生空白 bubble。

### 8.2 允许被吞掉的消息

前端可以吞掉以下仅具技术意义、无可见语义价值的 assistant 消息：

- 只有不可见 edit tool call 的消息
- 只有 `write_todos` 的消息
- 只有已被迁移到宿主的 thinking 的消息
- 没有任何正文和可见卡片的空消息

## 9. Proposal 审核体验规范

以下内容保留原有 `ProposalNavigator` 规范，并作为 Agent Chat 编辑域的一部分执行。

### 9.1 交互模型

审核 UI 必须拆成两个层级：

#### 9.1.1 批次审核层

只在“有多条 proposal”时出现。

包含内容：

- 批次标题
- 批次副标题
- 批次级按钮
- 帮助提示

这个层级只表达“当前在审核一批建议”，不表达当前建议的具体类型。

#### 9.1.2 当前建议层

始终存在。

包含内容：

- 当前建议标题
- 当前建议副标题/说明
- 定位按钮
- 当前建议详情区
- 当前建议审核按钮

这个层级负责表达当前 proposal 的类型和风险。

### 9.2 Proposal Kind

审核视图只基于 proposal kind，不再基于旧的 `EditSessionMode` 切 UI，`EditSessionMode` 需要清除。

支持的 kind：

- `edit`
- `insert`
- `replace_range`
- `delete`
- `create_file`

其中：

- `delete` 为高风险
- 其余 kind 为普通审核风险

### 9.3 颜色规则

#### 9.3.1 批次审核层

固定使用 warning 色系，因为它表示“待审核”。

约束：

- 不因为当前建议是 `delete` 而变红
- 不因为批次里包含 `delete` proposal 而变红

#### 9.3.2 当前建议层

颜色只和当前 proposal kind 有关：

- `delete`：error 色系
- `edit / insert / replace_range / create_file`：warning 色系

#### 9.3.3 外层容器

检查时要确保容器颜色不会把两个层级重新混起来：

- 多条 proposal 时，外层容器应保持 warning 色系，不跟随当前 delete 状态整体变红
- 单条 proposal 时，可以直接跟随当前建议类型

### 9.4 单条与多条规则

#### 9.4.1 单条 proposal

不显示批次审核层。

不显示以下信息：

- `当前第 1 / 1 条`
- 批次级摘要
- 批次级按钮

底部按钮文案应为：

- `接受`
- `跳过`
- `重做`

特殊情况：

- 单条 `delete` 可显示 `接受删除`

#### 9.4.2 多条 proposal

显示批次审核层。

当前建议标题应带序号：

- `[X / N] 当前建议`

底部按钮文案应为：

- `接受本条`
- `跳过本条`
- `重做本条`

特殊情况：

- 多条 `delete` 可显示 `接受本条删除`

### 9.5 批次层文案规则

#### 9.5.1 标题

批次标题必须稳定，不随着当前建议变化。

推荐文案：

- `建议审核`

#### 9.5.2 副标题

副标题应表达批次状态，而不是当前建议状态。

推荐结构：

- `当前文档 · 共 X 条建议 · 待审核 Y 条`

当有已处理结果时，可补充：

- `跳过 Y 条`
- `将修改 Z 条`
- `重做 W 条`

要求：

- 不需要强调已经审核完成的“已审核”字样
- 信息以审核决策为中心，而不是技术实现过程

### 9.6 批次级按钮语义

#### 9.6.1 接受所有建议

仅在“多条 proposal 且还没有任何审核进度”时显示。

语义：

- 直接接受当前批次全部待审核建议

#### 9.6.2 跳过剩余建议并继续

仅在“多条 proposal 且已经有部分审核进度”时作为主动作显示。

语义：

- 当前已经做出的审核决定保留
- 其余未审核 proposal 全部跳过
- 然后继续后续流程

#### 9.6.3 结束本轮修改

这是批次级退出动作。

语义：

- 直接结束这一轮审核
- 当前未处理 proposal 不再继续
- 不应被误解为“接受剩余建议”

检查要求：

- 这个动作的文案必须清楚表达“结束这一轮”
- 不得和“接受所有建议”混淆

### 9.7 当前建议层文案规则

#### 9.7.1 标题

当前建议标题结构：

- 单条：`当前建议`
- 多条：`[X / N] 当前建议`

高风险标识：

- 仅当前 suggestion 是 `delete` 时显示 `高风险`

#### 9.7.2 主标签

用于说明这条建议具体作用在什么对象上。

示例：

- `当前文档 · 编辑块 {b:57}`
- `当前文档 · 插入到 {b:76} 之后`
- `当前文档 · 替换 {b:76}–{b:119}`
- `当前文档 · 删除块 {b:11}`
- `新建文档：xxx`

要求：

- 不重复堆叠同一条位置信息
- 当前建议区域的信息密度应高于旧版，但不要冗余

#### 9.7.3 副标题

这里放 proposal 的说明性内容，例如：

- 修改原因
- 风格目标
- 风险说明

不要重复主标题已经表达过的信息。

### 9.8 当前建议详情区规则

不同 kind 的详情区不同。

#### 9.8.1 `edit`

使用 diff 结构展示：

- 左侧原文
- 右侧修改后

右侧允许直接编辑。

#### 9.8.2 `replace_range`

使用 diff 结构展示整段替换：

- 左侧原范围内容
- 右侧替换后内容

右侧允许直接编辑。

#### 9.8.3 `insert`

展示“建议插入内容”。

要求：

- 默认可读
- 点击后进入编辑
- 编辑态高度不能过短，不能明显弱于 diff 区

#### 9.8.4 `delete`

不展示伪造的“修改前 / 修改后” diff。

应展示：

- 将被删除的原文

文案重点：

- 用户接受后会删除这段内容
- 删除建议是高风险审核动作

#### 9.8.5 `create_file`

展示：

- 文件名
- 文档内容预览

要求：

- 文件名直接使用 proposal 提供的值
- UI 不应私自追加 `.md`
