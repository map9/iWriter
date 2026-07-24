# File System 重设计 — 按 deepagents-cli 思路实现脚手架

## Context

iWriter 当前的文件系统层（`WorkspaceFilesystemBackend` / `AttachedFileBackend` / `FilesystemMounts`）把用户工作区与附件全部映射到虚拟路径（`/`、`/attached_files/<slug>`、`/attached_dirs/<slug>`），模型只看见虚拟路径，看不见 host 绝对路径。这导致两类问题：

1. 用户在 prompt 中提到 `/Users/me/file.txt` 这种 host 绝对路径时，模型无法 `read_file` 它（不在任何虚拟挂载下）。
2. creative 域的写保护硬编码在 `WorkspaceFilesystemBackend.isCreativeWriteAllowed`，跟 deepagents 的标准机制（permissions / interrupt_on）脱节。

之前的虚拟路径方案（`AgentPromptPathExtractor` + `<resolved_prompt_paths>` 等）已作废。本次按 **deepagents-cli**（`/Users/sunyafu/zebra/temp/deepagents/libs/deepagents-cli/deepagents_cli/agent.py`）的做法重写文件系统层，并保留"脚手架"形态（两个 domain 共用一个构造入口）。

## 设计原则（与 deepagents-cli 对齐）

参考 `agent.py:325-512` 的 `create_cli_agent`：

1. **主 backend = `FilesystemBackend({ rootDir: workspace, virtualMode: false })`**。模型直接用 host 绝对路径，也可用 workspace 相对路径（backend 自动基于 rootDir 解析，参 `node_modules/deepagents/dist/index.d.ts:1219-1222`）。这是 iWriter 文件读写的主路径，并不只服务 skills/副通道。
2. **CompositeBackend 路由只用于框架副通道**：`/large_tool_results/` 与 `/conversation_history/` 都路由到 `mkdtempSync` 出的临时目录（`virtualMode=true`）。这两个前缀**不是 deepagents-cli 特有的**——它们是 deepagents 框架内 `FilesystemMiddleware` 在 tool 结果超 token 阈值（默认 ~20k tokens for tool, ~50k for human message）时自动驱逐目标。不路由的话驱逐文件会落到 workspace。**不再有 `/skills/`、`/attached_files/`、`/attached_dirs/` 虚拟路由。**
3. **Skills 用 `createSkillsMiddleware`** 显式传 middleware（不再用 `createDeepAgent` 的 `skills:` 参数）。Middleware 自带 `FilesystemBackend()`，sources 是 host 绝对路径。

   **嵌套 skills 不自动发现。** 验证过 `deepagents/middleware/skills.py:284-356` 的 `_list_skills`：只扫描每个 source 下一层子目录，每个子目录找 SKILL.md，不递归。所以 sources 必须显式列出每一层：

   ```ts
   sources: [
     path.join(aiRootPath, 'skills'),                  // /skills/<name>/SKILL.md
     path.join(aiRootPath, 'skills', 'writing-style'), // /skills/writing-style/<slug>/SKILL.md
   ]
   ```

   将来新增 `/skills/<category>/<skill>` 这种嵌套，必须再加一条 source。
4. **写保护用 `interruptOn`**（HITL）—— 对应 deepagents-cli 的 `_add_interrupt_on`。本次给 `write_file` / `edit_file` 加 HITL 入口；creative / edit 域已有的领域工具 HITL（`confirm_writing_plan`、`replace_range` 等）保持不变。原来的 `isCreativeWriteAllowed` 写门控移除（被 HITL 替代）。
5. **"用 host 绝对路径"规则写进 system prompt 源码**（creative.ts / edit.ts）。这是**静态规则**，不是 per-session 动态内容——源码改一次后所有新会话 prompt 一致，cache 正常命中。Workspace 路径继续由 user message 里的 `<runtime_context>`（ContextBuilder 已实现，delta-aware）承载，附件路径也由 `<runtime_context>` 嵌套的 `<attached_files>` / `<attached_dirs>` 承载（同样 ContextBuilder 已实现）。**不引入 `<filesystem_rules>` 块、不引入 scaffold.promptBlock**。

## 脚手架定义

新增**单个**文件 `electron/ai/runtime/filesystem/AgentFilesystem.ts`（不为这点代码量拆 4 个文件，遵守 CLAUDE.md "NEVER create files unless absolutely necessary"）。

```ts
export interface BuildAgentFilesystemInput {
  workspacePath: string | null
  aiRootPath: string
  includeSkills: boolean  // true=creative, false=edit
}

export interface AgentFilesystemScaffold {
  backend: CompositeBackend
  middlewares: AgentMiddleware[]                  // [SkillsMiddleware] 仅 creative
  interruptOn: Record<string, InterruptOnConfig>  // write_file/edit_file HITL
  interruptOnNames: Set<string>                   // ['write_file','edit_file']，rehydrate 用
  tempDirs: string[]                              // [largeResultsDir, conversationHistoryDir]，Phase B 清理用
  fingerprint: string                             // 用于 agent cache key
}

export function buildAgentFilesystem(input: BuildAgentFilesystemInput): AgentFilesystemScaffold
```

> `InterruptOnConfig` 优先从 `deepagents` 包导入；若导出未公开，则在 `AgentFilesystem.ts` 内保留本地 structural type（与 deepagents 的字段保持一致）。

**fingerprint** 只拼接 **workspace + includeSkills**。附件不进 input、不进 fingerprint——附件不再影响 backend / middleware / interruptOn / system prompt 任何 agent 配置；附件路径完全由 ContextBuilder 写入 `<runtime_context>` 内的 `<attached_files>` / `<attached_dirs>`，对 agent 是透明的。同一 thread 切换附件不重建 agent。

### Backend 构造

- 主 backend：`new FilesystemBackend({ rootDir: workspacePath ?? path.join(aiRootPath, 'empty-fs'), virtualMode: false })`
- 副通道两个临时目录 backend，每次构造时 `fs.mkdtempSync(path.join(os.tmpdir(), 'iwriter-...'))`，`virtualMode: true`
- 组合：`new CompositeBackend(main, { '/large_tool_results/': ..., '/conversation_history/': ... })`

### Skills middleware（includeSkills=true 时）

```ts
import { createSkillsMiddleware, FilesystemBackend } from 'deepagents'
createSkillsMiddleware({
  backend: new FilesystemBackend(),  // 无 rootDir，与 deepagents-cli 一致
  sources: [
    path.join(aiRootPath, 'skills'),
    path.join(aiRootPath, 'skills', 'writing-style'),
  ],
})
```

Sources 是 host 绝对路径。Middleware 自动把 skill metadata（包含 host SKILL.md 路径）注入 system prompt。

**Subagent skills 边界**：`SkillsMiddleware` 只挂在**主 agent** 上，所有自定义 subagent（planner / consistency / researcher / explorer / writingExtractor / writingStyleSkillCreator）不会自动继承 skills 注入。当前所有 subagent 都是显式构造的 custom subagent，**不依赖** skills 列表（仅 researcher subAgent 内 systemPrompt 写了 `skills: ['/skills/']`，本次顺带删除该字段——见下文 researcher.ts 改动）。将来若新增需要 skills 的 subagent，必须为它显式挂 SkillsMiddleware，不能依赖 deepagents 自动注入 general-purpose subagent 的行为（我们项目并未使用 general-purpose subagent）。

### interruptOn 公共集

```ts
const FILE_WRITE_INTERRUPT_ON: Record<string, InterruptOnConfig> = {
  write_file: { allowedDecisions: ['approve', 'reject'] },
  edit_file:  { allowedDecisions: ['approve', 'reject'] },
}
```

Domain 自己的 interruptOn 在 AgentEngine 处与此合并。

### user message 注入 — 不引入新块

`<runtime_context>` 已由 `src/ai/thread/ContextBuilder.ts` 完整构建：

```
<runtime_context change="full">
  <workspace>/Users/me/MyNovel</workspace>
  <active_document path="..."> <outline>...</outline> <cursor_section>...</cursor_section> </active_document>
  <open_tabs>
    <tab path="..." status="saved" />
  </open_tabs>
  <attached_files>
    <file path="/Users/me/notes/character.md" />
  </attached_files>
  <attached_dirs>
    <dir path="/Users/me/research/" />
  </attached_dirs>
</runtime_context>
```

附件路径就是 host 绝对路径，且支持 delta（`change="attachments_only"` 等）。**scaffold 不输出任何 user message 块**——所有 workspace / 附件信息都从 ContextBuilder 走。

"用 host 绝对路径"规则写到 system prompt 源码（见下文 creative.ts / edit.ts 修改）。

---

## 文件变更清单

### 新增（2 个）

- `electron/ai/runtime/filesystem/AgentFilesystem.ts` — 上述脚手架实现。
- `electron/ai/ipc/FilesystemReviewAdapter.ts` — write_file / edit_file 的通用 review item 构造器（见下文 Review item 处理段）。

### 修改（7 个）

#### `electron/ai/AgentEngine.ts`

**Cache lifecycle 关键约束**：scaffold 与 agent 必须 1:1 绑定 —— 旧设计"sendMessage 先 build scaffold，再查 agent cache"会在 cache 命中时让 agent 跑旧 backend、threadScaffolds 指向新 scaffold，新建的 tmpdir 直接泄漏，`getSessionContextStats` 数据也不一致。修正：**cache value = `{ agent, scaffold }`，scaffold 只在 cache miss 时构造**。

- L78 附近增加 `private agentCache = new Map<string, { agent: DeepAgentInstance, scaffold: AgentFilesystemScaffold }>()`（替换原 `Map<string, DeepAgentInstance>`）。删除 `threadScaffolds` 这个 map 的想法 —— 通过 cache value 携带 scaffold 即可。
- L199-215 区域，`sendMessage` 不预先 build scaffold；只准备 `workspacePath` 等参数透传给 `_getOrCreateAgent`。`buildUserMessage` 签名**不变**。
- L703 `const mounts = this._getFilesystemMounts(threadId)` 与 L707-708 的 `mountKey` 全部删除。
- L708 cacheKey 不再含 mountKey；改为含 workspacePath 直接拼（fingerprint 等价语义就是 `workspace + includeSkills`，但 includeSkills 由 domain 决定，已在 cacheKey 含 domain）。
- L709 cache hit 路径：`const cached = this.agentCache.get(cacheKey); if (cached) return cached.agent`。**scaffold 不重建、tmpdir 不泄漏**。
- L710-712 cache miss 路径：先 `const scaffold = buildAgentFilesystem({workspacePath, aiRootPath, includeSkills})`，再走后续 capabilities 与 createDeepAgent。
- L712 `buildCapabilities({ mode, mounts, language })` 改为 `buildCapabilities({ mode, workspacePath, language })` —— domain 不再消费 mounts，但仍需要 workspacePath 来构造业务工具。
- L726-758 `createDeepAgent({ ..., backend: scaffold.backend, middleware: [...scaffold.middlewares, ...existingMiddlewares], interruptOn: { ...capabilities.interruptOn, ...scaffold.interruptOn } })`。`skills:` 参数完全不再传（被 SkillsMiddleware 替代）。
- L760 `this.agentCache.set(cacheKey, { agent, scaffold })`。
- 新增私有方法 `_getScaffoldForThread(threadId)`：从最近一次为该 threadId 命中的 cache value 取 scaffold（用于 `getSessionContextStats`、`_maybeRehydrateInterrupt` 等读 scaffold 的路径）。如果当前 thread 没有任何 cache 项（极端 HITL resume 边缘场景），fallback 临时 build 一个**不入 cache**的 scaffold —— 这是只读路径，不会引起持久状态不一致。
- L797-804 `_getFilesystemMounts` 删除。
- L864-870 `getSessionContextStats` 中相同的 mounts 取用点同步改为读 `_getScaffoldForThread`。
- `deleteThread` 路径无需特别清理（agentCache 已按 cacheKey 持有，新 thread 自然 miss）；如有 tmpdir 清理需求，迭代 cache value、调 scaffold.tempDirs 上的 rmSync。
- **L641 `_maybeRehydrateInterrupt` 关键修补**：原来 `interruptOnNames = strategies[domain].getInterruptOnNames()` 不包含 scaffold 的 write_file/edit_file，重启后无法识别 pending 的 write_file。改为：
  ```ts
  const scaffold = this._getScaffoldForThread(threadId)
  const interruptOnNames = new Set([
    ...this.strategies[domain].getInterruptOnNames(),
    ...(scaffold?.interruptOnNames ?? []),
  ])
  ```

#### `electron/ai/ipc/UserMessageBuilder.ts`

- 签名不变（只接 req）。
- 删除 `<context_files>` 整段（L19-21）。
- 删除 `<filesystem_roots>` 整段（L23-30）。
- 删除对 `buildFilesystemMounts` / `describeFilesystemMounts` 的 import。
- **Fallback 路径补强**：L10-17 当 `editorContext.editorStateXml` 缺失时自建的简化 `<runtime_context>` 目前只输出 `<file>` + `<workspace>`，缺 `<attached_files>` / `<attached_dirs>`。这条 fallback 路径会让模型看不到附件，需要在此 fallback 块里同步嵌入 `<attached_files>` / `<attached_dirs>`（host 绝对路径），与 ContextBuilder 输出结构一致。
- **XML escape**：fallback 自拼 XML 时，所有路径字符串必须 escape `&` → `&amp;`、`"` → `&quot;`、`<` / `>` → `&lt;` / `&gt;`，避免路径里有特殊字符破坏 XML 结构。复用项目已有的 XML escape 工具，或在 UserMessageBuilder 局部加一个 4 行的 `escapeXml(s: string)`。

#### Review item 处理 — write_file / edit_file 新增 HITL 入口

scaffold 引入 `write_file` / `edit_file` 到 `interruptOn` 后，两个 domain 现有的 `buildReviewItems` 都会出问题：

- **Creative**：`CreativeReviewAdapter.ts:326-328` fallback 把任何未知工具当成 `rebuild_storybible`，UI 渲染"重建 storybible"审批弹窗，完全错。
- **Edit**：`EditDomainStrategy.buildReviewItems` 不过滤工具名，直接喂给 `buildProposalFromAction`，那是 block edit proposal 逻辑，对 write_file 同样错。

修法：引入**通用 filesystem review item**，两个 domain strategy 在 `buildReviewItems` 入口处先识别 `write_file` / `edit_file`，命中则发通用 review item；不命中再走 domain-specific 逻辑。

- 新增 `electron/ai/ipc/FilesystemReviewAdapter.ts`，导出 `buildFilesystemReviewItemFromAction(action, toolCallId, sourceMessageId, sourceTurnId): FilesystemReviewItem`。
- 新增 `kind: 'filesystem'` 到 `DomainReviewItem` 联合类型；payload 字段：`toolName ('write_file'|'edit_file')`, `targetPath`, `newContent?`, `oldString?`, `newString?`, `toolCallId`, `sourceMessageId`, `sourceTurnId`。
- `CreativeDomainStrategy.buildReviewItems` 与 `EditDomainStrategy.buildReviewItems` 在循环 actionRequests 时先判断 `ar.name === 'write_file' || ar.name === 'edit_file'`，命中产 filesystem review item；否则走原 domain 逻辑。
- Renderer 端审批面板新增 filesystem review item 渲染：显示目标路径、diff（edit_file 用 oldString/newString，write_file 显示 new content），风险提示（覆盖文件 / 修改外部文件等）。

#### `electron/ai/domain/types.ts`

```ts
export interface DomainAgentCapabilities {
  tools: StructuredTool[]
  subAgents?: SubAgent[]
  interruptOn?: Record<string, InterruptOnConfig>
}
```

去掉 `backend`、`skills` 字段——这两件事 scaffold 接管。

#### `electron/ai/domain/creative/buildCreativeCapabilities.ts`

- 签名改为 `buildCreativeCapabilities({ aiRootPath, workspacePath, creativeDb, snapshotBroker, language, onSkillsMutated })`。
- 删除 `mounts` 参数与所有 `workspaceMount` / backend 构造代码（L34-45 整块），删除 `CREATIVE_SKILL_SOURCES` 与 `skills` 字段。
- 仍构造领域工具（tools、subAgents、CREATIVE_INTERRUPT_ON_CONFIG），其余不变。

#### `electron/ai/domain/edit/buildEditCapabilities.ts`

- 签名 `buildEditCapabilities({ snapshotBroker, language })`（去掉 aiRootPath、mounts）。
- 删除 L17-35 的 backend 构造与 `AttachedFileBackend` import。
- 返回 `{ tools: [...docTools, ...editTools], interruptOn: EDIT_INTERRUPT_ON_CONFIG }`。

#### `electron/ai/domain/DomainStrategy.ts`、`creative/CreativeDomainStrategy.ts`、`edit/EditDomainStrategy.ts`

- `buildCapabilities` 入参签名同步更新（去 mounts，加 workspacePath if needed）。

#### `src/ai/thread/system-prompts/creative.ts`

- 在开篇角色定义之后新增 `## File Paths` 段（静态规则，一次性源码改动，cache 友好）：
  > All filesystem tool paths (`read_file`, `write_file`, `ls`, `grep`, `glob`) must be host absolute paths. The current workspace path is provided in `<workspace>` inside each user message's `<runtime_context>`; use it to construct absolute paths. Attached files and directories list host absolute paths inside `<attached_files>` / `<attached_dirs>`. Do not invent virtual paths like `/draft/...`, `/attached_files/...`, or `/skills/...`.
- 第 183-184 行 "Author writing style" 段中 `/skills/writing-style/<slug>/SKILL.md` 改为：
  > Check the skills list (injected by the skills middleware in this system prompt) for a matching author style. Read its `SKILL.md` by the host absolute path provided in the skill metadata.
- 第 162-176 行 "## Skills" 段中纯名字（如 `character-complexity`）保持不变——它们只是命名引用，不是路径。

#### `src/ai/thread/system-prompts/edit.ts`

edit.ts 涉及多处虚拟路径表述清理，**全部为一次性源码改动**：

- 开篇增加 `## File Paths` 段，文案与 creative.ts 相同。
- L112-114 整段删除（描述 `<filesystem_roots>` 与 `/attached_dirs/...` 等虚拟工具路径）。
- L221 "use generic deepagents file tools through the **virtual paths** listed in `<filesystem_roots>`" → 改为 "use generic file tools with the host absolute path shown in `<attached_files>` / `<attached_dirs>`"。
- L228-229 "Never pass... **virtual mount path like `/attached_dirs/...` or `/attached_files/...`**" → 改为 "Always pass real absolute host paths as shown in `<workspace>` / `<attached_files>` / `<attached_dirs>`"。
- L257 "Generic deepagents file tools operate on **virtual roots** from `<filesystem_roots>`" → 改为 "Generic file tools accept host absolute paths; workspace-relative paths resolve under the workspace shown in `<runtime_context>`"。
- L86-114 内其他 `<workspace>` / `<attached_files>` / `<attached_dirs>` / `<open_tabs>` 引用保留——这些 tag 在 runtime_context 内仍然存在。

### 删除（3 个）

scaffold 接管后 legacy 文件全部无引用：

- `electron/ai/runtime/WorkspaceFilesystemBackend.ts`
- `electron/ai/runtime/AttachedFileBackend.ts`
- `electron/ai/runtime/FilesystemMounts.ts`

附件不再有虚拟挂载，模型直接用 host 路径访问，由主 backend（`virtualMode=false`）处理。读取 host 路径默认允许，写入由 `interrupt_on` 拦截。

### `IWriterAgentContextSchema`（`electron/ai/runtime/AgentContext.ts`）

无需调整。本次设计不在 context 里塞 resolver 之类的对象——deepagents-cli 也没有。

### 其他清理项

#### `electron/ai/ipc/MessageAdapter.ts`

L318-322 的 history strip 正则：
- `<runtime_context>` strip 保留。
- `<context_files>` strip **删除**——不再兼容旧 thread，允许旧块出现在历史记录中或直接忽略。
- `<filesystem_roots>` strip **删除**——同上，不再保留。
- **不需要新增**——本次设计不再向 user message 注入新块。

#### `electron/ai/domain/creative/subAgents/researcher.ts`

- L35 示例输出 `"sourceFiles": ["/attached_files/..."]` 改为 host 绝对路径示例（如 `["/Users/me/notes/source.md"]`）。
- L52 `skills: ['/skills/']` 字段删除——SubAgent 不通过 SkillsMiddleware 自动注入 skills（见上文 "Subagent skills 边界"）。如果 Researcher 真的需要某个 skill，应该在它的 systemPrompt 内显式写明 SKILL.md 的 host 路径供 read_file 用。

#### `electron/ai/tools/DocumentTools.ts`

`isVirtualDocumentPath()`（L30-36）与相关错误消息保留——作为防御性提示，模型万一误用 `/attached_files/...`，错误消息引导其改用 host 路径。其引用的 `<workspace>` / `<attached_files>` / `<attached_dirs>` tag 仍准确（这些 tag 在 runtime_context 内继续存在）。

#### 注释清理（低优先级，不阻塞）

- `src/ai/types.ts` L465：注释 "listed in `<context_files>` system prompt section" → "listed in `<attached_files>` inside `<runtime_context>`"。
- `src/components/ai/agent-panel/composables/useChatSend.ts` L14：同上。

---

## Threat model

本次方案明确**信任本机用户授权**模型，对齐 deepagents-cli。具体边界：

- **读**：模型可读任何 host 绝对路径下的文件，包括 workspace 外、prompt 提到的、attachments 列出的。这是设计目标：用户在 prompt 里贴 `/Users/me/Desktop/luxu.txt`，模型必须能 `read_file` 它。
- **写**：所有 `write_file` / `edit_file` 必须经 HITL 审批（scaffold 注入 `interruptOn`）。Domain 自己的写工具（`write_to_chapter` / `replace_range` 等）维持各自既有 HITL。
- **不引入读 allowlist / read permission**。如果将来产品策略要求"只允许读 workspace 内 + 显式 attachment"，需要走 `FilesystemPermission` 数组方案或自定义 backend 拦截，**不能只靠 system prompt 文案约束** —— system prompt 是行为引导，不是边界，模型可能因 user prompt 注入或推理偏差越界。
- **副通道**：`/large_tool_results/` 与 `/conversation_history/` 路由到 tmpdir，避免框架驱逐文件落入 workspace 污染用户数据。

## 关键设计取舍

| 选择 | 理由 |
|---|---|
| `virtualMode: false` + `rootDir: workspace` | 模型用 host 绝对路径直接访问任何文件（含 prompt 中提到的）；同时支持 workspace 相对路径（`read_file('storybible.md')` → `<workspace>/storybible.md`）。匹配 deepagents-cli `agent.py:435`。 |
| `SkillsMiddleware` 显式传 middleware，删 `skills:` 参数 | 完全对齐 `agent.py:425-430`。Middleware 自带 backend、sources 是 host 路径；不再依赖 `/skills/` 虚拟路由。注意 `_list_skills` 不递归，每层嵌套要显式列 source。 |
| 写保护用 `interrupt_on`，不用 `permissions` | deepagents-cli 全程不用 `permissions`（`agent.py:464-470`）。Permission 数组对 host 绝对路径 + 跨平台路径（macOS / Windows）的兼容性差。HITL 已经是 iWriter 现有机制（`EditProposalTools` 等），保持一致。 |
| 仍保留 scaffold 入口而不让 domain 直接调用 deepagents API | 两个 domain 共享：backend + 副通道 routes + write HITL。差异仅在 `includeSkills`。scaffold 是 `create_cli_agent` 的 TS 翻译，参数化 workspace 与 includeSkills。 |
| `/large_tool_results/` + `/conversation_history/` 副通道路由保留 | 这是 deepagents **框架**自身的驱逐目标（`FilesystemMiddleware` 在结果超 token 时自动写入），不是 cli 特有。对齐 `agent.py:475-491`——若不路由到 tmpdir，大结果会落到 workspace。 |
| Fingerprint 不含 attachments | 附件完全由 ContextBuilder 写入 `<runtime_context>`，对 agent 透明。同一 thread 切附件不重建 agent。 |
| "用 host 绝对路径"规则写入 system prompt 源码 | 这是**静态规则**不是 per-session 动态注入。源码改一次后所有新会话 prompt 一致，cache 正常命中。不引入 `<filesystem_rules>` 块、不引入 promptBlock。 |
| 创建临时 tmpdir 的生命周期 | 每次 cache miss 才 `buildAgentFilesystem` → `mkdtempSync` 创建新 tmpdir，由 cache value 持有；cache 命中不重建。一个 agent 用一对 tmpdir，量很少。scaffold 暴露 `tempDirs: string[]` 字段，Phase B 补 `process.on('exit')` 清理或 `deleteThread` 时 rmSync 该 thread 对应 cache 项的 tempDirs，**不改 scaffold 接口**。 |
| Scaffold 与 agent 1:1 绑定（cache value 同时含 scaffold） | 避免"sendMessage 预先 build scaffold + cache 命中"导致 tmpdir 泄漏 + threadScaffolds 数据漂移。cache value = `{ agent, scaffold }`，scaffold 只在 cache miss 时构造。 |
| write_file/edit_file 走通用 filesystem review item | scaffold 引入的通用 HITL 必须有对应 review item 渲染，否则 creative fallback 会渲染成"重建 storybible"，edit 会喂给 block proposal 路径——UX 完全错。新增 `FilesystemReviewAdapter`，两个 domain strategy 在 `buildReviewItems` 入口处优先识别。 |
| `getInterruptOnNames` 合并 scaffold.interruptOnNames | `_maybeRehydrateInterrupt` 用 strategy 的 names 集合识别 pending interrupt；若不合并 scaffold 名字，重启后 write_file 的 pending interrupt 不会触发 UI 重建。 |

---

## 验证步骤

### 构建 & 静态检查

```bash
npm run lint && npm run type-check
```

### 手动场景（`npm run dev`）

**场景 1 — workspace + prompt 提到 host 路径**
- 打开工作区 `/Users/me/MyNovel`
- prompt: "请读一下 `/Users/me/Desktop/luxu.txt`"
- 预期：模型用 `read_file('/Users/me/Desktop/luxu.txt')` 成功读到。这是修复原始 bug 的关键验证。

**场景 2 — workspace 内 host 路径**
- prompt: "请读一下 `/Users/me/MyNovel/storybible.md`"
- 预期：模型用 host 路径成功读到（不再要求虚拟路径 `/storybible.md`）。

**场景 3 — 附件**
- 在 UI 附加文件 `/Users/me/notes/x.md`
- 预期：user message 含 `<attached_files>` 列出 host 路径；模型能用 `read_file('/Users/me/notes/x.md')` 读取。

**场景 4 — 写保护 HITL（creative）**
- prompt: "把 `/Users/me/MyNovel/draft/ch01.md` 改为大写"（绕过 `write_to_chapter`，让模型试图直接 `write_file`）
- 预期：弹出 HITL 审批弹窗（write_file interrupt_on 触发）。

**场景 5 — 写保护 HITL（edit）**
- prompt: 让模型 `write_file` 任意文件
- 预期：同样触发 HITL（write_file interrupt_on）。

**场景 5b — write_file review item 渲染正确性**
- creative + edit 两个 domain 各跑一次 write_file HITL。
- 预期：审批弹窗显示**通用 filesystem review item**（目标 host 路径 + 新内容 / diff），**不是** "重建 storybible" 弹窗（creative fallback bug 修复验证）、**不是** block proposal 弹窗（edit 路径修复验证）。

**场景 5c — write_file pending interrupt 重启 rehydrate**
- 在 write_file HITL 弹窗时强退应用（`pkill electron` 或关 dock）。
- 重启 → 打开同一 thread。
- 预期：`_maybeRehydrateInterrupt` 正确识别 pending 的 write_file（scaffold.interruptOnNames 已并入），UI 重新渲染审批弹窗。如果合并逻辑漏改，UI 不会重建，用户会卡在没有审批入口的状态。

**场景 6 — Creative skills**
- 触发任何 craft 任务（如角色塑造）
- 预期：模型按 SkillsMiddleware 注入的 metadata 找到 `character-complexity` 这类 skill，按提供的 host SKILL.md 路径 `read_file`，正常读取并执行。

### 回归

- 三个 domain（creative / edit / 普通对话）各跑一次，行为不应有可见回归。
- 检查 user message 不再含 `<context_files>`、`<filesystem_roots>`。
- 检查 user message 仍含 `<runtime_context>` 且 `<attached_files>` / `<attached_dirs>` 嵌套其中（ContextBuilder 行为不变）。
- 检查 `/tmp` 下出现 `iwriter-large-results-*` / `iwriter-conv-history-*` 临时目录（验证副通道路由生效）。
- 检查 `/tmp` 下 tmpdir **不随 turn 数线性增长**（cache lifecycle 修复验证）—— 在同一 thread 连续发 5 条消息后，tmpdir 仍只有一对（cache 命中、scaffold 复用）。
- 检查 system prompt 渲染时含新的 `## File Paths` 段（creative + edit 两个 domain）。
- 检查 fallback `<runtime_context>` 路径下，路径含 `&` `"` 的附件被正确 escape（验证 XML 不破）。

---

## 范围边界

**本 PR 做的事**：脚手架 + 接入 + legacy 三文件删除 + system prompt 微调（一次性收尾，不留 Phase B）。

**本 PR 不做**：
- 不动 `EditProposalTools` 与 `CreativeTools` 系列业务工具——它们与 filesystem 解耦。
- 不动 subagent 的 backend 配置（subagent 继承主 agent backend，自动跟进）。
- 不实现 Windows 路径兼容（iWriter 当前主要在 macOS，且 deepagents-cli 也是 POSIX-first）。Windows 由后续 issue 处理。
- 不增加任何 ResolverBackend / AgentPromptPathExtractor / `<resolved_prompt_paths>`（这些被作废的概念彻底丢弃）。
