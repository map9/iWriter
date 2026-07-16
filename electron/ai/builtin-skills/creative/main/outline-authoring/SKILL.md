---
name: outline-authoring
description: Load when writing or editing outline objects (master-outline.md, vol{NN}-outline.md, ch{NNN}-outline.md) whose content has converged from a candidate. The main agent executes this directly.
---

# outline-authoring

The main agent executes this directly. The job is to produce an outline that **earns its keep** — a chapter outline from which the writer can tell *what dialogue and what turn to write*, not a one-liner they must invent conflict and result from.

## Input readiness (the outline gates)

- **Before a master outline**: settings/characters must be ready — a main character + a core counterpart with concrete psychology triangles whose desires/fears can collide, world rules/forbidden-zones set, theme a question that can't be answered cleanly. Reverse test: would the structure nodes be all "an event happened" with no "what the character paid for it"? If so, settings are too thin — go back to ideation / `worldbuilding-authoring`.
- **Before a chapter outline**: the corresponding master-outline structure node must be clear enough to break into scenes (what happens + which arc + which theme-beat). If you can't derive "which scenes this chapter has", the node is too coarse — flesh out the master/volume outline first.
- **The chapter outline is the write-precondition for a chapter**: once the work is chaptered, a chapter's scene-level outline must exist and be confirmed (`已确认`) before its prose is written — an event-level master outline never substitutes for it. Fill it lazily (not all at once), but never skip it. See `story-development-flow`.

## Problem it solves

A scene reduced to "the hero goes to ask the informant for a lead" forces whoever writes it to invent the conflict and result on the spot, which is where drift begins. This skill produces scenes whose goal / conflict / outcome are already specified — and whose outcome is never a frictionless "it worked out" — so the outline is a real contract the prose and the fidelity check can be measured against.

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
