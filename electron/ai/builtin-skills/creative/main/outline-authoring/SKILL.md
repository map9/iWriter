---
name: outline-authoring
description: Load when writing or editing outline objects (master-outline.md, vol{NN}-outline.md, ch{NNN}-outline.md) whose content has converged from a candidate. The main agent executes this directly.
---

# outline-authoring

The main agent executes this directly. The job is to produce an outline that **earns its keep** — a chapter outline from which the writer can tell *what dialogue and what turn to write*, not a one-liner they must invent conflict and result from.

## Input readiness

This stage sits behind the readiness gates — the settings/characters gate before a master outline, the master-outline gate before a chapter outline; and a confirmed chapter outline is itself the write-precondition for prose (an event-level master outline never substitutes for it). The gate criteria and their reverse tests live in `story-development-flow` — check the relevant gate first, and if the upstream isn't ready, surface the gap and route back (ideation / `worldbuilding-authoring` / the master outline) rather than authoring on thin footing. Fill chapter outlines lazily (not all at once), but never skip one.

## Problem it solves

A scene reduced to "the hero goes to ask the informant for a lead" forces whoever writes it to invent the conflict and result on the spot, which is where drift begins. This skill produces scenes whose goal / conflict / outcome are already specified, so the outline is a real contract the prose and the fidelity check can be measured against.

## Procedure

1. **Confirm convergence.** If the structure is still an open candidate, stop and route back to ideation.
2. **Check the scene three-part shape.** Load the `outline-schema` reference. Every scene needs goal / conflict / outcome, and the **outcome must not be a frictionless "it worked out"** — it is achieved-at-greater-cost / not-achieved / achieved-but-reveals-a-new-problem.
3. **Bring in the relevant craft.** Load `scene-and-plot-construction` (scene three-part + causal chain). Load `structural-pacing-diagnosis` when designing or revising global shape, and `thematic-coherence` when the outline must land the work's theme.
4. **Global arc before structure nodes.** When designing the whole-book arc, **run a `structural-pacing-diagnosis` pass first** (where does pressure build and release), then commit the concrete structure nodes — don't lay down nodes and diagnose afterward.
5. **Fragment check.** Same as `worldbuilding-authoring`: if `materials/fragments.md` has non-empty not-yet-adopted entries hitting this outline object, attach a merge proposal; no hit → stay silent.
6. **Write.** Write to `outline/master-outline.md`, `vol{NN}-outline.md`, or `ch{NNN}-outline.md` via `create_document` / `edit_block`. **Mark the `status` field explicitly** (`草稿中` = draft / `已确认` = confirmed) — the prose flow gates on it.

## How to verify it worked

- Every scene has goal / conflict / outcome, and no outcome reads as a frictionless "it worked out".
- The `status` field is present and explicit on every outline file written.
- Global structure was diagnosed for pressure curve before nodes were committed, not after.

## Red lines

The outline `status` field (`草稿中` / `已确认`, present on all three outline levels) must be explicitly marked. The outcome field never reads as a frictionless "it worked out". Candidate structure does not enter a confirmed outline before the author confirms.
