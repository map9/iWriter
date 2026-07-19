---
name: developmental-review
description: Load for the developmental review task — the story-level read that asks whether the story works. Scope chapter (one/consecutive chapters) or manuscript (the whole draft). Developmental editor's hat. Returns opinions and directions; never rewrites the prose. Output format is in the reviewer agent protocol, not here.
---

# developmental-review

The developmental editor's read: *does the story work, and if not, why and how to rebuild it?* You explain why a story is or isn't landing and where the fix is — you do not do the line editor's or proofreader's job. Trust your judgment as an experienced editor; read as a reader would, then step back and diagnose.

## Input

- `scope: chapter` — one or consecutive chapter drafts. Baseline: the confirmed chapter outline (its scenes' goal / conflict / outcome), the characters involved, `project.md`.
- `scope: manuscript` — the whole draft. Baseline: master/volume outline, `project.md`, the character set.
- If the baseline outline's `status` is not `confirmed` (legacy objects: `已确认`), say so rather than inventing one.

## Goal

Judge whether the story is dramatically alive and moving — not whether the sentences are polished (that is `line-editing-review`) or whether facts line up (that is `consistency-review`).

- `scope: chapter` — does this chapter earn its place: real conflict, the protagonist driving, an outcome that changes the situation?
- `scope: manuscript` — the overall reading experience, the root problems, and an ordered way to fix them.

## Scope (dimension emphasis)

| Dimension | Emphasis |
| --- | --- |
| Positioning | weak |
| Story mechanics | strong |
| Character system | strong |
| Narrative organization | strong |
| Expression | medium |
| Integrity | weak |

Cover the emphasized dimensions; a dimension that's fine needs one sentence. Coarse and directional — no mechanism rulebooks.

- **Drama (story mechanics)** — does each scene play as dramatic action, or is it summarized? Real conflict and tension? Does the outcome move the story (never a frictionless "it worked out")? Is the protagonist driving, or are things resolved by coincidence?
- **Character & voice (character system)** — do actions grow from who these people are (desire / fear / false belief)? Do characters sound distinct, or does everyone speak in the author's one voice? Is dialogue doing subtext or over-explaining?
- **Narrative organization** — POV discipline and psychic distance holding? Structure and pacing: does the unit earn its length; any spinning-in-place; is length allocated by dramatic weight; opening hook and closing pull?
- **Theme** — is meaning landing with depth, or answered cheaply / preachily?
- **Expression (medium)** — flag texture only where it blocks the drama; for mannered / over-written prose use the shared `restraint` skill as the checklist, don't restate it. Deep line work is `line-editing-review`'s job.

For `scope: manuscript`, additionally produce the whole-draft outputs: **overall reading experience** (where a reader enters, invests, is confused, tires, is moved), a **root vs. cascade vs. surface** problem separation, an **editorial assessment**, a **revision roadmap** (ordered so structural fixes precede their downstream effects), a **keep list** (what must not be lost in revision), and **open questions for the author**.

## Stop

- `scope: chapter` in the automatic post-draft pass: protect the draft — raise only "does the story work / where does it start to sag" directions; note local language issues but do not demand they be fixed now, and do not run a consistency pass here.
- `scope: manuscript`: stop at the assessment and roadmap; do not slide into sentence-level polishing — that is `line-editing-review`.
- **When a problem cannot be fixed by prose alone — it needs a beat, a writing plan, or a chapter-outline change — say so explicitly in the finding.** That is the caller's to route upstream (the plan or the chapter outline), NOT a prose-revision task for the writer. You flag the need; you do not redesign the outline.
- Never rewrite the prose or edit the file; emit directions, not rewritten passages.
