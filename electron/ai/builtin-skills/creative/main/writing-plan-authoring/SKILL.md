---
name: writing-plan-authoring
description: Load when the author asks to write or draft a chapter's prose. A00 executes this — it drafts the beat-level plan, confirms it, and delegates the writer. Covers the pre-write state machine that decides whether to write, re-confirm, or hold.
---

# S05a writing-plan-authoring

A00 executes this directly, BEFORE delegating the writer. Prose expansion (sentinel → text) is the writer's job (`scene-to-prose`); forming, confirming, AND materializing the beat layer is yours — because a subagent has no conversation channel, so anything needing author confirmation must happen before delegation. You draft beats for the same reason you draft outlines.

## Where beats live — the single source of truth

Beats live as **sentinel lines in the manuscript chapter file** (`manuscript/ch{NNN}.md`): `> [场景-{N}-节拍-{M}] 核心点`, each pointing back to a confirmed chapter-outline scene. They are NOT in the chapter outline (that stays scene-level and untouched) and NOT a separate object file. The manuscript sentinels are the beats — the writer's basis and the fidelity baseline. **You own the sentinel layer** (draft / add / reword / reorder / remove); the writer only writes the prose beneath them.

This is why delegation stopped breaking: you never hand the beats to the writer through the brief (a subagent can't see your conversation, so a transcribed plan arrives thin → the writer can't validate it). Instead you **write the confirmed beats into the target file as sentinels**, and the writer reads them from the file it is already editing. The brief shrinks to a pointer: link + `targetChapter` + scope.

## Input readiness (gate 3)

The target chapter's outline must **exist and be `status: 已确认`, with every scene's three-part shape complete** (goal / conflict / outcome≠顺利达成 / POV). If not, STOP — fill the chapter outline first (S04, `outline-authoring`), get the author to confirm it, then resume. An event-level master outline never substitutes for a scene-level chapter outline. (See `story-development-flow`.)

## Two independent axes

Every write/revise request decomposes into two independent decisions — do not conflate them:

- **Axis A — does the beat (sentinel) layer change?** You add / reword / reorder / remove sentinels in the manuscript. A beat change is a structural change ⇒ it goes through `confirm_writing_plan`.
- **Axis B — is the writer delegated to (re)expand prose?** The writer writes prose beneath sentinels that lack it (or that the brief marks for rewrite).

The two combine into the pre-write state machine below.

## Pre-write state machine (decide before touching anything)

1. **Chapter outline missing / not 已确认** → fill the chapter outline first (S04). Do not write beats or prose.
2. **New chapter (outline 已确认, no manuscript / no beats, no prose)** → draft the beat plan → `confirm_writing_plan` → **materialize the beats as sentinels in `manuscript/ch{NNN}.md`** → delegate the writer to expand all → whole-chapter finalize. (A. changes beats, B. delegates.)
3. **Prose only — author asks to polish/rewrite prose, beats unchanged** → revision link (`scene-to-prose`) directly, no `confirm_writing_plan`. (Not A, B only. This is the writer's default.)
4. **Beats only — author asks to change beats but not (yet) rewrite prose** → `confirm_writing_plan` → **edit the sentinels in the manuscript**; do NOT delegate the writer. The prose now lags its sentinels — that is the author's explicit choice; SS11 will flag the mismatch, and a later request re-expands it (case 5). (A only, not B.)
5. **Beats + prose — author changes beats and wants the prose rewritten to match** → `confirm_writing_plan` → **edit the sentinels** → delegate the writer to re-expand the affected scenes/beats. (A. and B.)
6. **Has prose, beats unchanged, no explicit author ask** → **do NOT rewrite.** Ask the author why: "这章已有内容——要改哪里？改 beat（结构）还是局部修订？" Written prose is expensive; never silently regenerate it.

## Drafting the beat plan

Read the confirmed chapter outline's scenes. For each scene, break it into **2–5 beats**, each a single-line core point (`核心点`) that is causally necessary (load `scene-and-plot-construction` for causal necessity, `character-believability` for grounding). This is **beat-level intent, not line-by-line wording**. Fragment check as in S03/S04 (attach a merge proposal for a hitting 未采用 fragment). You may plan several related chapters at once (multi-chapter authorization).

**Author the plan directly in the canonical sentinel format below** — the `plan` you pass to `confirm_writing_plan` IS the sentinel skeleton, so materialization is a verbatim copy with zero reformatting (no separate table/bullet form to convert). `confirm_writing_plan`'s approval is the write-session authorization switch (先批意图) and records the confirmed intent; the durable, authoritative form of the beats is the sentinels you then write into the manuscript.

## Canonical beat/sentinel format (MUST follow exactly — do not improvise)

The **only** allowed beat representation, used identically in the `confirm_writing_plan` `plan` AND in the manuscript, is:

```
# 第{N}章

> [场景-1-节拍-1] 一句话核心点
> [场景-1-节拍-2] 一句话核心点

* * *

> [场景-2-节拍-1] 一句话核心点
```

Rules — every run must produce the same shape:
- One sentinel per line, a Markdown blockquote `> [场景-{N}-节拍-{M}] 核心点`. **Never** a table, bullet list, or prose paragraph, and **never** the `{N}-{M}` short form — always the full `场景-{N}-节拍-{M}` label so plan and sentinel numbering can never diverge.
- Scenes are separated by a `* * *` thematic break; beats within a scene are consecutive sentinel lines.
- `核心点` = one sentence, a **causally necessary** beat point (什么发生 + 转折). No explanatory tail (don't "translate" a character's/faction's inner logic for the reader — that's the recurring mistake), no style/craft instruction (style lives in the writer brief / `prose-craft-by-example`), no line-by-line wording.
- On disk the Markdown pipeline may render the brackets escaped (`> \[场景-1-节拍-1\] …`); that is the SAME sentinel — treat `[` and `\[` as equivalent.

## Materializing the beats as sentinels

After `confirm_writing_plan` is approved (approved/edited — edited text wins), write the confirmed sentinels into the target file **verbatim** from the approved `plan`:

- **New chapter** → `create_document` (basename `ch{NNN}.md`, `directory` = the workspace `manuscript/` dir) whose content is the sentinel skeleton — sentinels only, no prose. A 节拍-only chapter is a valid, first-class state (some authors design all beats before any prose).
- **Existing chapter** → block edits (`insert_block` / `edit_block` / `delete_block`) that add / reword / reorder / remove the sentinel lines in place, preserving the prose under unchanged beats. Because the write-session is already authorized, these sentinel edits auto-accumulate (no per-edit card). Removing a beat whose prose should also go is a deliberate `delete_block` of both.

Never make the writer author or edit sentinels — that is your job and the writer's red line.

## Delegating the writer (axis B only)

When prose must be (re)written, `task(subagent_type="writer")` with a thin brief. The brief **MUST** contain the `targetChapter` as an **absolute host path** (never a bare "ch001" — without it the writer cannot locate the file and will either stop with `MISSING_FIELDS` or waste a round hunting). Concretely:

```
task(subagent_type="writer", description="""
展开链路。
targetChapter: /abs/workspace/manuscript/ch001.md
范围: 全部未落笔的哨兵      (case 5 时改为: 场景-2-节拍-3、场景-2-节拍-4)
""")
```

Give only link + `targetChapter` (absolute) + scope. Do NOT transcribe the beats into the brief; they are the sentinels already in `targetChapter`. Any prose-style guidance belongs here (it is not in the sentinels). For a pure prose polish (case 3) use the revision link with the intent + range.

## Red lines

You confirm "要不要这样写" (beat intent) and own the sentinel layer, never "逐句怎么写". Beats grow from the confirmed chapter-outline scenes — never invent beats that bypass the outline, and never write a chapter's prose (or sentinels) with no confirmed chapter outline. The chapter outline is not where beats live — never write sentinels into it.
