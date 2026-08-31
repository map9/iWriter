# DeepAgents 1.13 Native Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade DeepAgents to 1.13.2, replace the package patch with project-owned public integrations, and adopt the native delete tool without regressing summarization events or filesystem safety.

**Architecture:** A same-name `IWriterSummarizationMiddleware` replaces DeepAgents' default summarizer through the public middleware merge contract. A public v3 stream transformer attaches root/subagent attribution to compression events. The native DeepAgents filesystem `delete` tool is routed through iWriter's HITL policy with protected-root guards.

**Tech Stack:** TypeScript, LangChain 1.5, LangGraph 1.4, DeepAgents 1.13, Electron, Vue 3, Node test runner, esbuild test bundles.

**Spec:** `docs/superpowers/specs/2026-08-31-deepagents-1-13-native-integration-design.md`

## Global Constraints

- Use public LangChain, LangGraph, and DeepAgents APIs only; do not patch dependency build output.
- New Agents expose native `delete`; historical `delete_file` checkpoints are decoded, auto-rejected, and told to retry with `delete`.
- Every native delete requires HITL; protected roots can never be approved.
- Root and each declarative subagent receive independent summary middleware state.
- Context-compression chunks preserve existing renderer contracts.
- Tests are written and observed failing before production changes.
- Preserve the user's pre-existing uncommitted files and stage only files from this plan.

---

### Task 1: Adopt native delete with protected-root review

**Files:**
- Modify: `electron/ai/tools/common/FilesystemMutationTools.ts`
- Modify: `electron/ai/scaffold/filesystem/AgentFilesystem.ts`
- Modify: `electron/ai/scaffold/approval/FilesystemApprovalPolicy.ts`
- Modify: `electron/ai/ipc/FilesystemReviewAdapter.ts`
- Modify: `shared/ai/contracts/review.ts`
- Modify: `src/ai/components/agent-panel/chat-area/FilesystemReviewSurface.vue`
- Modify: `electron/ai/domain/edit/systemPrompt.ts`
- Test: `tests/runtime-path-tools.test.mjs`
- Test: `tests/agent-filesystem.test.mjs`
- Test: relevant review/UI contract tests discovered by `rg`

- [x] **Step 1: Write failing native-delete behavior tests**

Assert that the filesystem scaffold interrupts `delete`, new mutation tools no longer publish `delete_file`, every delete enters review, protected roots reject, and UI/review projection describes recursive directory deletion.

- [x] **Step 2: Run focused tests and verify RED**

Run the affected Node test files and confirm failures are caused by the old `delete_file` contract.

- [x] **Step 3: Implement the smallest native-delete migration**

Remove `delete_file` from the custom model tools, add native `delete` to interrupt/review contracts, auto-reject legacy requests with retry guidance, and add canonical protected-root/ancestor checks.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the same focused files and fix only migration regressions.

---

### Task 2: Implement project-owned summarization middleware

**Files:**
- Create: `electron/ai/scaffold/summarization/IWriterSummarizationMiddleware.ts`
- Modify: `electron/ai/runtime/AgentFactory.ts`
- Modify: `electron/ai/scaffold/summarization/SummarizationFramework.ts` if required by the public API boundary
- Test: `tests/context-summarization.test.mjs`
- Test: `tests/agent-engine-initialization.test.mjs`

- [x] **Step 1: Write failing middleware behavior tests**

Exercise the real middleware hooks to assert CJK token counting, threshold selection, standalone fallback, archive content, completion/failure events, and post-response summary updates.

- [x] **Step 2: Run tests and verify RED**

Confirm the tests fail because the project middleware and public AgentFactory integration do not yet exist.

- [x] **Step 3: Implement the middleware with public APIs**

Port only the required behavior onto `createMiddleware`, `Command`, `resolveBackend`, state reducers, and `getWriter`. Store per-run state in graph state rather than closures.

- [x] **Step 4: Inject independent root/subagent instances**

Replace `summarizationMiddlewareOptions` in AgentFactory and explicitly add the project middleware to each declarative subagent.

- [x] **Step 5: Run focused tests and verify GREEN**

Run summary and AgentFactory tests until all new behavior is green.

---

### Task 3: Project compression events through the public v3 stream

**Files:**
- Create: `electron/ai/scaffold/summarization/ContextCompressionStreamTransformer.ts`
- Modify: `electron/ai/ipc/StreamEventAdapter.ts`
- Modify: `electron/ai/AgentEngine.ts`
- Test: `tests/context-summarization.test.mjs`
- Test: `tests/stream-event-adapter.test.mjs` if present

- [x] **Step 1: Write failing root/subagent projection tests**

Feed controlled v3 protocol events and assert root events keep the root label while subagent events receive the parent task tool-call id and subagent name.

- [x] **Step 2: Run tests and verify RED**

Confirm raw custom-event consumption cannot provide stable subagent attribution without the new transformer.

- [x] **Step 3: Implement and integrate the transformer**

Use public `StreamChannel` / `ProtocolEvent` contracts, expose a context-compression iterable on the run, and let AgentEngine drain it with the existing chunk adapter.

- [x] **Step 4: Run focused tests and verify GREEN**

Verify root/subagent compression chunks and existing renderer contracts.

---

### Task 4: Upgrade DeepAgents and retire the patch

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `patches/deepagents+1.11.1.patch`
- Modify: `scripts/verify-langchain-patches.mjs`
- Modify: tests that assert dependency source text

- [x] **Step 1: Replace patch-source assertions with boundary tests**

Make dependency verification assert version compatibility, public exports, native `delete`, and a clean patch-package installation contract.

- [x] **Step 2: Run verification and confirm RED against the previous patched contract**

Run `npm run verify:langchain-patches` and confirm it requests the 1.13.2 public contract.

- [x] **Step 3: Upgrade and remove the patch**

Install `deepagents@1.13.2` exactly, update the lockfile, remove the old patch, and resolve compile/API differences without patching `node_modules`.

- [x] **Step 4: Run dependency and focused verification**

Run the dependency verifier, type-check, and all focused tests from Tasks 1-3.

---

### Task 5: Full verification and commit

**Files:**
- Modify only files already named above if verification identifies a regression.

- [x] **Step 1: Run static verification**

Run `npm run type-check` and non-mutating ESLint checks on changed TypeScript/Vue files.

- [x] **Step 2: Run the complete suite**

Run `npm test` and require zero failures.

- [x] **Step 3: Inspect dependency installation and final diff**

Run `npm run verify:langchain-patches`, `git diff --check`, and inspect `git status --short` to confirm the user's unrelated files remain unstaged.

- [x] **Step 4: Commit only this migration**

Stage the explicit files from this plan and commit with `refactor(ai): adopt deepagents native integrations`.
