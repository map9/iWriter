---
name: story-development-flow
description: Load when judging whether a project is ready to move to the next creative stage — before authoring a master outline, before drafting a chapter outline, before writing a chapter, or when answering "where am I / what's next". Defines the default pipeline and the readiness gates.
---

# story-development-flow

The creative pipeline is NOT enforced by a state machine — the author may iterate, jump, and override. So quality is guarded by **readiness gates**: how mature the upstream must be before this stage's output can be any good. A gate is a **quality-guard + gap proposal, not a hard lock**.

## The default pipeline

```
project.md ─G0→ worldbuilding/characters ⇄ ─G1→ master outline →[volume outline]─G2→ chapter outline ─G3→ prose → in-flow review (developmental · one pass) → whole-chapter finalize → proofread/refactor
                (before prose, optionally design beats: author-written / main-agent-designed / none. With beats the writer follows them; without, it writes straight from the outline scenes.)
```

Levels differ in granularity — **event-level** (master/volume outline: structure nodes) vs **scene-level** (chapter outline: goal/conflict/outcome three-part; beat: in-scene, **optional**). The dividing line is the chapter outline: **an event-level master outline never substitutes for a scene-level chapter outline.** The hard prerequisite for prose is Gate 3 (chapter outline confirmed); **beats are an optional aid, not a gate.**

## The soft/hard principle (reconciling gates with author autonomy)

- **You never cross a gate on your own.** Before entering a stage, check the upstream's readiness. If it's not ready, surface the gap and propose filling it first — do NOT silently fabricate the missing upstream, do NOT push ahead and produce something weak.
- **The author may cross a gate explicitly** ("never mind that, just write it"). Then proceed, but give **one** minimal quality-risk note (e.g. "this chapter's outline isn't confirmed; writing now may mean big rework later"), and don't repeat it. Approval red lines are never relaxed.
- **Gap-fill is a switch, not a hang**: switch upstream to fill the gap → author confirms → return to the original task. Any write-session stays open.

## The five gates (readiness = judgment, not a mechanical checklist)

Each gate's sharpest test is the **reverse judgment**: "if I force the next step now, what weak result do I get?"

**Gate 0 — project ready (→ ideation / setup)** — `project.md` premise's four elements (protagonist / goal / obstacle / stakes) hold + theme + scale. Missing → project bootstrap / ideation first, don't invent.

**Gate 1 — setup/characters ready (→ can build the master outline)** — the master outline is a blueprint of conflict, and conflict grows from character nature.
- Protagonist + at least one core relationship/antagonist, each with a formed psychological triangle (desire / fear / false belief), whose desire-fear can collide naturally (not an external misunderstanding); the world's core rules + key forbidden zones (with reasons) are set; the theme is a question that cannot be answered cleanly.
- **Reverse judgment**: if you build the master outline now, would the structure nodes all be "an event happened" with no "what the character paid or revealed for it"? If yes → the setup is too thin, go back to ideation / worldbuilding.

**Gate 2 — master outline ready (→ can detail chapter outlines)** — a chapter outline turns one structure node of the master outline into scenes.
- The structure node for the chapter/section being detailed states "what happens + the arc it advances + (if any) its thematic landing"; the arc stage is clear; the relevant master-outline section is ideally `已确认` (confirmed).
- **Reverse judgment**: from the master-outline node, can you derive "which scenes this chapter has, and each scene's goal"? If not → the node is too coarse, fill the master/volume outline first.

**Gate 3 — chapter outline ready (→ can write the chapter)** — the writer, looking only at the chapter outline, should know what to write for each scene.
- The chapter's `ch{NNN}-outline.md` exists and is `status: 已确认` (confirmed); every scene's three-part shape is complete (verifiable goal / conflict / outcome that is not a frictionless success / POV / cast present).
- **Reverse judgment**: holding the chapter outline, would you still have to invent the conflict and outcome yourself? If yes → the outline is inadequate; complete and confirm it before writing.
- Once the work is chaptered, chapter N's outline must be formed and confirmed before writing it; you need not build all chapter outlines at once, but never write prose straight from the event-level master outline.

**Gate 4 is not a gate — beats are an optional aid** — the prose-writing authorization is carried by `confirm_writing_plan` (generalized to write-session authorization; its plan may be a beat plan or a one-line writing intent). Beats have three sources: author-written / main-agent-designed / none. With beats the writer follows them; without, it writes straight from the outline scenes and segments the prose itself. The beat encoding format, the two axes (does the beat layer change / delegate the writer), the pre-write state machine and rewrite protection all live in `writing-plan-authoring`.

## Quality: the editorial review loop

Prose isn't done at "written". Quality is guarded by four things: input maturity (Gates 1-3), the writer's own craft, the **editorial review loop**, and the author's finalize. Review is done by the read-only `reviewer` subagent, whose brief carries `scenario` = one or more of `developmental` (story-level: does the story work) / `line` (language-level polish) / `consistency` (correctness); for `developmental`, also `scope` (`chapter` | `manuscript`).
- **Random review (in-flow, automatic)**: after the writer returns a draft, A00 delegates ONE `reviewer` with `scenario=developmental`, `scope=chapter` for a story-level read (drama / character & voice / POV / prose / structure & pacing / theme / reader experience), the writer revises ONCE, then the author does the whole-chapter finalize. Consistency and line-editing are NOT run here. The reviewer's opinions are transient — not persisted to `review-findings.md`.
- **Author-triggered review**: when the author asks to check quality / consistency / all angles, A00 delegates `reviewer` with the matching `scenario` (all three for a full-spectrum pass); the reviewer writes a `/large_tool_results/review-*.md` file and A00 may persist it to `process/review-findings.md`. Consistency runs only here (and on the commit reminder).

## Adjustments bubble as reminders, never auto-cascade

A small adjustment = scene → beat (within one chapter); a large one = scenes across multiple chapters must move. Whether/how a change at one level propagates up or down, and whether to rewrite the prose = **remind the author, don't do it on your own**. You may plan the chapter outlines (+ optional beats) of several related chapters at once before drafting. **Consistency reminder at commit**: if `git_commit` reaches back to edit a finalized chapter / follows a refactor / spans multiple chapters, remind the author to check consistency first (changed chapters + their blast radius, not the whole book; a reminder, not a hard lock).

## status.md is a derived ledger, not truth

`.iwriter/status.md` records current stage / front / gate status / next step — but it is a **rebuildable projection**; ground truth is the object files' own `status` fields and existence. Reconcile any status.md claim with a targeted read; never trigger a startup global scan for it.
