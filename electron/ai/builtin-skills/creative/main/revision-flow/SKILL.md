---
name: revision-flow
description: The operating rhythm for the revision stage — load whenever prose that already exists is on the table. Covers author-triggered review, notes the author leaves in the text or says out loud, the author having rewritten or committed something themselves, comparing two versions or commits and turning that into guidance for later chapters, the writer revision link, findings persistence, and the commit consistency reminder. Not for the automatic post-draft review (that is drafting-flow).
---

# revision-flow

Work on prose that already exists — judging it, correcting it, and keeping the objects around it in step. Review is done by the read-only `reviewer` subagent through its lens skills (`developmental-review` / `line-editing-review` / `consistency-review`); revision is done by the `writer` on its revision link. You orchestrate and adjudicate; you never review or rewrite prose yourself.

Load `context-discipline` alongside this playbook: **name the baseline before judging anything**, and read the minimum object set for the beat. Most bad revision advice is a context failure, not a taste failure.

**Same three-beat loop as every other stage**, on a finished object: **compare** (the `reviewer`'s lenses, the author's notes, a diff between two versions) → **converge** (the `writer` revises within a declared range; or an upstream object is written back) → and **diverge** whenever the fix turns out to need options rather than a correction — a plot device to replace, a thread to re-route. Diverge is not a revision move you improvise: load `direction-ideation`, put real alternatives on the table, let the author choose, and only then converge.

## One intake, many sources

Judgment about existing prose reaches you in several shapes. They are **not different flows** — normalize each into the same graded finding and run the same triage:

| Source | How it arrives |
| --- | --- |
| Review lenses | you delegate `reviewer` (below) |
| The author's spoken notes | "this bit is flat", "he wouldn't say that" |
| The author's notes left inside the text | remarks the author typed into the chapter itself |
| The author's own rewrite / commit | they changed the prose and want it assessed or turned into guidance |
| Outside reader feedback | pasted or summarized |

**Notes left inside the text**: the author is free to mark them however they like — brackets, a prefix, plain interjections. There is no required syntax and you must never impose one. When the author says their notes are in the file, read the chapter **in full** and pick them out by what they are: remarks addressed to you rather than to the reader, evaluative or imperative in tone, breaking the narrative surface. If you find none, or suspect you found only some, ask — do not guess. Notes are instructions, not text to critique: act on them, do not argue with them, and remove them from the prose once handled.

Every source produces findings in the same shape: **where** (a block ID + a short quote — see `document-block-tools`) · **what** · **how bad** (BLOCKING / MAJOR / MINOR / OPTIONAL) · **how far it reaches** (this passage / this chapter / an upstream object).

## Triage — every finding goes to exactly one place

1. **Fixable in the prose, within a stated range** → the `writer` revision link.
2. **Needs an outline / plan / setting change** → NOT the writer. Route to `outline-authoring` / `writing-plan-authoring` / `worldbuilding-authoring`, get the author's confirmation, then resume the prose work.
3. **A creative choice the author must make** → `process/open-questions.md`, presented as options with their costs. Do not adjudicate it for them.

## Author-triggered review

When the author asks to check the story / the language / correctness / everything, delegate `reviewer` with the matching `scenario` — one or more of:
- `developmental` (story-level: does the story work) — add `scope` = `chapter` or `manuscript` (whole-draft pass).
- `line` (language-level polish).
- `consistency` (correctness / continuity).

Name several for a full-spectrum pass (e.g. `developmental`+`line`+`consistency` = three blocks in one brief). The brief carries `files` + `intent` + `scenario` + the confirmed chapter/master-outline + `project.md`, all as absolute host paths (see the main-agent delegation contract). The reviewer returns a summary + a `/large_tool_results/review-*.md` path and edits nothing.

**When it returns, you are not done — three steps, in order:**

1. **Read the findings file at the path it gave you**, exactly as written (that path is a mounted area; prepending the workspace makes it not exist). The summary is verdicts only — the findings, their options and their acceptance criteria are in the file, and the file dies with the session. Relaying the path to the author hands them something they cannot open.
2. **Triage every finding** into exactly one of the three destinations below. This is your job, not the reviewer's: it graded, you decide where each one goes.
3. **Report as a triage table** — finding → destination → what you propose — and get the author's call.

**Who wrote the draft never decides whether it gets reviewed** — a chapter the author wrote themselves goes through the same lenses. What it decides is the *baseline*: see below.

This differs from the automatic post-draft developmental pass (in `drafting-flow`, transient, chapter-scoped, developmental only). **Consistency and line-editing run ONLY on this author-triggered path** (and the commit reminder) — never in the per-chapter automatic pass.

## When the author changed the prose themselves

Their new text is the current fact. The outline and the settings are the things that may now be out of date — not the other way round. Compare and report; never push their prose back toward an older object.

Working order:

1. Establish what changed. Get the shape first (which files, how much), then pull only the diffs you need — never dump a whole commit into context.
2. Read the baseline set: `project.md`, the world's rules and **forbidden zones**, the chapter's own outline, every character file the change touches. Large index objects (the master outline) by targeted section only.
3. Deliver **three things, none optional**:
   - **What changed** — factual, no evaluation.
   - **Real conflicts only** — three kinds qualify: it breaks a stated forbidden zone; it contradicts already-published text; it creates a new obligation downstream (a device, a rule, a trait that later chapters must now honour). A difference from the outline is **not** a conflict.
   - **A write-back list** — which object, which field, changed to what. Confirm with the author, then execute.
4. Anything still undecided goes to `process/open-questions.md` so it survives the session.

A deviation from the outline is graded, not reported wholesale: breaking a scene's goal / conflict / outcome is BLOCKING; moving an information release, a planted hint, or a chapter hand-off is MAJOR and comes with a write-back proposal; staging, dialogue, ordering and detail inside a scene are **not findings at all** — they are the writing doing its job, and the outline follows the finished text.

## Persisting findings

The reviewer's findings file is session-scoped scratch: when the session ends it is gone, and the pass has to be paid for again. So on the author-triggered path, **persisting to `process/review-findings.md` is the default** (via the generic document tools, under approval — no dedicated tool). Skip it only when the author works the whole list through in this same turn; anything left over — including everything they declined for now — gets written down. Boundary with `process/open-questions.md`: **review-findings = concrete manuscript defects; open-questions = undecided creative decisions.** A finding that turns out to need the author to pick between two valid facts (which of two objects governs) is an open question, not a defect.

## The revision link

To act on findings (or a direct author revision ask), delegate the `writer` on its **revision link**: attach the modification intent + the **allowed range** (absolute paths) + anything the review said must not be touched. The writer stays within the declared range and does not overstep it.

**Open the write-session first — the revision link is not exempt.** Approve `confirm_writing_plan` naming the chapter in `target_files` BEFORE delegating. A delegated write outside an active authorization is rejected by policy, and rightly so: without a session the writer's edits have no captured baseline, no whole-chapter finalize, and no way for the author to undo the pass as a unit. The plan text here is short — one line of revision intent is enough; it authorizes *this file for this pass*, not a rewrite of the book. Your own block edits (non-prose objects: outlines, settings, character files) are unaffected and stay under per-block approval.

A revision that only polishes prose (beats unchanged) delegates the writer directly. A revision that changes structure (beats/outline) re-enters `writing-plan-authoring` or `restructuring` first — never let structural change leak in as a side effect of a prose pass.

Report back to the author as a **finding → outcome** table: what each item became, and for anything you declined, why. Carry forward what the reviewer flagged about the whole chapter (length against `project.md`'s target, a structural note) — do not drop it on the way through.

## Consistency reminder at commit

When about to `git_commit`, if the commit edits a previously-finalized chapter, followed a restructure, or changes many chapters (a few or more), **remind** the author to run a consistency check first — scoped to the changed chapters plus what they reference, not the whole book. A reminder, not a hard block; the author may skip it.

## Adjustments bubble as reminders, never auto-cascade

Whether a change at one level propagates up or down, and whether to rewrite affected prose — **remind the author, don't do it on your own** (see `story-development-flow`). A small adjustment = scene → beat within one chapter; a large one moves scenes across chapters and is `restructuring` work.

## Red lines

- You never review or rewrite prose directly — the `reviewer` reviews, the `writer` revises.
- The outline is the map the writing was made from, not a contract the finished prose is audited against. Grade deviations; do not report them by the line.
- Consistency/line review runs only on the author-triggered path or the commit reminder, never automatically per chapter.
- Structural change (beats/outline) is never a side effect of a prose revision pass; it re-enters the authoring flow under author confirmation.
- The commit reminder is a reminder, not a hard block.
