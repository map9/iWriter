---
name: drafting-flow
description: The operating rhythm for the drafting stage — load when the task is to write a chapter's prose (its outline confirmed, gate 3). Orchestrates the write-session authorization, delegating the writer, the automatic post-draft developmental review, and the whole-chapter finalize. Not for ideation/outline (use ideation-outline-flow) or author-triggered full review (use revision-flow).
---

# drafting-flow

Turning a confirmed chapter outline into finalized prose. This is the orchestration spine; the beat/state-machine mechanics live in `writing-plan-authoring`, the writer brief contract in the main-agent prompt's delegation section, and the gates in `story-development-flow`. Load those; don't restate them here.

**This stage is the same three-beat loop as every other one** — it only looks different because the object is a chapter and the executor is a subagent:

| Beat | Here it is | Routes to |
| --- | --- | --- |
| Diverge | deciding how this chapter will go — beats, or an approach the outline leaves open | `writing-plan-authoring`, `direction-ideation` when real alternatives are wanted |
| Converge | the prose gets written into the file | the `writer` |
| Compare | the draft is judged | the `reviewer` (developmental, chapter scope) |

Note the order: unlike the upstream links, converge comes *before* compare here — you cannot judge prose that does not exist yet. A revision after the review is the loop turning again, not a new stage.

## The prerequisite

The hard gate is the **chapter outline** — it must exist and be confirmed (`status: confirmed`, legacy `已确认`), every scene's three-part shape complete (gate 3, see `story-development-flow`). An event-level master outline never substitutes. **Beats are optional**, not a gate. If the outline isn't ready, STOP and fill it (`outline-authoring`), get the author's confirmation, then resume — never write prose off a thin upstream.

## The drafting loop

For a chapter the author wants written:

1. **Plan** — load `writing-plan-authoring`. It reads the author's ask onto its two axes (author beats = Axis A, stops for review; write prose = Axis B, a separate ask) and its pre-write state machine, and decides whether to design beats, write straight from the outline scenes, re-confirm, or hold. "Write the beats first" means author beats and STOP — do not auto-continue to prose. Only "write the chapter" flows through.
2. **Authorize** — open the write-session (`confirm_writing_plan` with `target_files`) BEFORE delegating, because a subagent has no conversation channel. This authorizes block edits to the target chapter to auto-accumulate silently through to one finalize.
3. **Delegate the writer** — `task(subagent_type="writer")` with the thin brief the prompt's delegation contract specifies (the labelled brief template: LINK / TARGET / FILE EXISTS / SCOPE / INTENT / DO NOT TOUCH / REFERENCES / RETURN). Do NOT transcribe beats — they are the `[!BEAT]` lines already in the file; with none, the writer works from the confirmed outline scenes. On the no-beat path do NOT pre-create the file.
4. **Auto-review** — the automatic post-draft developmental review (below). Not optional; it is part of "writing this chapter".
5. **Finalize** — take the chapter to the author for the whole-chapter finalize.

Never blindly rewrite existing prose — written prose is expensive (state machine case 7).

## Automatic post-draft developmental review

Writing a chapter is not done when the writer returns a draft.

- Delegate **ONE** `reviewer` with `scenario=developmental`, `scope=chapter` — the full brief (files + intent + confirmed outline + `project.md`, all absolute paths). It returns a summary + a `/large_tool_results/review-*.md` path, touches nothing, and does NOT check consistency or do line polishing.
- Feed its opinions back to the `writer` for **ONE** revision pass — hand over the findings-file path or the inline summary; the writer adopts with judgment and gets only **prose-fixable** items.
- **If a finding needs a plan/outline change (beyond prose)**, that is NOT the writer's — you handle it: route to `writing-plan-authoring` or `outline-authoring`, get the author's confirmation, then resume. Modifying the plan or outline is never the writer's job.
- The reviewer's opinions here are **transient** — do NOT promote them to `process/review-findings.md`. (Persisting findings is the author-triggered path, in `revision-flow`.)

Consistency and line-editing are NOT run in this automatic pass — only developmental. Author-triggered full-spectrum review is `revision-flow`.

## Finalize

The whole-chapter finalize closes the write-session (`finalize_chapter`, or the host's run-end fallback if you forget). The author accepts / reworks / rejects; the accumulated edits and any author hand-edits are surfaced there. Beyond finalize (proofread / line polish / restructure) is revision-stage work.

## Red lines

- Never write a chapter's prose without a confirmed chapter outline; never invent beats that bypass the outline.
- Prose is a separate, expensive ask — designing beats does not automatically continue to writing.
- Open the write-session authorization before delegating, never after.
- The writer never owns the beat layer or edits the outline.
