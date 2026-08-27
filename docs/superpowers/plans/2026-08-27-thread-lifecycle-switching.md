# Thread Lifecycle Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workspace changes transactional, lock domain after the first accepted turn, and reject provider/model switches whose compact threshold cannot accommodate the current effective context.

**Architecture:** Persist workspace and runtime lifecycle data with Thread metadata, put authoritative transition checks in the Electron main process, and keep renderer pickers transactional. A focused workspace coordinator sequences folder changes, while a focused runtime-switch service compares checkpoint-derived effective tokens with the candidate model budget and commits only compatible selections.

**Tech Stack:** Electron IPC, Vue 3/Pinia, TypeScript, DeepAgents/LangGraph checkpoints, better-sqlite3, Node test runner, esbuild.

**Spec:** `docs/superpowers/specs/2026-08-27-thread-workspace-domain-runtime-switch-design.md`

## Global Constraints

- A candidate provider/model is compatible only when `currentEffectiveContextTokens < candidateCompactTriggerTokens`.
- An incompatible switch leaves Thread metadata, picker state, checkpoint, and Agent cache unchanged.
- Provider/model changes apply only to the next turn; HITL resume uses the frozen active-turn runtime.
- Domain is mutable only while the Thread has no accepted turn.
- All Thread history remains visible; only Threads bound to the current workspace are selectable.
- Do not add context migration, bridge summarization, hierarchical summarization, or silent history trimming.
- Use `apply_patch` for source edits and run each named test once while red and again while green.

---

### Task 1: Persist workspace and runtime lifecycle metadata

**Files:**
- Modify: `shared/ai/contracts/thread.ts`
- Modify: `shared/ai/contracts/protocol.ts`
- Modify: `electron/ai/thread/ThreadListQuery.ts`
- Modify: `electron/ai/application/ThreadService.ts`
- Modify: `electron/ai/runtime/ThreadRuntimeStore.ts`
- Modify: `src/ai/thread/Thread.ts`
- Test: `tests/thread-service.test.mjs`

**Interfaces:**
- Produces: `ThreadRuntimeSelection`, `TurnRuntimeSnapshot`, `AiThread.workspacePath`, `AiThread.pendingRuntime`, `ThreadService.completeTurn()`.
- Consumes: existing `AiProviderConfig`, `AiThinkingLevel`, `SendMessageRequest.workspacePath`.

- [ ] **Step 1: Write failing metadata tests**

Add tests that create a Thread with `/workspace/a`, assert `listThreads()` returns that path, assert an existing Thread cannot change domain/mode in `prepareTurn()`, and assert the active runtime snapshot survives until `completeTurn()`.

```js
assert.equal(service.listThreads()[0].workspacePath, '/workspace/a')
assert.throws(() => service.prepareTurn(settings, changedDomainRequest), /domain is locked/i)
assert.equal(service.getMeta('thread-1').activeRuntime.modelId, 'model-1')
service.completeTurn('thread-1')
assert.equal(service.getMeta('thread-1').activeRuntime, undefined)
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/thread-service.test.mjs`

Expected: FAIL because workspace and active runtime metadata do not exist and existing Thread domain changes are currently accepted.

- [ ] **Step 3: Extend shared Thread/runtime contracts**

Define the shared values used by main and renderer:

```ts
export interface ThreadRuntimeSelection {
  providerConfigId: string
  modelId: string
  thinkingLevel: AiThinkingLevel
}

export interface TurnRuntimeSnapshot extends ThreadRuntimeSelection {
  turnId: string
  providerConfigRevision: string
  domain: AiAgentDomain
  mode: AiAgentMode
  workspacePath: string | null
}
```

Add optional `workspacePath`, `activeRuntime`, and `pendingRuntime` fields to `AiThread` and the matching `ThreadMeta`.

- [ ] **Step 4: Migrate and persist Thread metadata**

Add nullable SQLite columns `workspace_path`, `active_runtime_json`, and `pending_runtime_json`. Parse JSON defensively; malformed legacy values become `undefined`. Extend `createMeta()`, `updateMeta()`, `_saveMeta()`, and `metaToAiThread()`.

- [ ] **Step 5: Freeze and release active-turn runtime**

In `prepareTurn()`, reject a requested domain/mode that differs from existing metadata, bind `workspacePath` on first creation, and store a `TurnRuntimeSnapshot`. Add `completeTurn(threadId)` that clears only `activeRuntime`, retaining it during HITL.

- [ ] **Step 6: Verify GREEN**

Run: `node --test tests/thread-service.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/ai/contracts/thread.ts shared/ai/contracts/protocol.ts electron/ai/thread/ThreadListQuery.ts electron/ai/application/ThreadService.ts electron/ai/runtime/ThreadRuntimeStore.ts src/ai/thread/Thread.ts tests/thread-service.test.mjs
git commit -m "feat(ai): persist thread workspace and runtime lifecycle"
```

### Task 2: Add authoritative runtime-switch compatibility and IPC

**Files:**
- Create: `electron/ai/application/RuntimeSwitchService.ts`
- Modify: `shared/ai/contracts/protocol.ts`
- Modify: `shared/ai/contracts/index.ts`
- Modify: `electron/ai/AgentEngine.ts`
- Modify: `electron/App.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron-api.ts`
- Modify: `src/ai/client/AgentClient.ts`
- Test: `tests/runtime-switch.test.mjs`
- Test: `tests/ai-contracts.test.mjs`

**Interfaces:**
- Consumes: `ThreadService.getMeta()`, checkpoint-effective token count, `getEffectiveModelBudget()`.
- Produces: `RuntimeSwitchRequest`, `RuntimeSwitchResponse`, `AgentEngine.switchThreadRuntime()` and `ai:switch-thread-runtime`.

- [ ] **Step 1: Write failing policy and IPC contract tests**

Test strict boundary behavior with literal budgets:

```js
assert.equal(evaluateRuntimeCompatibility(79999, { triggerTokens: 80000 }).compatible, true)
assert.equal(evaluateRuntimeCompatibility(80000, { triggerTokens: 80000 }).compatible, false)
assert.equal(evaluateRuntimeCompatibility(80001, { triggerTokens: 80000 }).reason, 'context-exceeds-compact-trigger')
```

Also assert the shared IPC map exposes `ai:switch-thread-runtime` and that rejected switches do not call the metadata commit port.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/runtime-switch.test.mjs tests/ai-contracts.test.mjs`

Expected: FAIL because the service and channel do not exist.

- [ ] **Step 3: Implement `RuntimeSwitchService`**

Use injected ports so the service is behavior-testable:

```ts
export interface RuntimeSwitchPorts {
  getCurrentTokens(threadId: string): Promise<number>
  resolveBudget(candidate: ThreadRuntimeSelection): EffectiveModelBudget
  isThreadActive(threadId: string): boolean
  isThreadInterrupted(threadId: string): boolean
  commit(threadId: string, candidate: ThreadRuntimeSelection): void
  defer(threadId: string, candidate: ThreadRuntimeSelection): void
}
```

`request()` validates first, then commits when idle or records `pendingRuntime` while active/HITL. Rejection returns stats and performs neither mutation.

- [ ] **Step 4: Wire main-process context calculation**

Reuse `_getCurrentSessionTokens()` so the source context is the checkpoint projection of summary plus post-cutoff messages, system prompt, and tool schemas. Resolve the candidate provider/model from main-process settings, create its model profile, and compare against `budget.triggerTokens`.

- [ ] **Step 5: Add IPC and preload/client types**

Add:

```ts
'ai:switch-thread-runtime': [RuntimeSwitchRequest, RuntimeSwitchResponse]
```

Expose `aiSwitchThreadRuntime` through preload, `ElectronAPI`, and `AgentClient.switchThreadRuntime()`.

- [ ] **Step 6: Stop eager global cache invalidation**

Remove `this._agentEngine?.invalidateAgentCache()` from `ai:update-config`. Existing cache keys already include provider/model/base URL/API-key fingerprint/budget/workspace, so a compatible next turn gets a new entry without destroying an active/HITL entry.

- [ ] **Step 7: Verify GREEN**

Run: `node --test tests/runtime-switch.test.mjs tests/ai-contracts.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add electron/ai/application/RuntimeSwitchService.ts shared/ai/contracts/protocol.ts shared/ai/contracts/index.ts electron/ai/AgentEngine.ts electron/App.ts electron/preload.ts src/types/electron-api.ts src/ai/client/AgentClient.ts tests/runtime-switch.test.mjs tests/ai-contracts.test.mjs
git commit -m "feat(ai): reject incompatible runtime switches"
```

### Task 3: Make renderer provider/model selection transactional

**Files:**
- Modify: `src/ai/state/settings.ts`
- Modify: `src/ai/state/aiStore.ts`
- Modify: `src/ai/components/agent-panel/composables/useProviderPicker.ts`
- Modify: `src/ai/components/agent-panel/composables/useModelPicker.ts`
- Modify: `src/ai/components/agent-panel/input/ProviderPicker.vue`
- Modify: `src/ai/components/agent-panel/input/ModelPicker.vue`
- Modify: `src/i18n/messages/zh-CN.ts`
- Modify: `src/i18n/messages/en-US.ts`
- Create: `tests/runtime-selection-controller.test.mjs`

**Interfaces:**
- Consumes: `AgentClient.switchThreadRuntime()`.
- Produces: async `setActiveProvider()` and `setCurrentModelId()` returning `Promise<boolean>`, selection loading state, stale-request suppression.

- [ ] **Step 1: Write a failing last-request-wins test**

Use controllable promises to prove a slow first response cannot overwrite a later compatible selection and an incompatible response preserves the original Thread values.

```js
const first = controller.request({ providerConfigId: 'p2', modelId: 'large' })
const second = controller.request({ providerConfigId: 'p3', modelId: 'small' })
resolveSecond({ status: 'rejected', compatible: false })
resolveFirst({ status: 'committed', compatible: true })
await Promise.all([first, second])
assert.deepEqual(controller.committed, original)
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/runtime-selection-controller.test.mjs`

Expected: FAIL because transactional selection does not exist.

- [ ] **Step 3: Implement request/commit in settings state**

Do not mutate `settings.activeProviderConfigId`, provider defaults, or `AiThread` before main-process approval. On `committed`, persist settings and Thread runtime. On `pending`, store/display `pendingRuntime` without changing the committed runtime. On `rejected`, show the localized warning and leave all committed values unchanged.

- [ ] **Step 4: Make picker actions await the transaction**

Make provider/model select handlers async, show a loading/disabled state during validation, and close only after the latest request settles. Thinking-level changes remain next-turn-only but skip budget validation because they do not change the context threshold.

- [ ] **Step 5: Finalize pending selection at the terminal run boundary**

Before main emits a terminal `RunDoneEvent`, revalidate `pendingRuntime` against the final checkpoint. Include the committed/rejected resolution in `RunDoneEvent`; renderer updates the Thread or displays the rejection warning. Leave pending unchanged during HITL.

- [ ] **Step 6: Verify GREEN**

Run: `node --test tests/runtime-selection-controller.test.mjs tests/pending-command-queue.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ai/state/settings.ts src/ai/state/aiStore.ts src/ai/components/agent-panel/composables/useProviderPicker.ts src/ai/components/agent-panel/composables/useModelPicker.ts src/ai/components/agent-panel/input/ProviderPicker.vue src/ai/components/agent-panel/input/ModelPicker.vue src/i18n/messages/zh-CN.ts src/i18n/messages/en-US.ts shared/ai/contracts/protocol.ts electron/ai/AgentEngine.ts tests/runtime-selection-controller.test.mjs
git commit -m "feat(ai): apply model selections on the next turn"
```

### Task 4: Lock domain to draft Threads and compose the header title

**Files:**
- Modify: `src/ai/state/aiStore.ts`
- Modify: `src/ai/state/settings.ts`
- Modify: `src/ai/components/agent-panel/input/AgentToolbar.vue`
- Modify: `src/ai/components/shell/AgentPanel.vue`
- Modify: `src/i18n/messages/zh-CN.ts`
- Modify: `src/i18n/messages/en-US.ts`
- Create: `src/ai/thread/threadPresentation.ts`
- Create: `tests/thread-draft-domain.test.mjs`

**Interfaces:**
- Produces: `isThreadDraft()`, `formatThreadHeaderTitle()`, `aiStore.isActiveThreadDraft`.
- Consumes: `_localOnlyThreadIds`, first-send acceptance, `AiThread.domain/title`.

- [ ] **Step 1: Write failing draft/title tests**

```js
assert.equal(isThreadDraft({ localOnly: true, hasAcceptedTurn: false }), true)
assert.equal(isThreadDraft({ localOnly: false, hasAcceptedTurn: true }), false)
assert.equal(formatThreadHeaderTitle('创意写作', '雨夜人物设定'), '创意写作 | 雨夜人物设定')
```

Add a ThreadService test proving an existing persisted Thread rejects a different domain.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/thread-draft-domain.test.mjs tests/thread-service.test.mjs`

Expected: FAIL because the helpers and lock are absent.

- [ ] **Step 3: Keep first-send failure as draft**

Move `_localOnlyThreadIds.delete(thread.id)` until after `aiSendMessage` accepts the request. Move fixed-context validation before `prepareTurn()` in main so a rejected first input does not create metadata and lock domain.

- [ ] **Step 4: Enforce renderer and main locks**

Expose `isActiveThreadDraft`; render `ModePicker` only when true. Make `setCurrentMode()` refuse changes for non-draft Threads. Keep the existing main-process domain/mode equality check as final authority.

- [ ] **Step 5: Compose the title without mutating metadata**

Map `editing` and `creative` to localized display names and render `domain name | original title` in `AgentPanel`. History, rename, and persistence keep `thread.title` unchanged.

- [ ] **Step 6: Verify GREEN**

Run: `node --test tests/thread-draft-domain.test.mjs tests/thread-service.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ai/state/aiStore.ts src/ai/state/settings.ts src/ai/components/agent-panel/input/AgentToolbar.vue src/ai/components/shell/AgentPanel.vue src/ai/thread/threadPresentation.ts src/i18n/messages/zh-CN.ts src/i18n/messages/en-US.ts electron/ai/AgentEngine.ts tests/thread-draft-domain.test.mjs tests/thread-service.test.mjs
git commit -m "feat(ai): lock domain after the first accepted turn"
```

### Task 5: Make workspace changes transactional and history workspace-aware

**Files:**
- Create: `src/stores/workspaceTransition.ts`
- Modify: `src/stores/app.ts`
- Modify: `src/views/MainView.vue`
- Modify: `src/ai/state/aiStore.ts`
- Modify: `src/ai/components/agent-panel/AgentHistoryPanel.vue`
- Modify: `src/ai/components/shell/AgentPanel.vue`
- Modify: `src/i18n/messages/zh-CN.ts`
- Modify: `src/i18n/messages/en-US.ts`
- Create: `tests/workspace-thread-transition.test.mjs`
- Modify: `tests/workspace-lifecycle.test.mjs`

**Interfaces:**
- Produces: `executeWorkspaceTransition()`, app-store transition hooks, `aiStore.isThreadSelectable()`.
- Consumes: `aiStore.cancelStreaming()`, `createNewThread(workspacePath)`, `AiThread.workspacePath`.

- [ ] **Step 1: Write failing transaction tests**

Cover idle success, user cancellation, cancellation failure, and target preparation failure with an ordered event log:

```js
assert.deepEqual(events, ['prepare:/b', 'confirm:hitl', 'cancel:a', 'commit:/b', 'create-draft:/b'])
assert.equal(state.workspacePath, '/b')
```

Also test workspace selection policy with literal paths: same workspace true, different/null binding false.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/workspace-thread-transition.test.mjs tests/workspace-lifecycle.test.mjs`

Expected: FAIL because the coordinator and hooks do not exist.

- [ ] **Step 3: Implement the coordinator and app-store hooks**

The coordinator prepares the target, asks the AI guard, cancels the old run only after confirmation, commits one `currentFolder` transition, and invokes the post-commit draft callback. Replace the current `closeFolder()` then assign pattern so `A -> null -> B` is impossible during a folder switch.

- [ ] **Step 4: Connect MainView to AI lifecycle**

Register a guard that distinguishes streaming/resuming from HITL copy, awaits `cancelStreaming()`, and registers an after-commit callback that creates a new draft Thread bound to the new workspace.

- [ ] **Step 5: Disable foreign history items**

Return every Thread from history filtering. Derive `selectable` by normalized workspace equality, apply disabled semantics/classes/tooltips, omit rename/select actions for disabled items, and guard `aiStore.selectThread()` as a second layer.

- [ ] **Step 6: Verify GREEN**

Run: `node --test tests/workspace-thread-transition.test.mjs tests/workspace-lifecycle.test.mjs tests/thread-service.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/stores/workspaceTransition.ts src/stores/app.ts src/views/MainView.vue src/ai/state/aiStore.ts src/ai/components/agent-panel/AgentHistoryPanel.vue src/ai/components/shell/AgentPanel.vue src/i18n/messages/zh-CN.ts src/i18n/messages/en-US.ts tests/workspace-thread-transition.test.mjs tests/workspace-lifecycle.test.mjs
git commit -m "feat(ai): coordinate workspace-bound thread transitions"
```

### Task 6: Correct Compact tip runtime semantics and complete verification

**Files:**
- Modify: `shared/ai/contracts/protocol.ts`
- Modify: `electron/ai/AgentEngine.ts`
- Modify: `src/ai/components/agent-panel/composables/useChatSend.ts`
- Modify: `src/ai/components/agent-panel/AgentInputArea.vue`
- Modify: `src/ai/components/agent-panel/input/AgentToolbar.vue`
- Modify: `src/i18n/messages/zh-CN.ts`
- Modify: `src/i18n/messages/en-US.ts`
- Modify: `tests/context-summarization.test.mjs`

**Interfaces:**
- Consumes: committed Thread runtime, `TurnRuntimeSnapshot`, pending runtime status.
- Produces: unclamped raw compact ratio and separate active/next context stats.

- [ ] **Step 1: Write failing Compact semantics tests**

Assert that `currentTokens=120` and `triggerTokens=100` yields raw ratio `1.2`, visual ratio `1`, and tooltip percentage `120`. Add an active-runtime test proving live usage uses the active snapshot threshold rather than a pending/next model threshold.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/context-summarization.test.mjs`

Expected: FAIL because the current ratio is clamped before tooltip formatting and stats expose only one runtime.

- [ ] **Step 3: Separate raw and visual progress**

Expose `compactProgressRatioRaw` and `compactProgressRatioVisual`. Use visual ratio for SVG stroke only and raw ratio for color/status/tooltip percentage.

- [ ] **Step 4: Return active and next runtime stats**

Extend session stats with optional active-runtime model/trigger/current tokens and next-runtime values. While streaming/HITL, live usage is paired with active snapshot budget; committed next runtime remains a separate tooltip line. Pending runtime is labeled as awaiting final validation.

- [ ] **Step 5: Run targeted and full verification**

Run:

```bash
node --test tests/thread-service.test.mjs tests/runtime-switch.test.mjs tests/runtime-selection-controller.test.mjs tests/thread-draft-domain.test.mjs tests/workspace-thread-transition.test.mjs tests/workspace-lifecycle.test.mjs tests/context-summarization.test.mjs tests/ai-contracts.test.mjs tests/pending-command-queue.test.mjs
npm run type-check
npm test
```

Expected: all tests and type checks PASS with no new warnings.

- [ ] **Step 6: Commit**

```bash
git add shared/ai/contracts/protocol.ts electron/ai/AgentEngine.ts src/ai/components/agent-panel/composables/useChatSend.ts src/ai/components/agent-panel/AgentInputArea.vue src/ai/components/agent-panel/input/AgentToolbar.vue src/i18n/messages/zh-CN.ts src/i18n/messages/en-US.ts tests/context-summarization.test.mjs
git commit -m "fix(ai): keep compact stats bound to their runtime"
```
