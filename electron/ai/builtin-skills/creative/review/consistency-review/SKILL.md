---
name: consistency-review
description: Load for the consistency review task — the proofreading editor's audit of correctness, consistency, and completeness. Two stages, two separate verdicts (fidelity, then hard consistency). Grammar/spelling/format are NOT covered — the app's proofread system owns those. Returns a graded issue list; never rewrites the prose. Output format is in the reviewer agent protocol, not here.
---

# consistency-review

The proofreading editor's audit: *is the text correct, consistent, and free of gaps and contradictions?* This is correctness, not taste — leave the story-level read to `developmental-review`. Two stages, each with its own verdict; never merge them.

## Input

A near-final draft, or cross-chapter text. Baseline: the **confirmed** chapter outline (and any approved writing plan), `worldbuilding/` (especially the history-timeline), `characters/`, and previously narrated text. If the outline's `status` is not `confirmed` (legacy objects: `已确认`), say so rather than inventing a baseline. Check against the relevant objects and prior text **on demand** — do not build or maintain a persistent timeline/setting table.

## Goal

Two separate audits, two separate verdicts:

- **Stage 1 — fidelity**: is the prose faithful to what was authorized to be written?
- **Stage 2 — hard consistency**: is the text internally and against-canon consistent, and are threads closed?

## Scope (dimension emphasis)

| Dimension | Emphasis |
| --- | --- |
| Integrity | strong |
| All other dimensions | none (they belong to the other lenses) |

**Stage 1 — fidelity**

- Does each scene deliver the outline's **goal → conflict → outcome** (no frictionless "it worked out" where the outline demanded real conflict)?
- Do characters act from their **psychology triangle** (desire / fear / false belief) as set in the confirmed characters, not moved for plot convenience?
- Did the prose stay inside the declared scope — nothing invented or reordered beyond the plan?

**Stage 2 — hard consistency** (cover them; a dimension that's fine needs a sentence)

- **Plausibility / common sense** — anything violating basic plausibility given the established setting.
- **Timeline continuity** — event order, elapsed time, ages, season / time-of-day self-consistent across chapters and not contradicting confirmed setting or previously narrated facts.
- **Spatial continuity** — geography, distance, movement routes, scene positions plausible and consistent.
- **Character continuity** — appearance, history, ability, relationships, knowledge range, habits consistent front to back.
- **Setting continuity** — world rules, tech/power, item state, institutions not in conflict.
- **Factual accuracy** — history / law / medicine / profession / science / culture reliable (delegate genuine research questions upward; you flag, you don't research).
- **Thread closure** — planted hints get paid off; payoffs have a plant; note unresolved threads.
- **Style consistency** — if a `styles/{slug}.md` is active, does the prose hold that voice.

## Stop

- **Correctness only** — do not review story quality (that is `developmental-review`) and do not do line polishing.
- **Grammar / spelling / punctuation / format normalization are NOT yours.** The app's proofread system owns copy-editing; do not produce a proofreading pass.
- Keep the Stage-1 fidelity verdict and the Stage-2 consistency verdict as **two separate blocks**.
- A disagreement that is a creative decision (the author must choose, not a mistake to fix) goes to `open-questions`, not here — flag it, don't adjudicate.
- When the input is external reader feedback, map it into the graded format against objects/chapters; do not adjudicate whether the feedback is right.
- Read only — never edit the prose.
