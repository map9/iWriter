---
name: writing-plan-authoring
description: Load when the author asks to write or draft a chapter's prose. A00 executes this — it drafts the beat-level plan, confirms it, and delegates the writer. Covers the pre-write state machine that decides whether to write, re-confirm, or hold.
---

# S05a writing-plan-authoring

A00 executes this directly, BEFORE delegating the writer. Prose expansion (beat → text) is the writer's job (`scene-to-prose`); forming and confirming the beat plan is yours — because a subagent has no conversation channel, so anything needing author confirmation must happen before delegation. You draft beats for the same reason you draft outlines.

## Problem it solves

Without a confirmed beat layer between the chapter outline and the prose, `confirm_writing_plan` has nothing meaningful to confirm and the outline→prose chain breaks: the writer invents beats the author never saw. This skill makes the confirmed plan **be the beats**, so the author signs off on the chapter's beat structure before a word of prose is written, and that approved plan becomes the writer's brief and the fidelity baseline.

## Input readiness (gate 3)

The target chapter's outline must **exist and be `status: 已确认`, with every scene's three-part shape complete** (goal / conflict / outcome≠顺利达成 / POV). If not, STOP writing prose — fill the chapter outline first (S04, `outline-authoring`), get the author to confirm it, then resume. An event-level master outline never substitutes for a scene-level chapter outline. (See `story-development-flow`.)

## Pre-write state machine (decide before drafting anything)

1. **Chapter outline missing / not 已确认** → fill the chapter outline first (S04). Do not write prose.
2. **Outline 已确认, no beats, no prose** → draft the beat plan → `confirm_writing_plan` → delegate the writer to write prose → whole-chapter finalize.
3. **Outline 已确认, has beats, no prose** → `confirm_writing_plan` (confirm the beats) → delegate to write prose → finalize.
4. **Has prose, beats unchanged, no explicit author ask** → **do NOT rewrite.** Ask the author why: "这章已有内容——要改哪里？改 beat（结构）还是局部修订？" Written prose is expensive; never silently regenerate it.
5. **Has prose, author asks to change**: local polish → revision link (`scene-to-prose`) directly; **changing a beat = a structural change ⇒ `confirm_writing_plan`** (adjusting a 节拍 is adjusting the chapter's content, which the author confirms).

## Drafting the beat plan

Read the confirmed chapter outline's scenes. For each scene, break it into **2–5 beats**, each a single-line core point (`核心点`) that is causally necessary (load `scene-and-plot-construction` for causal necessity, `character-believability` for grounding). Assemble them as the `plan` for `confirm_writing_plan` — this is **beat-level intent, not line-by-line wording**. Fragment check as in S03/S04 (attach a merge proposal for a hitting 未采用 fragment). You may plan several related chapters at once (multi-chapter authorization).

The approved (or author-edited) plan travels with the delegation brief: it is the writer's writing basis, the fidelity-check (SS11) baseline, and — via its scene coverage — the session-closure "all scenes written" criterion.

## Delegating the writer

On approval, `task(subagent_type="writer")` with a brief declaring the expansion link, the `approvedPlan` (the confirmed beats), the scene list covered, and the `targetChapter` absolute path.

## Red lines

You confirm "要不要这样写" (beat intent), never "逐句怎么写". Beats grow from the confirmed chapter-outline scenes — never invent beats that bypass the outline, and never write a chapter's prose with no confirmed chapter outline.
