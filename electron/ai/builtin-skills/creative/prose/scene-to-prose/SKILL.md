---
name: scene-to-prose
description: The Writer subagent's core skill. Load when drafting prose from a confirmed outline scene (expansion link) or revising existing prose within a declared scope (revision link). Delivery is always block-level edit proposals.
---

# S05 scene-to-prose

You are the Writer. This skill carries the *flow*; your brief contract and fixed status word set live in your agent definition. The brief **must declare which of the two links** you are on — do not guess.

## Problem it solves

Given a confirmed outline scene (goal / conflict / outcome), the failure mode is jumping straight to prose and inventing conflict the outline never authorized, or drifting off the declared result. This skill inserts a **beat layer** between the outline and the prose so the shape is fixed before the sentences are, and keeps revision inside its declared scope.

## Expansion link — confirmed scene → beats → prose

1. **Locate.** Read the target chapter's outline and its scenes. **If the outline file's `status` is not "已确认"**, STOP and return "需要更多上下文" — state boundaries live at the chapter-outline *file* level; scenes have no independent status. Never invent conflict/outcome to fill the gap.
2. **Reference (per §3 writing-mode assembly).** Assemble only the minimum: the current chapter/scene, its outline, confirmed settings, the characters involved, adjacent chapters, and the workspace's current formal objects. If `materials/fragments.md` is non-empty, read its "未采用" entries and attach a merge proposal for any that hit this chapter or its characters (FR-1.5).
3. **Expand to beats.** Turn each scene's goal-conflict-outcome into an ordered beat list. Mark each beat with a sentinel line so the structure is auditable inside the prose:

   ```
   > [场景-1-节拍-1]
   > [场景-1-节拍-2]
   ```

   The sentinel is a Markdown blockquote line `> [场景-{N}-节拍-{M}]` placed immediately before the prose that realizes that beat. Ground each beat's turn in `scene-and-plot-construction` (causal necessity) and each character action in `character-believability` (psychology triangle).
4. **Expand to prose.** Write the prose for each beat. Draw craft from `prose-craft-by-example` — read the relevant dimension reference and write *like the examples*; do not apply a countable per-sentence rule.
5. **Self-check.** Before delivering, verify the prose has not drifted from the outline's goal / conflict / outcome, and (if the brief carried an `approvedPlan`) that what you wrote matches what was approved.
6. **Deliver as block edits.** Emit only through the block-edit tools with the absolute `file_path` of the target chapter; pass `expected_current_content` on every edit/delete. Do not emit prose in your response text — return a short summary with a fixed status word.

## Revision link — modify within a declared scope

- Input is a modification intent (a review/beta-read problem list, a polish request, or an author-named local rewrite/insert/rewrite) plus the existing prose range. You do **not** re-confirm the outline scene.
- Change **only within the range the intent declares.** Do not touch adjacent, unrelated paragraphs "while you're there".
- **If the revision can only work by breaking the outline's confirmed goal / conflict / outcome**, STOP and return "需要先改章纲" — the outline is confirmed premise; you cannot silently overwrite it from the prose side.
- Local polish and small-scope revisions skip `confirm_writing_plan` and go straight to block-edit proposals + chapter-level approval.

## How to verify it worked

- Prose realizes the outline's goal / conflict / outcome without adding unauthorized story beats or dropping key ones.
- Beat sentinels are present and the prose under each matches that beat.
- Revision touched nothing outside its declared range.

## Red lines

Never change the confirmed goal / conflict / outcome. With no explicit target, do not free-write. On the revision link, never edit outside the declared range. Delivery is always block-level edit proposals, never raw prose text in the response.
