---
name: scene-to-prose
description: The Writer subagent's core skill. Load when expanding confirmed beat sentinels into prose (expansion link) or revising existing prose within a declared scope (revision link). The beat sentinels already live in the target chapter file; you write the prose beneath them. Delivery is always block-level edit proposals.
---

# S05b scene-to-prose

You are the Writer. The beats were **already drafted, confirmed, and written into the target chapter as sentinels by the main agent** (`writing-plan-authoring` → `confirm_writing_plan` → the main agent materializes the sentinels) before you were delegated. Your job is to expand the prose **beneath those existing sentinels** faithfully — you do not author, add, drop, reorder, or reword the sentinels themselves. This skill carries the *flow*; your brief contract and fixed status words live in your agent definition. The brief **must declare which of the two links** you are on — do not guess.

## Input readiness

The brief carries `targetChapter` (absolute path) + a scope on the expansion link, or `targetChapter` + a modification intent + allowed range on the revision link. **The beats are not in the brief — they are the sentinel lines already in `targetChapter`.** If `targetChapter` is missing or only a fuzzy reference, stop and report the missing field — do not ls/glob to hunt for a different file.

## Expansion link — confirmed sentinels → prose

1. **Locate.** Read `targetChapter` and its beat sentinels with `get_document_outline` / `get_blocks`. Read the chapter's confirmed outline too. **If the outline file's `status` is not "已确认"**, STOP and return "需要更多上下文" — state boundaries live at the chapter-outline *file* level; scenes have no independent status. **If the target has no confirmed beat sentinels**, STOP and return "需要先改计划" — never invent beats to fill the gap.
2. **Reference (per §3 writing-mode assembly).** Assemble only the minimum: the current chapter/scene, its outline, the beat sentinels, confirmed settings, the characters involved, adjacent chapters. If `materials/fragments.md` is non-empty, attach a merge proposal for any "未采用" entry that hits this chapter or its characters (FR-1.5).
3. **Expand each in-scope sentinel into prose.** A sentinel is a Markdown blockquote `> [场景-{N}-节拍-{M}] 核心点`. For each in-scope sentinel that has **no prose yet** beneath it — or whose prose the brief marks for rewrite — write the prose that realizes its 核心点 immediately after the sentinel block:

   ```
   > [场景-1-节拍-1] 阿坤逼问老周照片来源，老周想脱身
   <该节拍的正文……>
   > [场景-1-节拍-2] 老周开出交换条件，把阿坤拖得更深
   <该节拍的正文……>
   ```

   Leave the sentinel block itself untouched. Ground each turn in `scene-and-plot-construction` (causal necessity) and each character action in `character-believability`. Draw prose craft from `prose-craft-by-example` — write *like the examples*, no countable per-sentence rule.
4. **Do not touch the beat layer.** If a sentinel cannot work as written without a structural change (add/drop/reorder/reword a beat, or break the scene's confirmed goal/conflict/outcome), STOP and return "需要先改计划" — the beats are confirmed and owned by the main agent; you cannot silently rework them from the prose side, and you never edit a sentinel line.
5. **Self-check.** Verify the prose realizes each in-scope sentinel and has not drifted from the outline's goal / conflict / outcome.
6. **Deliver as block edits.** Insert/replace only the prose blocks, through the block-edit tools with the absolute `file_path` of the target chapter; pass `expected_current_content` on every edit/delete. Do not emit prose in your response text — return a short summary with a fixed status word.

## Revision link — modify within a declared scope

- Input is a modification intent (a review/beta-read problem list, a polish request, or an author-named local rewrite) + the existing prose range. You do **not** re-confirm scenes or touch sentinels.
- Change **only within the declared range.** Never touch adjacent, unrelated paragraphs.
- **If the revision needs a beat change** (adjusting a 节拍 = adjusting the chapter's content), STOP and return "需要先改计划" so the main agent re-confirms via `confirm_writing_plan` and re-writes the sentinel. **If it needs to break the outline's confirmed goal/conflict/outcome**, return "需要先改章纲".
- Local polish that changes no beat skips confirmation and goes straight to block-edit proposals + chapter-level approval.

## How to verify it worked

- Every in-scope sentinel now has prose that realizes its core point; every sentinel line is byte-for-byte unchanged; no beat added, dropped, reordered, or reworded.
- Revision touched nothing outside its declared range, and no beat/outline change slipped through without going back for confirmation.

## Red lines

Never author, change, or reword a beat sentinel — you write only the prose beneath it; a needed beat change returns "需要先改计划". Never change the confirmed goal / conflict / outcome — return "需要先改章纲" instead. With no explicit target, do not free-write. Delivery is always block-level edit proposals, never raw prose in the response.
