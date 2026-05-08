# Agent Branching Plan

## Goal

For a historical user message in `AgentMessageBubble`, allow "edit and resend" to create a new local branch instead of mutating the original conversation history.

This document is only a design note for later consideration. It does not imply implementation.

## Product Behavior

- Editing and resending a historical user message creates a new branch.
- A branch represents an alternate continuation from that user message.
- The UI shows branch navigation below that user message:
  - `< [2 / 2] >`
  - `1` means branch 1, `2` means branch 2, etc.
  - `<` and `>` switch branches.
- After creating a new branch, the UI automatically switches to the latest branch.
- Switching a branch changes the entire conversation suffix after the branch point, not just that single bubble.

## Core Principle

One branch should map to one real LangGraph/deepagents thread.

Do not try to rewrite the existing thread in place. Instead:

- keep the original thread as branch 1
- create a new thread for branch 2, branch 3, etc.
- use product-layer metadata to group sibling threads under the same branch point

This matches LangGraph's thread/checkpoint model better than mutating existing history.

## Why Not Reuse Current Resend Logic

Current resend behavior is only a front-end truncation:

- [AgentChatArea.vue](/Users/sunyafu/zebra/iWriter/src/components/ai/agent-panel/AgentChatArea.vue#L178) calls `truncateActiveThreadBeforeMessage(messageId)` and then `sendMessage(newContent)`
- [ai.ts](/Users/sunyafu/zebra/iWriter/src/ai/store/ai.ts#L358) only truncates local `thread.messages`
- [AgentEngine.ts](/Users/sunyafu/zebra/iWriter/electron/ai/AgentEngine.ts#L158) still reuses the same `threadId`

So the real persisted LangGraph history is not truncated.

## Intended Semantics

When the user edits historical message `M` and resends:

- keep all history before `M`
- drop `M` and everything after it in the new branch
- append edited message `M'`
- continue from there in a new thread

The original thread remains unchanged.

## Persistence Model

### Existing Layers

The app already has:

1. LangGraph/deepagents checkpointer state per `threadId`
2. thread metadata managed by `ThreadListQuery`

### New Branch Metadata

Add branch-level metadata outside the checkpointer, ideally in the same local DB as thread metadata.

Suggested fields:

- `conversation_id`
- `branch_group_id`
- `root_canonical_message_id`
- `thread_id`
- `parent_thread_id`
- `parent_message_id`
- `branch_order`
- `created_at`

This allows the UI to recover sibling branches even after reload.

## Thread and Message Model

### One Branch = One Thread

Each branch should be persisted as a normal `AiThread`.

Suggested new `AiThread` metadata:

- `conversationId`
- `isBranch`
- `branchRootMessageId`
- `branchParentThreadId`
- `branchParentMessageId`
- `branchIndex`
- optional `forkedFromCheckpointKey`

### Logical Message Identity

To recognize different versions of the same branch point across threads, messages should have a stable logical identity.

Suggested message metadata:

- `canonicalId`: stable logical message node id
- `sourceMessageId`: original message id that this edited version came from

Example:

- original user message: `id=msg-a1`, `canonicalId=canon-u3`
- edited branch message: `id=msg-b7`, `canonicalId=canon-u3`

This allows the UI to attach branch navigation to the same logical message node.

## Branch Creation Strategy

### Recommended First Version

Use message-level reconstruction, not checkpoint-level forking.

Flow:

1. read persisted messages from the source thread
2. locate the target historical user message
3. take the prefix before that message
4. create a new thread
5. initialize the new thread with that prefix
6. append the edited user message
7. run the agent on the new thread

### Why This First

This is simpler than true checkpoint-level branching and fits the current local architecture better.

Benefits:

- easier to reason about
- avoids directly manipulating SqliteSaver internals
- enough to support the desired branch UX

Tradeoff:

- it reconstructs message history rather than inheriting the full checkpoint tree

## Why Not Start With Checkpoint-Level Fork

Checkpoint-level fork would be closer to native LangGraph time travel, but it is much riskier locally because it would require deep handling of:

- `checkpoints` rows
- `writes` rows
- parent checkpoint relationships
- interrupted state continuity

That can be considered later, but should not be the first implementation.

## Editor Context Handling

New branches must not inherit incremental editor-state deltas blindly.

Current editor-state injection uses thread fields such as:

- `editorStateHash`
- `lastFilePath`
- `lastSectionHeading`
- `workspaceInjected`

See [ContextBuilder.ts](/Users/sunyafu/zebra/iWriter/src/ai/thread/ContextBuilder.ts#L116).

When a new branch is created:

- clear those delta-tracking fields
- force the first send on the new branch to inject full editor context

This is especially important if:

- the current active document changed
- the cursor moved
- the thread is reopened from history later

## What "Clear Truncated Content" Means

The requirement that truncated content should be cleared is correct, but it should apply to the new branch, not by rewriting the original branch.

### Must Be Cleared in the New Branch

- the original target user message
- all messages after it
- tool calls and tool results after it
- proposal / review state after it
- interrupted state
- streaming transient state
- editor-state delta residue

### Must Not Be Cleared in the Original Branch

- original message sequence
- original assistant replies
- original continuation

Those belong to branch 1 and remain valid history.

## UI Model

The branch selector appears below a user message only when:

- the message is a user message
- it belongs to a branch group
- total branches for that group is greater than 1

Display:

- `<`
- `[current / total]`
- `>`

Behavior:

- after creating a new branch, switch to the newest branch automatically
- when switching branches, reload the selected branch thread
- preserve the common prefix implicitly by showing that branch thread's own full history

The simplest implementation is to switch the active thread to the selected branch thread, while using branch-group metadata to render the selector on the corresponding user bubble.

## Suggested Store-Level APIs

Current `truncateActiveThreadBeforeMessage()` is not sufficient.

Suggested replacements:

- `forkBranchBeforeMessage(messageId: string, editedContent: string)`
- `switchBranch(rootCanonicalMessageId: string, branchIndex: number)`

### `forkBranchBeforeMessage`

Responsibilities:

- resolve source thread and target message
- create a new branch thread from prefix history
- register branch metadata
- switch active thread to the new branch
- send edited content on the new branch

### `switchBranch`

Responsibilities:

- locate sibling branch thread by branch group and index
- switch active thread to that branch
- refresh visible messages

## Suggested Main-Process API

Add a dedicated branch-creation entry point in the main process, separate from `sendMessage()`.

Examples:

- `createBranchFromThreadPrefix(...)`
- `forkThreadFromMessages(...)`

Responsibilities:

1. load source thread persisted messages
2. compute prefix before the target user message
3. create new thread metadata
4. initialize persisted message history for the new thread
5. clear runtime/interrupted state
6. return new `threadId`

This keeps the branching mechanism separate from normal send flow.

## Runtime State Reset Requirements

Whenever a branch is created, clear all transient execution state for the new thread:

- interrupted state
- current turn id
- live turn state
- pending review/proposal state
- streaming preview state

The new branch should start from a clean execution state.

## Recovery and Reload

Branch relationships must survive app restart and thread reload.

That means branch metadata cannot live only in the renderer store. It must be persisted alongside thread metadata.

When opening any branch thread later:

- restore the correct branch index
- restore sibling branch count
- show selector under the corresponding user message

## Minimal Viable Version

Recommended first implementation scope:

1. only branch from historical user messages
2. branch by reconstructing prefix messages into a new thread
3. persist branch metadata locally
4. show `< [n / m] >` below the branch-point user bubble
5. auto-switch to the newest branch after branch creation
6. force full editor-state injection on first send in the new branch

Do not start with:

- arbitrary checkpoint-level fork
- branch compare UI
- full branch tree visualization
- assistant-message branching

## Future Extensions

Possible future work after the first version:

- checkpoint-level fork instead of message reconstruction
- branch comparison view
- branch rename
- branch tree panel
- assistant-side branching
- visual timeline of branch ancestry

## Summary

The recommended local design is:

- treat each alternate resend as a new branch thread
- preserve the original thread as existing history
- store branch relationships in local metadata
- group sibling branch threads under the same logical user message
- render a branch selector under that user message
- switch full conversation suffix by switching branch threads

This approach matches the current architecture and keeps the design aligned with LangGraph-style branching semantics without requiring immediate checkpoint-level time travel support.
