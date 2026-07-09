---
name: writing-plan-authoring
description: Load when the author asks to write or draft a chapter's prose. A00 executes this — it opens the write-session authorization (confirm_writing_plan), optionally designs a beat plan, then delegates the writer. Covers the pre-write state machine that decides whether to write, re-confirm, or hold.
---

# S05a writing-plan-authoring

A00 executes this directly, BEFORE delegating the writer. It does two things: (1) **open the write-session authorization** via `confirm_writing_plan` (so the writer's block edits auto-accumulate and converge at one whole-chapter finalize), and (2) **optionally design a beat plan**. Prose expansion is the writer's job (`scene-to-prose`).

## The hard prerequisite is the chapter outline, NOT beats

Gate 3: the target chapter's outline must **exist and be `status: 已确认`, with every scene's three-part shape complete** (goal / conflict / outcome≠顺利达成 / POV). If not, STOP — fill the chapter outline first (S04, `outline-authoring`), get the author to confirm it, then resume. An event-level master outline never substitutes for a scene-level chapter outline. (See `story-development-flow`.)

**Beats are an OPTIONAL aid, not a gate.** Three sources are all valid: the author writes them, A00 designs them (this skill), or there are none. With no beats the writer writes directly from the confirmed outline scenes. Never make beats a precondition for writing prose.

## confirm_writing_plan = write-session authorization (可含 beat)

Writing a chapter's prose still needs one up-front authorization — the "先批意图 → 授权域块编辑自动累积 → 整章终审" model depends on it. That authorization is `confirm_writing_plan`, now **generalized**: its `plan` is flexible.

- **Author wants beats** → `plan` = the beat skeleton (see format below).
- **No beats (write straight from the outline)** → `plan` = a one-line writing intent, e.g. `从已确认章纲写第 3 章，范围：全部场景`.

Either way, approval (approve / **edit** — edited text wins / reject) opens the write-session over the `target_files` you name. Because a subagent has no conversation channel, this authorization must happen in A00 **before** delegating the writer.

## Beat format (only when beats are designed) — extended GFM Alert

Beats live as **GFM Alert lines in the manuscript chapter file** (`manuscript/ch{NNN}.md`), never in the chapter outline and never a separate object file:

```
# 第{N}章

> [!BEAT] [场景-1-节拍-1] 一句话核心点
> [!BEAT] [场景-1-节拍-2] 一句话核心点

* * *

> [!BEAT] [场景-2-节拍-1] 一句话核心点
```

Rules:
- Each beat is a `> [!BEAT] …` blockquote alert. **`[!BEAT]` is the fixed marker** (the extraction anchor — beats are found by this marker, not by a coordinate regex).
- The scene coordinate `[场景-{N}-节拍-{M}]` **A00 must include** when it authors beats (it lets consistency-check align beats to outline scenes). An author writing beats by hand may omit it; A00 does not.
- `核心点` = one sentence, a **causally necessary** beat point (什么发生 + 转折). No explanatory tail, no style/craft instruction, no line-by-line wording.
- Scenes separated by a `* * *` thematic break; beats within a scene are consecutive `> [!BEAT]` lines.
- On disk the Markdown pipeline may render the brackets escaped (`\[…\]`); that is the same beat — treat `[` and `\[` as equivalent.

## Pre-write state machine (decide before touching anything)

1. **Chapter outline missing / not 已确认** → fill the chapter outline first (S04). Do not write prose.
2. **New chapter, write straight from the outline (no beats)** → `confirm_writing_plan` (a one-line writing intent + `target_files`) → delegate the writer to expand from the outline scenes → the writer's random-review pass (mode A) → whole-chapter finalize. (No beat layer at all — a valid, common path.)
3. **New chapter, design beats first** (author writes them, or A00 drafts them) → if A00 drafts: build the beat plan → `confirm_writing_plan` (plan = the beat skeleton) → **materialize the beats as `> [!BEAT]` lines in `manuscript/ch{NNN}.md`** (new chapter via `create_document`, existing via block edits) → delegate the writer to expand → mode A → finalize.
4. **Prose only — author asks to polish/rewrite prose, beats unchanged** → revision link (`scene-to-prose`) directly, no `confirm_writing_plan`.
5. **Beats only — author changes beats but not (yet) the prose** → `confirm_writing_plan` → **edit the `[!BEAT]` lines**; do NOT delegate the writer. The prose now lags its beats — the author's explicit choice; consistency-check will flag it; a later request re-expands (case 6).
6. **Beats + prose — author changes beats and wants the prose rewritten to match** → `confirm_writing_plan` → **edit the `[!BEAT]` lines** → delegate the writer to re-expand the affected scenes/beats.
7. **Has prose, beats unchanged, no explicit author ask** → do NOT rewrite. Ask the author: "这章已有内容——要改哪里？改 beat（结构）还是局部修订？" Written prose is expensive; never silently regenerate it.

## Drafting the beat plan (when A00 designs beats — case 3/6)

Read the confirmed chapter outline's scenes. For each scene, break it into **2–5 beats**, each a single-line core point (`核心点`) that is causally necessary (load `scene-and-plot-construction` for causal necessity, `character-believability` for grounding). Fragment check as in S03/S04. You may plan several related chapters at once (multi-chapter authorization). **Author the plan directly in the canonical `> [!BEAT] [场景-{N}-节拍-{M}] 核心点` format** — the `plan` you pass to `confirm_writing_plan` IS the beat skeleton, so materialization is a verbatim copy.

## Two independent axes

- **Axis A — does the beat layer change?** A00 adds / rewords / reorders / removes `[!BEAT]` lines. A beat change is structural ⇒ it goes through `confirm_writing_plan`.
- **Axis B — is the writer delegated to (re)expand prose?** The writer writes prose beneath beats that lack it (or that the brief marks for rewrite), or from the outline scenes when there are no beats.

## Delegating the writer (axis B)

`task(subagent_type="writer")` with a thin brief. The brief **MUST** contain `targetChapter` as an **absolute host path**. Give only link + `targetChapter` (absolute) + scope. Do NOT transcribe beats into the brief — any beats are the `[!BEAT]` lines already in `targetChapter`. Any prose-style guidance belongs here (it is not in the beats).

```
task(subagent_type="writer", description="""
展开链路。
targetChapter: /abs/workspace/manuscript/ch001.md
范围: 全部未落笔的场景        (case 6 时改为具体的 场景-2-节拍-3、场景-2-节拍-4)
""")
```

After the writer returns, run the **random-review pass (mode A)**: delegate one `editorial-review` critic (via general-purpose) for a "好不好" read, have the writer revise once, then the whole-chapter finalize. See the A00 orchestration prompt.

## Red lines

You confirm "要不要这样写 / 开写授权", never "逐句怎么写". When you design beats they grow from the confirmed chapter-outline scenes — never invent beats that bypass the outline, and never write a chapter's prose with no confirmed chapter outline. Beats (when present) go into the manuscript file, **never into the chapter outline**. Never make the writer author or edit beats when A00 owns them — but note the writer has judgment to lightly adjust beats it is expanding and report it (that is not the same as owning the layer).
