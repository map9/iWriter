---
name: restructuring
description: Load when the author wants a structural change to existing prose that reaches across chapters — cutting/merging/reordering scenes or chapters, renaming or reworking a character/place/rule, moving a plot thread. The main agent runs this directly. It does a one-time global pre-check, packages the whole plan for one author confirmation, then delegates the per-chapter rewrite. Not for a single in-chapter prose polish (that is revision-flow).
---

# restructuring

A structural change that spans more than one chapter — a rename, a cut, a reorder, a thread that moves. The main agent runs this directly. The danger is applying a change to some references and not others, and discovering conflicts mid-rewrite. So the flow is **one-time pre-check up front → one author confirmation → then rewrite** — never write-as-you-discover with scattered interruptions.

## The flow

1. **One-time global pre-check (before touching anything).** Two reads, together:
   - Load `structural-pacing-diagnosis` and scan the whole affected span for what the restructure breaks or unbalances (pressure build/release, sagging middle, thin climax).
   - Build the complete **impact surface** with `find_references`: read the target object's file (character/worldbuilding) to gather **all** its aliases first, pass the object plus every alias as `names`, scan the relevant directory. Check `names_with_no_hits` — an alias that hit nothing may be unused or spelled differently; verify before trusting the list is complete. A missing alias means a hole in the blast radius.
2. **Package it all into ONE author confirmation.** Summarize every potential conflict / imbalance / affected file into a single request via `confirm_writing_plan` (a restructure plan IS a writing plan; attach the global conflict list and the impact surface). Structural change is the author's call — surface the radius, don't decide it. If it touches confirmed outline or beats, that is an outline/beat change (`outline-authoring` / `writing-plan-authoring`) — fold it into the plan for confirmation.
3. **After the author confirms, fix a baseline first.** Suggest a `git_commit` to capture the pre-restructure state — this is the highest-value rollback point. Then:
   - Outline changes go through `outline-authoring` (normal block-edit approval).
   - Prose rewrite is delegated **per chapter** to the `writer`, each brief **referencing the already-approved plan** — do NOT repeat `confirm_writing_plan` per chapter; each chapter opens its own write-session (naming the affected chapters as `target_files`).
4. **Check the causal chain.** Load `scene-and-plot-construction` to verify the reordering did not break plot cause-and-effect.
5. Finalize each chapter, then remind the author to run a **consistency check** across the changed chapters plus what they reference (a restructure is exactly the commit-reminder trigger in `revision-flow`) — not the whole book.

## Red lines

- A structural change requires the **one-time pre-check + author confirmation up front** — never write-as-you-discover with scattered interruptions.
- Never apply a cross-chapter change without mapping the full reference set first — a partial application is worse than none.
- Structural change to outline/beats is confirmed through the authoring flows before any prose is rewritten; it is never a silent side effect.
- The impact radius is shown to the author; you never adjudicate a structural creative decision for them.
