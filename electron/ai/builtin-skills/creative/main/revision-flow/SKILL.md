---
name: revision-flow
description: The operating rhythm for the revision stage — load when the author asks to review/check finished prose (story / language / correctness / all angles), to revise existing prose, or when committing changes that reach back into finalized chapters. Covers author-triggered review scenario routing, the writer revision link, review-findings persistence, and the commit consistency reminder. Not for the automatic post-draft review (that is drafting-flow).
---

# revision-flow

Work on prose that already exists — checking it, polishing it, correcting it. Review is done by the read-only `reviewer` subagent through its lens skills (`developmental-review` / `line-editing-review` / `consistency-review`); revision is done by the `writer` on its revision link. You orchestrate and adjudicate; you never review or rewrite prose yourself.

## Author-triggered review

When the author explicitly asks to check the story / the language / correctness / everything, delegate `reviewer` with the matching `scenario` — one or more of:
- `developmental` (story-level: does the story work) — add `scope` = `chapter` or `manuscript` (whole-draft pass).
- `line` (language-level polish).
- `consistency` (correctness / continuity).

Name several for a full-spectrum pass (e.g. `developmental`+`line`+`consistency` = three blocks in one brief). The brief carries `files` + `intent` + `scenario` + the confirmed chapter/master-outline + `project.md`, all as absolute host paths (see the main-agent delegation contract). The reviewer returns a summary + a `/large_tool_results/review-*.md` path and edits nothing.

This differs from the automatic post-draft developmental pass (in `drafting-flow`, transient, chapter-scoped, developmental only). **Consistency and line-editing run ONLY on this author-triggered path** (and the commit reminder) — never in the per-chapter automatic pass.

## Persisting findings

On the author-triggered path you MAY persist the reviewer's findings file to `process/review-findings.md` (via the generic document tools, under approval — no dedicated tool). Boundary with `process/open-questions.md`: **review-findings = concrete manuscript defects; open-questions = undecided creative decisions.** Persist only when the findings outlive the turn (a backlog the author will work through); a quick in-conversation read that the author acts on immediately stays transient.

## The revision link

To act on findings (or a direct author revision ask), delegate the `writer` on its **revision link**: attach the modification intent + the **allowed range** (absolute paths). The writer stays within the declared range and does not overstep it. Prose-fixable items go to the writer; **items needing a plan/outline change are NOT the writer's** — route those to `writing-plan-authoring` / `outline-authoring`, get the author's confirmation, then resume.

A revision that only polishes prose (beats unchanged) delegates the writer directly. A revision that changes structure (beats/outline) re-enters `writing-plan-authoring` or `restructuring` first — never let structural change leak in as a side effect of a prose pass.

## Consistency reminder at commit

When about to `git_commit`, if the commit edits a previously-finalized chapter, followed a restructure, or changes many chapters (a few or more), **remind** the author to run a consistency check first — scoped to the changed chapters plus what they reference, not the whole book. A reminder, not a hard block; the author may skip it.

## Adjustments bubble as reminders, never auto-cascade

Whether a change at one level propagates up or down, and whether to rewrite affected prose — **remind the author, don't do it on your own** (see `story-development-flow`). A small adjustment = scene → beat within one chapter; a large one moves scenes across chapters and is `restructuring` work.

## Red lines

- You never review or rewrite prose directly — the `reviewer` reviews, the `writer` revises.
- Consistency/line review runs only on the author-triggered path or the commit reminder, never automatically per chapter.
- Structural change (beats/outline) is never a side effect of a prose revision pass; it re-enters the authoring flow under author confirmation.
- The commit reminder is a reminder, not a hard block.
