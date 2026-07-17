---
name: writing-plan-authoring
description: Load when the author asks to design/author a chapter's beats, or to write/draft a chapter's prose. The main agent executes this — it opens the write-session authorization (confirm_writing_plan), optionally designs a beat plan, and either stops after materializing beats or delegates the writer. Covers the pre-write state machine that decides whether to author beats, write, re-confirm, or hold.
---

# writing-plan-authoring

The main agent executes this directly, on **two independent axes**:

- **Axis A — the beat layer.** Add / reword / reorder / remove `[!BEAT]` lines: a **plain structural edit** through the normal approval card. It is NOT a write-session and never calls `confirm_writing_plan`. Authoring beats *alone* stops here and hands them back for author review.
- **Axis B — the prose.** Delegate the `writer` to (re)expand prose: this opens a `confirm_writing_plan` write-session → block edits auto-accumulate → one whole-chapter finalize.

These are separate asks: **designing beats does NOT automatically continue to writing prose.** Prose is expensive — never assume it follows a beat ask. (When beats and prose move together — you author beats *and* write the chapter in one session — the one `confirm_writing_plan` covers both.)

## Read the author's ask

- Asked for **beats** ("write the beats first", "sketch the beats", "list the beats") → Axis A only (case 3).
- Asked to **write the chapter / prose** ("write chapter X", "continue", "get this chapter written") → Axis B: optionally design beats as your approach, then delegate the writer (cases 2, 4, 5, 6).
- Ambiguous ("start chapter 1, beats first" mixes both) → "beats first" wins: author the beats, stop, and ask whether to write the prose now.

## The hard prerequisite is the chapter outline, NOT beats

The gate: the target chapter's outline must **exist and be confirmed (`status: 已确认`), with every scene's three-part shape complete** (goal / conflict / outcome that is not a frictionless "it worked out" / POV). If not, STOP — fill the chapter outline first (`outline-authoring`), get the author to confirm it, then resume. An event-level master outline never substitutes for a scene-level chapter outline. (See `story-development-flow`.)

**Beats are an OPTIONAL aid, not a gate.** Three sources are all valid: the author writes them, the main agent designs them (this skill), or there are none. With no beats the writer writes directly from the confirmed outline scenes. Never make beats a precondition for writing prose.

## confirm_writing_plan = PROSE write-session authorization

`confirm_writing_plan` opens the **prose** write-session: approve the intent up front (approve / **edit** — edited text wins / reject) → block edits to the `target_files` auto-accumulate → one whole-chapter finalize. Because a subagent has no conversation channel, this authorization happens in the main agent **before** delegating the writer. **Only call it when you are going to write the chapter's prose this session (Axis B).**

- **`plan` = a one-line writing intent** when writing straight from the outline (no beats), e.g. "write chapter 3 from the confirmed outline, all scenes".
- **`plan` = the beat skeleton** only in the bundled path — the author asked to *write the chapter* and you author beats + prose in one session (case 2's beat variant): `confirm_writing_plan(plan=beats)` opens the session, you materialize the beats in-session, then delegate the writer.

**Authoring beats alone (Axis A) does NOT call `confirm_writing_plan`.** A beats-only ask has no prose and no chapter finalize, so it must not open a write-session — an open session holding only materialized beats would wrongly trigger a run-end finalize card. Author the beats as a plain structural edit and stop.

## Beat format (only when beats are designed) — extended GFM Alert

Beats live as **GFM Alert lines in the manuscript chapter file** (`manuscript/ch{NNN}.md`), never in the chapter outline and never a separate object file:

```
# Chapter {N}

> [!BEAT] [scene-1-beat-1] one-line core point

> [!BEAT] [scene-1-beat-2] one-line core point

* * *

> [!BEAT] [scene-2-beat-1] one-line core point
```

Rules:
- Each beat is a `> [!BEAT] …` blockquote alert. **`[!BEAT]` is the fixed marker** (the extraction anchor — beats are found by this marker, not by a coordinate regex).
- The scene coordinate `[scene-{N}-beat-{M}]` **the main agent must include** when it authors beats (it lets consistency-review align beats to outline scenes). An author writing beats by hand may omit it; the main agent does not.
- The core point = one sentence, a **causally necessary** beat point (what happens + the turn). No explanatory tail, no style/craft instruction, no line-by-line wording.
- Scenes separated by a `* * *` thematic break; **beats within a scene are separated by a blank line** — adjacent `> [!BEAT]` lines with no blank line between them merge into a single alert box on disk (only the first survives as a beat).
- On disk the Markdown pipeline may render the brackets escaped (`\[…\]`); that is the same beat — treat `[` and `\[` as equivalent.

## Pre-write state machine (decide before touching anything)

1. **Chapter outline missing / not confirmed** → fill the chapter outline first (`outline-authoring`). Do not write prose.
2. **Write the chapter, no beats** → `confirm_writing_plan` (one-line intent + `target_files`) → delegate the writer → automatic post-draft review → finalize. **Do not pre-create the file** — the writer creates it with its prose via `create_document`, auto-applied silently inside the authorized session (no empty skeleton). (Beat variant — the author wants the chapter written and *you* choose beats: `confirm_writing_plan(plan=beats)` → materialize beats in-session → writer → finalize.)
3. **Author beats only (Axis A — STOP after)** → build the beat plan → materialize it as `> [!BEAT]` lines in `manuscript/ch{NNN}.md` (new chapter via `create_document` with `directory`; existing chapter via block edits on the beat lines) → **STOP and hand the beats back for review** ("beats for chapter 1 are written into ch001.md — want me to write the prose next?"). Do NOT delegate the writer. When the author later asks for the prose, that is case 5; changing beats *and* rewriting prose together is case 6.
4. **Prose only — polish/rewrite prose, beats unchanged** → delegate the writer on its revision link directly, no `confirm_writing_plan`.
5. **Write the prose beneath existing beats** (beats already in the chapter, author wants them expanded) → `confirm_writing_plan` (one-line intent) → delegate the writer to expand the beats already in `targetChapter` → automatic post-draft review → finalize.
6. **Beats + prose — change beats and rewrite the prose to match** → `confirm_writing_plan` → **edit the `[!BEAT]` lines** → delegate the writer to re-expand the affected scenes/beats.
7. **Has prose, no explicit author ask** → do NOT rewrite. Ask the author what should change — the beats (structure) or a local revision. Written prose is expensive; never silently regenerate it.

## Drafting the beat plan (when the main agent designs beats — case 3/6)

Read the confirmed chapter outline's scenes. For each scene, break it into beats — but **keep them coarse: mark the causal turns, not every action-beat.** Aim for **1–3 beats per scene**, each a single-line core point that is causally necessary (load `scene-and-plot-construction` for causal necessity, `character-believability` for grounding). Fine-grained beats (one per half-second of action) backfire: materialized as visible `[!BEAT]` anchors, they pull the writer toward filling each box into its own set-piece, which bloats length and stiffens pace. Beats are a spine, not a shot list — leave the writer room to write *through* them. Run the same fragment check as in worldbuilding/outline authoring. You may plan several related chapters at once (multi-chapter authorization). **Author the plan directly in the canonical `> [!BEAT] [scene-{N}-beat-{M}] core point` format** — the `plan` you pass to `confirm_writing_plan` IS the beat skeleton, so materialization is a verbatim copy.

**Prefer the no-beat path for fast, velocity-driven chapters** (an opening hook, a chase, a shock) — beats fragment exactly the momentum such chapters need. When the outline itself asks for speed, design no beats and let the writer expand straight from the outline scenes (case 2).

## Delegating the writer (axis B)

`task(subagent_type="writer")` with a thin brief. The brief **MUST** carry `targetChapter` (absolute host path) + scope + **whether the file exists yet** (you know this from routing; the writer must not hunt for it). Do NOT transcribe beats — they are the `[!BEAT]` lines already in `targetChapter`. Prose-style guidance goes here. On the no-beat path the file is absent, so the writer creates it via `create_document` — which must pass the absolute `manuscript/` dir as `directory` (see `document-block-tools`).

```
task(subagent_type="writer", description="""
Expansion link.
targetChapter: /abs/workspace/manuscript/ch001.md
File state: does not exist — create it with the prose via create_document; directory=/abs/workspace/manuscript
Scope: all not-yet-written scenes        (for case 6, name the specific beats, e.g. scene-2-beat-3, scene-2-beat-4)
""")
```

After the writer returns, run the **automatic post-draft review**: delegate one `reviewer` with `scenario=developmental`, `scope=chapter`, have the writer revise once, then the whole-chapter finalize. See the A00 orchestration prompt.

## Red lines

You confirm "should we write it this way / authorize the write", never "how to phrase each sentence". When you design beats they grow from the confirmed chapter-outline scenes — never invent beats that bypass the outline, and never write a chapter's prose with no confirmed chapter outline. Beats (when present) go into the manuscript file, **never into the chapter outline**. Never make the writer author or edit beats when the main agent owns them — but note the writer has judgment to lightly adjust beats it is expanding and report it (that is not the same as owning the layer). **Beats are preserved by default** — once materialized, the `> [!BEAT]` lines stay; the writer writes prose beneath them. Removing/reordering beats is structural (axis A), never a side effect of writing.
