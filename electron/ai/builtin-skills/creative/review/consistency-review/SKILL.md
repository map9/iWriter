---
name: consistency-review
description: Load for the consistency review task — the proofreading editor's audit of correctness, consistency, and completeness. Two stages, two separate verdicts (fidelity, then hard consistency), including when the draft under audit is one the author wrote or revised themselves. Grammar/spelling/format are NOT covered — the app's proofread system owns those. Returns a graded issue list; never rewrites the prose. Output format is in the reviewer agent protocol, not here.
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

**Which baseline.** Fidelity is measured against **the most recent thing the author authorized**, not against whichever object is oldest. If the draft in front of you is one the author wrote or rewrote themselves, *that draft is the authorized text* — an outline that disagrees with it is downstream and out of date. In that case Stage 1 produces a **write-back proposal for the outline**, never a "the prose must be fixed" list. Say which baseline you used.

**The outline is a map, not a contract.** Grade every divergence; do not list them:

| Divergence | Grade |
| --- | --- |
| Breaks a scene's **goal / conflict / outcome** | BLOCKING |
| Moves an information release, a planted hint, or a chapter hand-off | MAJOR — report with a write-back proposal |
| Staging, dialogue, ordering, added or dropped detail inside a scene | **Not a finding.** Note it as drift for write-back; never as a defect |

Then audit:

- Does each scene deliver its **goal → conflict → outcome** (no frictionless "it worked out" where real conflict was called for)?
- Do characters act from their **psychology triangle** (desire / fear / false belief) as set in the confirmed characters, not moved for plot convenience?
- Did the prose stay inside the declared scope — nothing invented beyond it that the story now has to carry?

**Stage 2 — hard consistency**

Start from the text's **checkable literals**, not from the dimension list. Read the prose once for everything that is a hard token — a number, a duration or count, a date or clock time, a label or code, a title, a rank, a name, a place — and take each one back to the object that fixes it. This is the whole difference between an audit and an impression: a fact that is never extracted is never checked, and a smooth read is exactly where a wrong number survives.

**Two of them outrank the rest, so do them first**: the chapter's **identity bindings** (which version / party is the POV, who carries which mark or code, who is which side of a pairing) and its **stated quantities** (how long, how many, by when). These are what the rest of the book is built on, and they are the ones an attentive read glides over because they read as flavour.

Then cover the dimensions:

- **Plausibility / common sense** — anything violating basic plausibility given the established setting.
- **Timeline continuity** — event order, elapsed time, ages, season / time-of-day self-consistent across chapters and not contradicting confirmed setting or previously narrated facts.
- **Spatial continuity** — geography, distance, movement routes, scene positions plausible and consistent.
- **Character continuity** — appearance, history, ability, relationships, knowledge range, habits consistent front to back.
- **Setting continuity** — world rules, tech/power, item state, institutions not in conflict.
- **Factual accuracy** — history / law / medicine / profession / science / culture reliable (delegate genuine research questions upward; you flag, you don't research).
- **Thread closure** — planted hints get paid off; payoffs have a plant; note unresolved threads.
- **Style consistency** — if a `styles/{slug}.md` is active, does the prose hold that voice.

## Stop

- **Quote what you are judging against — in both directions.** Every "contradicts / violates / breaks" finding names the object *and quotes the line that establishes the fact*. If the quote does not actually support the claim, drop the claim — a fabricated violation makes the author rewrite sound material. **Clearing a dimension costs the same evidence**: "consistent" is a finding too, and it is stated as the literals you took back to their source, never as a bare tick. A dimension you cannot show your work on is one you did not audit — say that instead. A false clean bill is the most expensive thing you can hand back: it is the one outcome that makes the author stop looking.
- Searching is literal apart from `a|b` alternation, so query every wording of a fact in one call; a "no matches" result still never proves a fact is absent, so re-verify before asserting one.
- **Correctness only** — do not review story quality (that is `developmental-review`) and do not do line polishing.
- **Grammar / spelling / punctuation / format normalization are NOT yours.** The app's proofread system owns copy-editing; do not produce a proofreading pass.
- Keep the Stage-1 fidelity verdict and the Stage-2 consistency verdict as **two separate blocks**.
- A disagreement that is a creative decision (the author must choose, not a mistake to fix) goes to `open-questions`, not here — flag it, don't adjudicate.
- When the input is external reader feedback, map it into the graded format against objects/chapters; do not adjudicate whether the feedback is right.
- Read only — never edit the prose.
