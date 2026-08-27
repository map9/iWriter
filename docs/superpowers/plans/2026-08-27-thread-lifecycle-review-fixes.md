# Thread Lifecycle Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workspace transitions atomic at the renderer boundary, freeze the complete provider runtime across HITL, normalize workspace bindings in both processes, and remove redundant runtime/Compact state.

**Architecture:** Provider revisions are retained in the main-process AI config store and referenced by active-turn metadata; resume resolves the archived revision instead of mutable current settings. Workspace switching uses prepare/commit closures for tabs and the target draft so all fallible work finishes before the synchronous commit boundary. Shared workspace normalization becomes the only comparison/persistence rule, while renderer runtime state is reduced to one context-stats object and one request-generation guard.

**Tech Stack:** TypeScript, Vue 3, Pinia, Electron IPC, electron-store, Node test runner, esbuild test bundles.

**Spec:** `docs/superpowers/specs/2026-08-27-thread-workspace-domain-runtime-switch-design.md`

## Global Constraints

- Provider/model changes affect only the next turn; an active or HITL turn must retain its complete provider configuration.
- Provider secrets must not be copied into thread/checkpoint metadata.
- A workspace transition failure must not publish a new workspace, close prepared tabs, or activate a target draft.
- Workspace paths must compare identically across slash, trailing-separator, drive-letter, and UNC spelling differences.
- Foreign and unbound persisted threads remain visible and disabled.
- Tests are written and observed failing before production changes.

---

### Task 1: Persist and resolve frozen provider revisions

**Files:**
- Create: `electron/ai/config/ProviderConfigRevision.ts`
- Modify: `electron/ai/config/AiConfigStore.ts`
- Modify: `electron/ai/application/ThreadService.ts`
- Modify: `electron/ai/runtime/ThreadRuntimeResolver.ts`
- Modify: `electron/ai/runtime/RuntimeConfig.ts`
- Modify: `electron/ai/AgentEngine.ts`
- Test: `tests/thread-service.test.mjs`
- Test: `tests/agent-engine-initialization.test.mjs`

**Interfaces:**
- Produces: `createProviderConfigRevision(config): string`.
- Produces: `AiConfigStore.rememberProviderConfig(config): string` and `AiConfigStore.loadProviderConfigRevision(revision): AiProviderConfig | null`.
- Changes: `resolveResumeThreadRuntime(settings, meta, resolveRevision)` must use the archived config when `activeRuntime` exists.

- [x] **Step 1: Write failing provider-freeze tests**

Add a resolver test whose current settings contain a modified provider but whose revision resolver returns the original provider. Assert the resumed runtime uses the original `baseUrl`, `apiKey`, model, and thinking level. Add a cache-key test showing that changing `modelProfiles` changes the runtime key.

```js
const runtime = resolveResumeThreadRuntime(changedSettings, meta, revision => (
  revision === 'revision-active' ? originalProvider : null
))
assert.equal(runtime.providerConfig.baseUrl, 'https://old.example/v1')
assert.equal(runtime.providerConfig.apiKey, 'old-secret')
assert.notEqual(oldRuntime.cacheKey, changedProfileRuntime.cacheKey)
```

- [x] **Step 2: Run tests and verify RED**

Run: `node --test tests/thread-service.test.mjs tests/agent-engine-initialization.test.mjs`

Expected: FAIL because resume ignores the revision resolver and the cache key omits the full provider revision.

- [x] **Step 3: Implement revision retention and resolution**

Use a deterministic SHA-256 revision over the complete provider config, retain snapshots in the main-process config store, and let `ThreadService.prepareTurn()` obtain the stored revision through a dependency.

```ts
rememberProviderConfig(config: AiProviderConfig): string {
  const revision = createProviderConfigRevision(config)
  const revisions = getStore().get('providerConfigRevisions') ?? {}
  getStore().set('providerConfigRevisions', { ...revisions, [revision]: config })
  return revision
}
```

Resolve HITL from the archived config and fail closed when its revision is unavailable. Include the same revision in the agent cache key.

- [x] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/thread-service.test.mjs tests/agent-engine-initialization.test.mjs`

Expected: PASS.

---

### Task 2: Canonicalize workspace bindings in shared code

**Files:**
- Create: `shared/workspace/path.ts`
- Modify: `src/stores/workspaceTransition.ts`
- Modify: `src/stores/app.ts`
- Modify: `src/ai/state/aiStore.ts`
- Modify: `electron/ai/application/ThreadService.ts`
- Modify: `electron/ai/thread/ThreadListQuery.ts`
- Test: `tests/workspace-thread-transition.test.mjs`
- Test: `tests/thread-service.test.mjs`

**Interfaces:**
- Produces: `normalizeWorkspacePath(path: string): string`.
- Produces: `normalizeWorkspaceBinding(path: string | null | undefined): string | null`.
- Produces: `areWorkspacePathsEqual(left, right): boolean` with `null` remaining an unbound, non-selectable value in renderer history.

- [x] **Step 1: Write failing canonicalization tests**

Persist a thread as `C:\\Work\\Book\\`, prepare its next turn with `c:/work/book`, and assert the main process accepts it and retains `c:/work/book`. Also assert row conversion canonicalizes legacy spellings.

```js
assert.doesNotThrow(() => service.prepareTurn(settings, {
  threadId: 'thread-windows',
  domain: 'editing',
  mode: 'edit',
  workspacePath: 'c:/work/book',
  userText: '继续',
}))
assert.equal(service.getMeta('thread-windows').workspacePath, 'c:/work/book')
```

- [x] **Step 2: Run tests and verify RED**

Run: `node --test tests/workspace-thread-transition.test.mjs tests/thread-service.test.mjs`

Expected: FAIL with `Thread workspace is locked` or an unnormalized persisted value.

- [x] **Step 3: Implement the shared canonical rule**

Move path normalization into `shared/workspace/path.ts`. Normalize at SQLite row conversion, metadata creation, main-process comparison, metadata persistence, runtime-store context creation, and renderer selection.

- [x] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/workspace-thread-transition.test.mjs tests/thread-service.test.mjs`

Expected: PASS.

---

### Task 3: Make workspace switching a prepared commit

**Files:**
- Modify: `src/stores/workspaceTransition.ts`
- Modify: `src/stores/app.ts`
- Modify: `src/ai/state/aiStore.ts`
- Modify: `src/views/MainView.vue`
- Test: `tests/workspace-thread-transition.test.mjs`

**Interfaces:**
- Produces: `prepareCloseAllTabs(): Promise<(() => void) | null>`.
- Produces: `prepareNewThread(workspacePath): (() => void) | null` in the AI store.
- Changes: `executeWorkspaceTransition()` returns `boolean` and invokes prepared commit closures only after successful agent termination.

- [x] **Step 1: Write failing transaction tests**

Add a coordinator test with prepared tab/draft commit closures and a failed termination. Assert neither closure runs. Add a success test asserting the order `workspace -> tabs -> draft` and a draft-preparation failure test that never calls termination.

```js
assert.equal(await executeWorkspaceTransition('/b', ports), false)
assert.deepEqual(events, ['prepare-target', 'prepare-tabs', 'prepare-draft', 'terminate'])
```

- [x] **Step 2: Run tests and verify RED**

Run: `node --test tests/workspace-thread-transition.test.mjs`

Expected: FAIL because the coordinator closes tabs before termination and creates the draft after commit.

- [x] **Step 3: Refactor tab closing into prepare/commit phases**

Extract dirty-tab confirmation/saving from physical tab removal. `prepareCloseAllTabs()` performs prompts and saves but returns a synchronous closure that removes the captured tabs only after termination succeeds. `closeTab()` reuses the same confirmation and removal helpers.

- [x] **Step 4: Prepare the target draft without publishing it**

Build the draft object after confirmation and return a closure that purges the previous local draft and activates the prepared target draft. Do not mutate `threads` during preparation.

- [x] **Step 5: Run tests and verify GREEN**

Run: `node --test tests/workspace-thread-transition.test.mjs tests/workspace-lifecycle.test.mjs`

Expected: PASS.

---

### Task 4: Collapse runtime/Compact state and delete unreachable code

**Files:**
- Delete: `src/ai/state/runtimeSelection.ts`
- Delete: `tests/runtime-selection-controller.test.mjs`
- Modify: `src/ai/thread/threadPresentation.ts`
- Modify: `shared/ai/contracts/protocol.ts`
- Modify: `shared/ai/contracts/thread.ts`
- Modify: `electron/ai/application/RuntimeSwitchService.ts`
- Modify: `electron/ai/AgentEngine.ts`
- Modify: `electron/App.ts`
- Modify: `src/ai/state/settings.ts`
- Modify: `src/ai/components/agent-panel/composables/useChatSend.ts`
- Modify: `src/ai/components/agent-panel/AgentInputArea.vue`
- Modify: `src/ai/components/agent-panel/input/AgentToolbar.vue`
- Modify: `src/ai/components/agent-panel/input/SendButton.vue`
- Modify: `src/ai/components/shell/AgentPanel.vue`
- Modify: `src/i18n/messages/en-US.ts`
- Modify: `src/i18n/messages/zh-CN.ts`
- Test: `tests/runtime-switch.test.mjs`
- Test: `tests/context-summarization.test.mjs`
- Test: `tests/thread-draft-domain.test.mjs`

**Interfaces:**
- `SessionContextStatsResponse` contains only `activeRuntime?` and `nextRuntime?`; pending selection remains on `AiThread.pendingRuntime`.
- `RuntimeSwitchResponse` contains `status`, `candidate`, current tokens, candidate trigger, and the only emitted rejection reason.
- Renderer keeps one request generation in `settings.ts` and one `contextStats` ref in `useChatSend.ts`.

- [x] **Step 1: Update tests to express the reduced contracts and verify RED**

Assert context stats through `nextRuntime`, assert runtime rejection through `status`, and remove the trivial header string test. Keep the draft-domain behavior test against the store-level predicate.

- [x] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/runtime-switch.test.mjs tests/context-summarization.test.mjs tests/thread-draft-domain.test.mjs`

Expected: FAIL because duplicate contract fields and controller code still exist.

- [x] **Step 3: Implement the reduced state flow**

Inline last-request-wins handling into `settings.ts`; delete the generic controller. Replace the Compact scalar refs with one response ref plus computed active/next/primary stats. Remove the unreachable pending-send button branch, unused compatibility aliases, unused runtime response fields, unused `AiThread.activeRuntime` IPC projection, no-op runtime candidate normalizer, and unused cache invalidation method. Add the missing `ai:switch-thread-runtime` cleanup handler.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/runtime-switch.test.mjs tests/context-summarization.test.mjs tests/thread-draft-domain.test.mjs`

Expected: PASS.

---

### Task 5: Full verification and commits

**Files:**
- Modify only files already named above if verification finds a regression.

**Interfaces:**
- Produces no new runtime interface; this task verifies the completed change set.

- [x] **Step 1: Run static verification**

Run: `npm run type-check`

Expected: PASS.

Run ESLint without `--fix` on all changed TypeScript and Vue files.

Expected: PASS.

- [x] **Step 2: Run the full suite**

Run: `npm test`

Expected: all suites pass with zero failures.

- [x] **Step 3: Inspect the final diff**

Run: `git diff --check` and `git diff --stat @{upstream}..HEAD`.

Expected: no whitespace errors; the remediation reduces redundant production code despite adding revision persistence and transaction tests.

- [x] **Step 4: Commit coherent changes**

```bash
git add electron shared src tests docs/superpowers/plans/2026-08-27-thread-lifecycle-review-fixes.md
git commit -m "fix(ai): harden thread lifecycle transitions"
```
