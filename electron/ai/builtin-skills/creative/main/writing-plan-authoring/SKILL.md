---
name: writing-plan-authoring
description: Load when the author asks to design/author a chapter's beats, or to write/draft a chapter's prose. A00 executes this — it opens the write-session authorization (confirm_writing_plan), optionally designs a beat plan, and either stops after materializing beats or delegates the writer. Covers the pre-write state machine that decides whether to author beats, write, re-confirm, or hold.
---

# S05a writing-plan-authoring

A00 executes this directly, on **two independent axes** (§ "Two independent axes"): (1) **Axis A — design/author the beat plan** (a deliverable in its own right; a plain structural edit that stops for review, no write-session); (2) **Axis B — open the prose write-session** via `confirm_writing_plan` and **delegate the writer** to expand prose. These are separate asks: **designing beats does NOT automatically continue to writing prose.** Prose expansion is the writer's job (its own flow lives in the `writer` agent).

**First, read the author's ask:**
- Asked for **beats** ("先写 beat", "设计一下节拍", "把 beat 列出来", "先出个 beat 骨架") → Axis A only: author/materialize the beats and **STOP for review** (case 3). Do not write prose off the back of a beat ask.
- Asked to **write the chapter / prose** ("写第 X 章", "续写", "把这章写出来") → Axis B: optionally design beats as your approach, then delegate the writer (cases 2, 4, 5, 6).
- Ambiguous ("开写第一章，先写 beat" mixes both) → the "先写 beat" wins: **author the beats, stop, and ask whether to write the prose now.** Never assume prose follows — it is expensive.

## The hard prerequisite is the chapter outline, NOT beats

Gate 3: the target chapter's outline must **exist and be `status: 已确认`, with every scene's three-part shape complete** (goal / conflict / outcome≠顺利达成 / POV). If not, STOP — fill the chapter outline first (S04, `outline-authoring`), get the author to confirm it, then resume. An event-level master outline never substitutes for a scene-level chapter outline. (See `story-development-flow`.)

**Beats are an OPTIONAL aid, not a gate.** Three sources are all valid: the author writes them, A00 designs them (this skill), or there are none. With no beats the writer writes directly from the confirmed outline scenes. Never make beats a precondition for writing prose.

## confirm_writing_plan = PROSE write-session authorization

`confirm_writing_plan` opens the **prose** write-session: "先批意图 → 授权域块编辑自动累积 → 整章终审". **Only call it when you are going to write the chapter's prose this session (Axis B).** Its approval (approve / **edit** — edited text wins / reject) opens the write-session over the `target_files` you name; the writer's block edits then auto-accumulate and converge at one whole-chapter finalize. Because a subagent has no conversation channel, this authorization happens in A00 **before** delegating the writer.

- **`plan` = a one-line writing intent** when writing straight from the outline (no beats), e.g. `从已确认章纲写第 3 章，范围：全部场景`.
- **`plan` = the beat skeleton** ONLY in the bundled path — the author asked to *write the chapter* and you author beats + prose in one session (case 2's beat variant): confirm_writing_plan(plan=beats) opens the session, you materialize the beats in-session, then delegate the writer.

**Authoring beats alone does NOT use `confirm_writing_plan`** (see case 3). A beats-only ask has no prose and no chapter finalize, so it must not open a write-session — an open session that only holds materialized beats would wrongly trigger a run-end finalize card. Author the beats as a plain structural edit (Axis A) and stop.

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
- Scenes separated by a `* * *` thematic break; **beats within a scene are separated by a blank line** — adjacent `> [!BEAT]` lines with no blank line between them merge into a single alert box on disk (only the first survives as a beat).
- On disk the Markdown pipeline may render the brackets escaped (`\[…\]`); that is the same beat — treat `[` and `\[` as equivalent.

## Pre-write state machine (decide before touching anything)

1. **Chapter outline missing / not 已确认** → fill the chapter outline first (S04). Do not write prose.
2. **Write the chapter, no beats** (author wants prose, straight from the outline) → `confirm_writing_plan` (one-line intent + `target_files`) → delegate the writer → mode A → finalize. **Do not pre-create the file** — the writer creates it with its prose via `create_document`, which auto-applies silently inside the authorized session. No empty skeleton. (Beat variant of this case — author wants the chapter written and you choose beats: `confirm_writing_plan(plan=beats)` → materialize beats in-session → writer → finalize.)
3. **Author beats (Axis A — STOP after)** — the author asked for beats: design them for a chapter that has none, or add / reword / reorder the `[!BEAT]` lines of one that already has them → build the beat plan → materialize it as `> [!BEAT]` lines in `manuscript/ch{NNN}.md` (new chapter via `create_document` with `directory`; existing chapter via block edits on the beat lines). **This goes through the normal edit-approval card — do NOT call `confirm_writing_plan`** (no prose, no write-session, no chapter finalize; an open session holding only beats would wrongly pop a run-end finalize card) → **STOP. Hand the beats back for the author to review** ("第一章 beat 已写入 ch001.md，要我接着写正文吗？"). Do NOT delegate the writer — that is Axis B, a separate ask. When the author later asks for the prose, that opens the write-session (case 5). When they ask to change beats *and* rewrite the prose in one go, that is case 6.
4. **Prose only — author asks to polish/rewrite prose, beats unchanged** → delegate the writer on its revision link directly, no `confirm_writing_plan`.
5. **Write the prose beneath existing beats** — beats already sit in the chapter (from a prior case 3, or the author wrote them), author now wants them expanded → `confirm_writing_plan` (one-line intent) → delegate the writer to expand the beats already in `targetChapter` → mode A → finalize.
6. **Beats + prose — author changes beats and wants the prose rewritten to match** → `confirm_writing_plan` → **edit the `[!BEAT]` lines** → delegate the writer to re-expand the affected scenes/beats.
7. **Has prose, beats unchanged, no explicit author ask** → do NOT rewrite. Ask the author: "这章已有内容——要改哪里？改 beat（结构）还是局部修订？" Written prose is expensive; never silently regenerate it.

## Drafting the beat plan (when A00 designs beats — case 3/6)

Read the confirmed chapter outline's scenes. For each scene, break it into beats — but **keep them coarse: mark the causal turns, not every action-beat.** Aim for **1–3 beats per scene**, each a single-line core point (`核心点`) that is causally necessary (load `scene-and-plot-construction` for causal necessity, `character-believability` for grounding). Fine-grained beats (one per half-second of action) backfire: materialized as visible `[!BEAT]` anchors in the file, they pull the writer toward filling each box into its own set-piece, which bloats length and stiffens pace. Beats are a spine, not a shot list — leave the writer room to write *through* them. Fragment check as in S03/S04. You may plan several related chapters at once (multi-chapter authorization). **Author the plan directly in the canonical `> [!BEAT] [场景-{N}-节拍-{M}] 核心点` format** — the `plan` you pass to `confirm_writing_plan` IS the beat skeleton, so materialization is a verbatim copy.

**Prefer the no-beat path for fast, velocity-driven chapters** (an opening hook, a chase, a shock) — beats fragment exactly the momentum such chapters need. When the outline itself asks for speed ("不铺垫、快节奏、速度骤降"), design no beats and let the writer expand straight from the outline scenes (case 2).

## Two independent axes

- **Axis A — does the beat layer change?** A00 adds / rewords / reorders / removes `[!BEAT]` lines — a **plain structural edit** (normal approval card), NOT a write-session. Authoring beats *alone* stops here (case 3) and never opens `confirm_writing_plan`.
- **Axis B — is the writer delegated to (re)expand prose?** This opens the `confirm_writing_plan` write-session → writer auto-accumulates → whole-chapter finalize. The writer writes prose beneath beats that lack it (or that the brief marks for rewrite), or from the outline scenes when there are no beats. (When beats and prose move together — case 2 beat variant, case 6 — the one `confirm_writing_plan` covers both.)

## Delegating the writer (axis B)

`task(subagent_type="writer")` with a thin brief. The brief **MUST** carry `targetChapter` (absolute host path) + scope + **whether the file exists yet** (you know this from routing; the writer must not hunt for it). Do NOT transcribe beats — they are the `[!BEAT]` lines already in `targetChapter`. Prose-style guidance goes here. On the no-beat path the file is absent, so the writer creates it via `create_document`, which MUST pass `directory` (the absolute `manuscript/` dir) — without it the file is only an in-memory tab, outside the session.

```
task(subagent_type="writer", description="""
展开链路。
targetChapter: /abs/workspace/manuscript/ch001.md
文件状态: 不存在，用 create_document 连正文创建；directory=/abs/workspace/manuscript
范围: 全部未落笔的场景        (case 6 时改为具体的 场景-2-节拍-3、场景-2-节拍-4)
""")
```

After the writer returns, run the **random-review pass (mode A)**: delegate one `reviewer` with `scenario=developmental`, `scope=chapter` for a "好不好" read, have the writer revise once, then the whole-chapter finalize. See the A00 orchestration prompt.

## Red lines

You confirm "要不要这样写 / 开写授权", never "逐句怎么写". When you design beats they grow from the confirmed chapter-outline scenes — never invent beats that bypass the outline, and never write a chapter's prose with no confirmed chapter outline. Beats (when present) go into the manuscript file, **never into the chapter outline**. Never make the writer author or edit beats when A00 owns them — but note the writer has judgment to lightly adjust beats it is expanding and report it (that is not the same as owning the layer). **Beats are preserved by default** — once materialized, the `> [!BEAT]` lines stay; the writer writes prose beneath them. Removing/reordering beats is structural (axis A, through `confirm_writing_plan`), never a side effect of writing.
