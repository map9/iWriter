# Creative Agent Phase 1 实施方案

## 0. Context

iWriter 的 AI 面板已经做了 edit / creative 双 domain 的脚手架拆分（参见 `05_独立双线与共享脚手架设计.md`），但 creative domain 的当前实现（`CreativeArtifactTools.ts` + `LocalShellBackend`）还是按旧的 sections-based design（brainstorms / worldbook / characters / storylines）做的，与 `01-04` 重新定位后的「StoryBible + Draft」模型不匹配。

本次实施目标：完成 Creative Agent v3 的 Phase 1，落地核心写作闭环——单 LLM 担任 MainAgent + WriterAgent + StateAgent 三个角色，通过 plan-first（interruptOn 审批）写章节，通过 diff 感知会话启动维护 StoryBible。

**Phase 1 不做的事**：sub-agent 编排、ConsistencyAgent、Pilot Mode、proposal 表持久化、方向探索、git 集成。这些放到后续 Phase。

---

## 1. 关键决策（已与 01-05 设计文档对齐）

| # | 决策 | 选择 |
|---|---|---|
| 1 | Phase 1 agent 数量 | 单 LLM，system prompt 合并三个角色职责 |
| 2 | Plan-first 机制 | interruptOn + `confirm_writing_plan` tool |
| 3 | HITL 分级 | L1 读 + add_fragment / patch_storybible；L2 confirm_writing_plan / write_to_chapter / replace_storybible_section；L3 rebuild_storybible |
| 4 | session_log 写入时机 | 每次 streaming run 成功结束（`sendRunDone` 之前） |
| 5 | creative.db 路径 | `{workspace}/.iwriter/creative.db`（与 `userData/ai-checkpoint.db` 不冲突） |
| 6 | Domain 切换 UI | 复用 `ProfilePicker.vue`，加 workspace guard |
| 7 | 无 workspace 限制 | UI 层禁用 + tool 层防御 |
| 8 | storybible.md 初始化 | 工具内懒初始化（首次 read 时创建模板） |
| 9 | 旧 builtin skills | 全部替换为 3 个新 skills |
| 10 | proposal 表 | Phase 1 不建，仅建 session_log |
| 11 | Creative HITL 数据模型 | 复用 interrupt/resume 协议，不复用 EditProposal/block proposal 数据结构 |
| 12 | Diff 能力口径 | Phase 1 基于 hash 识别变更文件；要理解具体变化时由 agent 重读相关文件，不承诺行级 diff |
| 13 | Plan 承接 | `confirm_writing_plan` 的批准/编辑结果必须作为 `approved_plan` 传入 `write_to_chapter` |

---

## 2. 复用与新建的边界

**直接复用（不动）：**
- `interruptOn` HITL 协议 + `DomainAgentCapabilities` 接口
- `AgentEngine` 的 streaming / interrupt / resume 整套链路
- `RendererEventBridge` / `StreamEventAdapter` / IPC protocol
- `ProposalNavigator.vue` / `EditReviewSurface.vue` 的设计模式（仅借鉴交互模式，不复用 EditProposal 数据结构）
- `inferToolKind` 中的分类逻辑
- `FilesystemBackend`（替换 `LocalShellBackend`）

**实现层复用（不暴露给 agent）：**
- `electron/ai/document/DocumentSearch.ts` 的 `searchInDirectory` —— 在 `search_draft` 内部调用

**不复用：**
- `EditProposalTools` / `DocumentTools` —— 抽象层不对（block-level，creative 是 file-level）
- `EditProposal` / `BlockEditProposal` —— 审批展示的数据模型不对，creative 需要 file-level / plan-level proposal
- `SnapshotBroker` / `BlockParser` / `BlockEditApplier` —— TipTap 相关，creative 不需要
- `CreativeArtifactTools.ts` —— 旧设计，Phase 1 完全替换

---

## 3. 文件清单

### 新建（8 个文件）

1. **`electron/ai/db/CreativeDb.ts`** —— better-sqlite3 封装；`session_log` 表；`getLastSession` / `upsertSession` / `computeWorkspaceHashes`；按 workspacePath 缓存 Database 实例
2. **`electron/ai/tools/CreativeTools.ts`** —— Phase 1 全部 creative tools（见 §4）
3. **`electron/ai/builtin-skills/scene-structure/SKILL.md`** —— 场景结构（目标→冲突→结果）
4. **`electron/ai/builtin-skills/character-voice/SKILL.md`** —— 角色声音辨识度
5. **`electron/ai/builtin-skills/deep-pov/SKILL.md`** —— 紧贴视角人物
6. **`electron/ai/ipc/CreativeReviewAdapter.ts`** —— creative actionRequest → creative review item 的主进程转换
7. **`src/ai/review/creative.ts`** —— renderer 侧 creative review item 类型守卫 / selector
8. **`src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue`** —— 实现 plan / write_to_chapter 审批 UI

### 修改（7 个文件）

1. **`electron/ai/domain/creative/buildCreativeCapabilities.ts`** —— 完全重写：
   - 替换 `LocalShellBackend` → `FilesystemBackend({ rootDir: workspacePath, virtualMode: true })`
   - 用 `CreativeTools` 替换 `CreativeArtifactTools`
   - 定义 `interruptOn`（4 个 L2/L3 工具）
   - 接收 `workspacePath` 与 `creativeDb` 参数
2. **`electron/ai/AgentEngine.ts`** —— 四处改动：
   - `_buildAgentCapabilities`：从 `mounts` 中提取 workspace path，把 creative.db 实例传给 `buildCreativeCapabilities`
   - `_streamLoop`：在 `sendRunDone` 之前对 creative domain 调用 `creativeDb.upsertSession`
   - `_handleInterrupt`：按 domain 分流 proposal 构建；creative 不请求 TipTap snapshot，不调用 `buildProposalFromAction`
   - 新增 `_getCreativeDb(workspacePath)` 私有方法做缓存
3. **`src/ai/thread/system-prompts/creative.ts`** —— 完全重写为 v3 system prompt（合并三个角色职责，包含会话启动序列、plan-first 流程、storybible 维护规则）
4. **`src/components/ai/agent-panel/input/ProfilePicker.vue`** —— 在 `modeOptions` 渲染时检查 `appStore.currentFolder`，无 workspace 时把 creative 选项标灰、不可点击，加 tooltip
5. **`src/ai/types.ts`** —— 在 `inferToolKind` 中添加新工具名映射，移除旧的 `list_story_assets` / `read_story_asset` / `save_story_asset`
6. **`src/types/ai` 或当前共享 AI 类型入口** —— 增加 `CreativeReviewItem` / domain-specific pending review 类型
7. **`electron/ai/ipc/protocol.ts` / review 相关类型** —— `RunInterruptedEvent` 支持 domain-specific review payload，保持 resume decisions 数组协议不变

### 删除（4 个文件夹）

- `electron/ai/builtin-skills/character-forge/`
- `electron/ai/builtin-skills/novel-brainstorm/`
- `electron/ai/builtin-skills/storyline-architect/`
- `electron/ai/builtin-skills/worldbook-planner/`

### 废弃但暂保留（1 个文件）

- `electron/ai/tools/CreativeArtifactTools.ts` —— 不再被 `buildCreativeCapabilities` 引用，留作过渡参考；下一个里程碑删除

---

## 4. CreativeTools 工具清单

每个工具都接收 `workspacePath` 闭包 + 通过 runtime configurable 校验，无 workspace 时返回明确错误。

### 4.0 路径与写入安全

所有 creative file tools 都必须遵守：

- 只能访问 `{workspace}/storybible.md` 与 `{workspace}/draft/**/*.md`
- `filename` 是相对 `draft/` 的文件名或子路径，禁止绝对路径、空路径、`..`、`~`、Windows drive prefix
- 写入前用 `path.resolve` 计算目标路径，再确认它仍位于允许的根目录内
- `read_chapter` / `write_to_chapter` 只接受 `.md` 文件；缺省扩展名时可补 `.md`
- `write_to_chapter` 的 `mode` 必须带足够的定位参数：`append` 不需要位置，`insert_at` 需要 anchor，`replace_range` 需要 start/end anchor 或 byte/line range；缺参数直接返回错误

### 4.1 读取类（L1，无 HITL）

| Tool | 说明 |
|---|---|
| `read_storybible` | 读 `{workspace}/storybible.md`；不存在则懒创建最小模板写入并返回 |
| `read_chapter(filename)` | 读 `{workspace}/draft/{filename}` |
| `read_fragments` | 读 `{workspace}/draft/fragments.md`；懒创建空文件 |
| `search_draft(query, limit=3)` | 委托 `DocumentSearch.searchInDirectory(workspace/draft, query)`，每文件返回 top-3 摘要片段 |
| `get_session_diff` | 调用 `CreativeDb.getLastSession`，对比当前 hash → 返回新增/修改/删除文件清单；不返回行级 diff |

### 4.2 写入类

| Tool | HITL | 说明 |
|---|---|---|
| `add_fragment(content)` | L1 | 追加到 `draft/fragments.md` |
| `patch_storybible(section, anchor, content)` | L1 | 只允许小型 append/upsert patch；禁止删除、整段替换、清空 section；返回 patch 摘要 |
| `confirm_writing_plan(plan, rationale, alternatives?)` | L2 | 不写文件，仅触发审批；tool result 返回 approved/edited plan |
| `write_to_chapter(filename, content, mode, approved_plan)` | L2 | mode: append / insert_at / replace_range；必须携带批准后的 plan；approved 后由 tool function 写盘 |
| `replace_storybible_section(section, content)` | L2 | 整段替换某 section |
| `rebuild_storybible` | L3 | 全量重读 draft → 重建 storybible.md；Pilot 不可绕过 |

### 4.3 `interruptOn` 配置

```typescript
{
  confirm_writing_plan:        { allowedDecisions: ['approve', 'edit', 'reject'] },
  write_to_chapter:            { allowedDecisions: ['approve', 'edit', 'reject'] },
  replace_storybible_section:  { allowedDecisions: ['approve', 'reject'] },
  rebuild_storybible:          { allowedDecisions: ['approve', 'reject'] },
}
```

### 4.4 Creative HITL payload

Creative 复用 LangGraph `interruptOn` 与 `ai:resume` 的 decisions 数组协议，但不复用 Edit domain 的 `EditProposal` / block diff 模型。

主进程在 `_handleInterrupt` 中按 thread domain 分流：

- `edit`：沿用当前 `SnapshotBroker` + `buildProposalFromAction`
- `creative`：直接把 actionRequest 转成 `CreativeReviewItem`

建议最小结构：

```typescript
type CreativeReviewItem =
  | {
      id: string
      kind: 'creative_plan'
      toolName: 'confirm_writing_plan'
      status: 'pending'
      plan: string
      rationale: string
      alternatives?: string[]
      sourceTurnId?: string
      toolCallId?: string
    }
  | {
      id: string
      kind: 'creative_write'
      toolName: 'write_to_chapter'
      status: 'pending'
      filename: string
      mode: 'append' | 'insert_at' | 'replace_range'
      approvedPlan: string
      newContent: string
      previewOnly?: boolean
      sourceTurnId?: string
      toolCallId?: string
    }
  | {
      id: string
      kind: 'creative_storybible'
      toolName: 'replace_storybible_section' | 'rebuild_storybible'
      status: 'pending'
      section?: string
      newContent: string
      sourceTurnId?: string
      toolCallId?: string
    }
```

`CreativeReviewSurface` 只负责展示和编辑这些 file-level / plan-level payload；用户 approve / edit / reject 后仍通过现有 `ai:resume` 提交一组 `ResumeDecision`。

---

## 5. 关键流程

### 5.1 会话启动序列（写在 system prompt 里）

每次 creative 会话第一个 turn，agent 必须按顺序：
1. 调用 `get_session_diff` → 了解作者离线期间的改动
2. 调用 `read_storybible` → 获取当前理解
3. （若 diff 显示有变化）读取变化文件中与本轮问题相关的文件；如果能提炼出明确新增事实，再通过 `patch_storybible` 小范围更新
4. 再回应作者

Phase 1 的 diff 口径是“哪些文件新增/修改/删除”。如果作者问“我具体改了什么”，agent 应说明当前能可靠识别的是文件级变化，并通过重读相关文件总结当前内容变化；行级 diff 留到 git 集成或快照持久化阶段。

### 5.2 写作任务流程

```
作者「帮我写第三章」
  ↓
agent: 读相关上下文（read_storybible + search_draft）
  ↓
agent: 调用 confirm_writing_plan → interruptOn 触发
  ↓
CreativeReviewSurface 显示 plan 卡片，用户 approve / edit / reject
  ↓
approved/edited → confirm_writing_plan 返回 approved_plan
  ↓
agent: 调用 write_to_chapter(filename, content, mode, approved_plan) → interruptOn 再次触发
  ↓
CreativeReviewSurface 显示新内容预览，用户 approve
  ↓
approved → tool function 在主进程直接写文件
  ↓
agent: 调用 patch_storybible 增量更新理解
  ↓
agent: 输出完成总结
```

### 5.3 session_log 写入

`AgentEngine._streamLoop` 在 `this.rendererBridge.sendRunDone(...)` 之前插入：

```typescript
if (domain === 'creative') {
  const ctx = this.runtimeStore.getContext(threadId)
  if (ctx?.workspacePath) {
    const db = this._getCreativeDb(ctx.workspacePath)
    const hashes = computeWorkspaceHashes(ctx.workspacePath)
    db.upsertSession(ctx.workspacePath, hashes)
  }
}
```

`computeWorkspaceHashes` 只 hash `storybible.md` + `draft/**/*.md`，不扫描整个 workspace。

`session_log.file_hashes` 只承担“下一次会话知道哪些文件变了”的职责。Phase 1 不用它承诺行级 diff，也不把正文内容存入 SQLite。需要理解变化内容时，agent 根据变更文件清单调用 `read_chapter` / `read_fragments` / `read_storybible` 重读相关文件。

---

## 6. 实施顺序（建议 PR 拆分）

**PR 1 —— 基础设施 + Creative HITL 最小闭环（不真正写正文）**
- `CreativeDb.ts`
- `CreativeTools.ts`（实现读取类 + add_fragment + 受限 patch_storybible；所有已实现工具具备 workspace/path 防御；`confirm_writing_plan` 实现真实 interrupt；`write_to_chapter` 先 preview/stub，不写盘）
- `buildCreativeCapabilities.ts` 重写
- `AgentEngine.ts`：creative.db 写入、capabilities 注入、interrupt 按 domain 分流
- `electron/ai/ipc/CreativeReviewAdapter.ts` + `src/ai/review/creative.ts` + 最小 `CreativeReviewSurface.vue`：能展示/编辑/审批 plan 与 write preview
- 删除旧 4 个 skills，新建 3 个 skills
- `creative.ts` system prompt 重写
- `types.ts` 更新工具名映射

完成后：creative 域已经能跑通 plan-first 审批链路，但 `write_to_chapter` 还不真正写盘。

**PR 2 —— 写入 + 审批 UI**
- `CreativeTools.ts` 补全 write_to_chapter / replace_storybible_section / rebuild_storybible 实际实现
- `CreativeReviewSurface.vue` 完善 write preview / storybible section 审批卡片
- `ProfilePicker.vue` workspace guard
- 写入路径复核、mode 参数校验、approved_plan 强制校验

完成后：Phase 1 完整闭环。

---

## 7. Verification

### 7.1 手动测试场景

打开一个空文件夹作为 workspace，切换 mode 为 creative：

1. **冷启动**
   - 第一次发消息「我想写一个失业青年的故事」
   - 验证 agent 调用 `read_storybible`，验证 `{workspace}/storybible.md` 被自动创建（含模板）
   - 验证 agent 调用 `add_fragment` 把灵感写入 `draft/fragments.md`

2. **Plan-first**
   - 说「帮我写第一章，主角第一次在便利店打工」
   - 验证触发 interruptOn，CreativeReviewSurface 显示 plan
   - 点 approve，验证再次触发 interruptOn 显示 write_to_chapter 内容预览
   - 点 approve，验证 `draft/ch01-*.md` 被创建

3. **Diff 感知重入**
   - 关闭面板/切换 thread，手动在文件管理器中编辑 `draft/ch01-*.md` 加几句话
   - 重新开 creative thread，发「我之前改了什么？」
   - 验证 agent 调用 `get_session_diff` 并准确报告改动文件
   - 验证 agent 不承诺行级 diff；需要解释变化时，会重读相关文件后总结当前内容

4. **无 workspace 拦截**
   - 关闭文件夹（不打开 workspace）
   - 验证 ProfilePicker 中 creative 选项灰显、点不动
   - 强行通过 IPC 发 creative 请求（开发者工具），验证 tool 层返回明确错误

5. **HITL 风险分级**
   - 验证 `add_fragment` / `read_*` 不触发 HITL
   - 验证 `confirm_writing_plan` / `write_to_chapter` 触发 HITL
   - 验证 `rebuild_storybible` 触发 HITL

6. **路径安全**
   - 尝试 `read_chapter("../storybible.md")` / `write_to_chapter("/tmp/x.md")`
   - 验证 tool 返回明确错误，不读取或写入 workspace 允许范围之外的文件

7. **Plan 承接**
   - 在 plan 审批时编辑 plan
   - 验证 `write_to_chapter` 的 args 携带编辑后的 `approved_plan`
   - 验证 write preview 展示的内容与编辑后的 plan 一致

### 7.2 自动化检查

```bash
npm run lint
npm run type-check
```

构建验证：

```bash
npm run dev  # 验证主进程启动不报错
```

### 7.3 不在 Phase 1 验证范围

- ConsistencyAgent / review_finding 表（Phase 2）
- proposal 表持久化（Phase 3）
- Pilot Mode 切换（Phase 3）
- 方向探索 / ExplorerAgent（Phase 4）
- 语义搜索（Phase 4）
- git 集成（Phase 4+）
