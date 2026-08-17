# Deep Agents 主 Agent 的 Prompt 装配设计

> 基于 deepagents monorepo（SDK v0.7.5 / code v0.1.54）源码分析整理。
> 用于指导自定义 agent 的 prompt 构建。

---

## 1. 装配机制总览

Deep Agents 的 system prompt 通过 **两阶段、单链** 构建：

| 阶段 | 机制 | 说明 |
|------|------|------|
| **阶段一** | `system_prompt` 参数 | 调用者传入的字符串，作为初始 `SystemMessage` 传入 LangChain `create_agent()` |
| **阶段二** | 中间件 `wrap_model_call` 链 | 每个中间件按注册顺序调用 `append_to_system_message()` 追加内容 |

所有追加通过 `append_to_system_message()` 完成，段与段之间用 `\n\n` 分隔。

---

## 2. 完整装配顺序（从上到下）

```
┌─────────────────────────────────────────────────────────┐
│ ① system_prompt.md 基础提示词（模板 + 动态插值）            │
│    来源: CLI 层 get_system_prompt()                       │
├─────────────────────────────────────────────────────────┤
│ ② HarnessProfile.base_system_prompt（如有配置）            │
│ ③ HarnessProfile.system_prompt_suffix（如有配置）          │
├─ ─ ─ ─  中间件 wrap_model_call 链开始  ─ ─ ─ ─ ─ ─ ─ ─ ┤
│                                                         │
│ 【SDK 核心堆栈】                                          │
│ ④ SkillsMiddleware       —— 可用技能列表 + 使用指南        │
│ ⑤ FilesystemMiddleware   —— 虚拟路径→主机路径映射          │
│ ⑥ SubAgentMiddleware     —— 子 agent 类型说明（默认空）    │
│                                                         │
│ 【CLI 自定义中间件插入点】                                  │
│ ⑦ LocalContextMiddleware —— git 分支、目录树、运行时版本等  │
│    其他 CLI 中间件（多数不改 system_message）               │
│                                                         │
│ 【SDK 尾部堆栈】                                          │
│ ⑧ AnthropicPromptCachingMiddleware —— 不修改 prompt      │
│ ⑨ MemoryMiddleware       —— 记忆内容 + 记忆管理指南        │
│ ⑩ HumanInTheLoopMiddleware —— 不修改 prompt              │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 各层详细说明

### 3.1 ① system_prompt.md 基础提示词（CLI 层）

来源：`libs/code/deepagents_code/system_prompt.md`，通过 `get_system_prompt()` 动态插值。

**设计理由**：这是 agent 的"人格"——SDK 是模型无关的，不规定 agent 是谁、怎么说话。CLI 层赋予具体 persona。

**插值变量**：

| 变量 | 内容示例 | 来源 |
|------|---------|------|
| `{mode_description}` | `"an interactive TUI on the user's computer"` | `interactive` 参数决定 |
| `{interactive_preamble}` | 交互模式行为指南 | `interactive` 参数决定 |
| `{ambiguity_guidance}` | 模糊指令处理策略 | `interactive` 参数决定 |
| `{model_identity_section}` | 模型名/provider/上下文限制 | `settings.model_name` 等 |
| `{filesystem_tool_guidance}` | `edit_file` 优先于 `sed` 等偏好 | `fs_tools` 允许列表 |
| `{working_dir_section}` | 当前工作目录 | 本地 `cwd` 或沙箱默认路径 |
| `{skills_path}` | `~/.deepagents/{agent_id}/skills` | `assistant_id` |

### 3.2 ④ SkillsMiddleware（SDK 层）

**注入内容**：

```markdown
## Skills System

You have access to a skills library that provides specialized capabilities.

**Available Skills:**
- `skill-name`: 描述

**How to Use Skills (Progressive Disclosure):**
1. Recognize when a skill applies
2. Read the skill's full instructions using `read_file`
3. Follow the skill's instructions
```

**设计理由**：Skills 不是 native function calling tools——它们是 markdown 文件，需要模型用 `read_file` 渐进式读取。必须在 prompt 中告知模型有哪些技能可用以及如何使用。元数据来自 YAML frontmatter，完整指令不注入（节省 token）。

### 3.3 ⑤ FilesystemMiddleware（SDK 层）

**仅在 CompositeBackend + execute 工具活跃时注入**。内容为 `_route_host_path_prompt()`：

```markdown
## Shell paths vs. virtual paths

The `execute` tool runs commands in the host shell.

Host path mappings:
- /workspace/ -> /tmp/sandbox-abc/
- /secrets/  -> (无映射：shell 无法访问，请用文件工具)
```

**设计理由**：CompositeBackend 下有多个文件系统（StateBackend 虚拟路径 + HostBackend 真实路径）。`read_file` 和 `execute` 是两个独立工具，各自只知道自己的路径——没有工具能自动告诉模型路径映射关系。必须在 prompt 中告知，让模型自己决定如何转换路径。

> **为什么不静默转换？** deepagents 选择"告知模型"而非"框架层自动替换路径"，原因是：① 避免误替换；② 模型明确知道自己运行在什么环境；③ 透明可解释。

### 3.4 ⑦ LocalContextMiddleware（CLI 层）

在会话开始时通过后端 shell 运行 bash 检测脚本，输出注入 prompt：

```markdown
## Local Context

**Current Directory**: `/Users/xxx/project`
**Project**: Python package (`pyproject.toml`)
**Package Managers**: uv 0.7.x
**Detected Runtimes**: Python 3.12, Node 22
**Git**: Current branch `main`, 3 uncommitted changes
**Files** (showing 20 of 25):
- AGENTS.md
- src/
- tests/
**Tree** (3 levels):
src/
├── main.py
└── utils.py
**Run Tests**: `pytest`
**LangSmith Tracing**: ...
```

**设计理由**：

| 信息 | 解决的问题 |
|------|-----------|
| git 分支 + 未提交变更 | 避免在错误分支操作；有未提交变更时执行危险命令更谨慎 |
| 目录树 + 文件列表 | 省去每轮对话都 `ls` 一遍的固定开销 |
| 包管理器版本 | 生成正确命令：`uv sync` 而非 `pip install` |
| 运行时版本 | 生成兼容代码：Python 3.12 可用新语法 |
| 测试命令 | 知道用 `pytest` 还是 `make test`，不用猜 |
| Makefile 前 20 行 | 一眼看到可用 make target |
| gh CLI JSON 字段 | 知道可用的 GitHub 搜索字段 |

**为什么是 CLI 层**：SDK 不知道运行环境——有没有 shell？有没有 git？有没有 tree？这些只在 dcode 这个"编码助手"场景下有意义的上下文，由 CLI 层负责。

**缓存策略**：环境快照产生后存入 `state["_local_context"]`（私有状态），整个对话期间不刷新（除非 summarization）。避免 git status 变化导致 system prompt 变化 → 破坏 Anthropic prompt cache 命中率。

### 3.5 ⑨ MemoryMiddleware（SDK 层）

```xml
<agent_memory>
~/.deepagents/my-agent/AGENTS.md
(用户级记忆内容)

/project/.deepagents/AGENTS.md
(项目级记忆内容)
</agent_memory>

<memory_guidelines>
    Trust and verification / Learning from feedback /
    When to update / When NOT to update
</memory_guidelines>
```

**设计理由**：记忆是上下文知识而非可调用工具，必须通过 prompt 注入。记忆内容中的 HTML 注释（如 `<!-- deepagents:onboarding-name:start -->`）在注入前被剥离，对模型不可见。

---

## 4. SDK vs CLI 职责分离

```
┌─────────────────────────────────────────────────────┐
│  deepagents SDK（框架层）                              │
│  · 中间件基础设施                                      │
│  · 通用能力：Skills、Memory、Filesystem 路径映射        │
│  · 模型无关、部署环境无关                                │
│  · system_prompt 参数由调用者自行传入                    │
├─────────────────────────────────────────────────────┤
│  deepagents-code / dcode（产品层）                     │
│  · 具体的 persona："You are a deep agent..."          │
│  · 运行时上下文：当前目录、模型名、上下文窗口大小            │
│  · 产品策略："edit_file 优先于 sed/awk"                 │
│  · 环境探测：git 分支、目录树、包管理器版本                │
└─────────────────────────────────────────────────────┘
```

| 内容 | 归属 | 原因 |
|------|------|------|
| Skills 列表 | SDK | 技能是框架通用能力 |
| 虚拟路径映射 | SDK | CompositeBackend 是框架概念 |
| Memory 记忆 | SDK | 记忆是框架通用能力 |
| 基础 persona | CLI | SDK 不规定 agent 是谁 |
| 模型身份 | CLI | SDK 接受任意模型，不知道具体是谁 |
| 工具使用偏好 | CLI | 产品策略，SDK v0.7.0 已删除类似指引 |
| 工作目录 | CLI | 运行时概念，SDK 不知道部署在哪 |
| 环境上下文 | CLI | 需要真实 shell，只在编码场景有意义 |

---

## 5. 为什么 Tools 不在 Prompt 装配中

Tools（`read_file`、`edit_file`、`execute` 等）**走 LLM API 原生的 function calling 通道**，而非 prompt 文本：

```python
create_agent(
    model,
    system_prompt=final_system_prompt,  # ← 文本通道
    tools=_tools,                       # ← 原生 function calling 通道
)
```

**SDK v0.7.0 刻意删除了工具使用的 prompt 文本指引**，因为工具自身的 `description` 和 `args_schema` 已经通过原生 API 传给模型，再往 prompt 写一遍浪费上下文。

**反例印证**（为什么某些内容必须走 prompt）：

| 注入到 prompt 的内容 | 为什么不走 function calling |
|---------------------|---------------------------|
| Skills 描述 | 不是 tools，是 markdown 文件，需渐进式读取 |
| SubAgent 描述 | 通过 `task` 工具调用，但需文本指引告诉模型何时用哪个 |
| Memory 内容 | 上下文知识，不是可调用函数 |
| Host path 映射 | `execute` 工具不知道虚拟路径→主机路径的映射 |

---

## 6. 中间件注册顺序（决定 wrap_model_call 执行顺序）

在 `create_deep_agent()`（`libs/deepagents/deepagents/graph.py`）中：

```
基础堆栈:
  1. SkillsMiddleware           (如有 skills)
  2. FilesystemMiddleware       (始终存在)
  3. SubAgentMiddleware          (如有子 agent)
  4. SummarizationMiddleware    (始终存在)
  5. PatchToolCallsMiddleware   (始终存在)
  6. AsyncSubAgentMiddleware    (如有异步子 agent)

      <<< 用户自定义中间件插入点 >>>

尾部堆栈:
  7. 缓存中间件 (Anthropic/Bedrock/Fireworks)
  8. MemoryMiddleware            (如有 memory)
  9. HumanInTheLoopMiddleware    (如有 interrupt_on)
```

**关键设计决策**：
- **用户中间件在尾部堆栈之前**：自定义中间件先于缓存/记忆/HITL 执行
- **缓存中间件在 Memory 之前**：Memory 更新会改变 system prompt → 必须放在缓存之后，避免破坏缓存前缀
- **Skills 在最前面**：技能是"可用能力"，应在行为指南之后、记忆之前

---

## 7. 自定义 Agent 构建指南

基于以上分析，构建自定义 agent 的 prompt 装配建议：

### 7.1 使用 SDK 自带的能力（无需自己实现）

- **Skills 系统**：通过 `skills` 参数传入技能目录，SDK 自动注入技能列表
- **Memory 系统**：通过 `memory` 参数传入记忆后端，SDK 自动注入记忆内容
- **SubAgent**：通过 `subagents` 参数配置，SDK 自动注入子 agent 说明
- **Filesystem 路径映射**：使用 CompositeBackend 时自动注入

### 7.2 需要在调用层自己实现的内容

- **基础 persona prompt**：通过 `system_prompt` 参数传入，定义 agent 是谁、怎么说话
- **模型身份信息**：告诉模型自己运行在哪个模型上、上下文窗口大小
- **运行时上下文**：工作目录、环境变量、项目结构等
- **产品级策略**：工具使用偏好、安全策略、行为约束等

### 7.3 中间件选择

- 每个中间件通过 `wrap_model_call` 追加 prompt 内容
- 条件性注入（如"仅当某个工具活跃时"）可以节省 token
- 静态上下文应缓存到 state 中，避免每次模型调用都重新计算（参考 `LocalContextMiddleware` 的设计）
- 注意中间件顺序：会影响 prompt 中内容的排列和缓存命中率

### 7.4 信息通道选择

| 信息类型 | 推荐通道 | 理由 |
|---------|---------|------|
| 可调用的函数/API | function calling（tools 参数） | 原生协议，无需消耗 prompt token |
| 上下文知识 | system prompt | LLM 需要在推理时知道 |
| 运行时元信息 | system prompt | 模型和工具都不知道的信息 |
| 使用策略/偏好 | system prompt | 这是"如何做"而非"能做什么" |
