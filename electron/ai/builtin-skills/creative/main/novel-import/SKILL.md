---
name: novel-import
description: Load when bringing an EXISTING complete (or partial) manuscript into the workspace — the author has a finished novel/draft in a docx/odt/markdown file and wants to work on it here, or the workspace has manuscript prose but no settings/characters/outline behind it. The main agent orchestrates this directly. Covers confirming import boundaries with the author, the physical verbatim import, and reverse-extracting the settings/characters/outline from the prose.
---

# novel-import

Bringing prose that already exists into the project. Two distinct halves that must not be conflated:
1. **Physical import** — get the source file's prose into `manuscript/ch{NNN}.md`, **verbatim**.
2. **Reverse-extraction** — reconstruct the settings / characters / outline objects *from* that prose, so the project has the upstream it would normally have been built from.

The main agent runs this directly (a subagent has no conversation channel, and import boundaries need the author).

## Entry

Enter when: the author asks to import a manuscript, OR routing sees `manuscript/` with prose but `worldbuilding.md` / `characters.md` / `master-outline.md` missing or thin. **Propose, don't auto-run** — importing and extracting are large operations.

## The flow

1. **Confirm the source and the boundaries with the author.** What file, what format, how chapters are delimited (which heading level = a chapter), what to keep vs. drop (front matter, appendices). Preparation is mechanical, not creative — see `references/source-preparation.md`. Don't guess boundaries; a wrong split silently mis-slices the whole book.
2. **Detect boundaries, confirm, then import — verbatim.** Call `import_manuscript` with NO `boundaries` (dry-run): it returns heuristically-detected candidate chapter boundaries. Sample-check the low-confidence ones (read the text around those lines, not the whole book) and confirm the boundary list with the author. Then call `import_manuscript` again with `boundaries` = the confirmed line indices + `target_directory` (execute, approval-gated) — it splits and writes the chapters directly. The prose is **never rewritten or summarized** — it goes from Pandoc straight to disk. Existing same-named chapter files are overwritten, so check the target is empty or intended.
3. **Reverse-extract the upstream objects** — distill settings / characters / outline from the imported prose. This is large and read-heavy, so **delegate it in batches** to general-purpose subagents (a subagent per batch of chapters); see `references/reverse-extraction.md`. Each batch returns evidence to `/large_tool_results/`, never writes objects.
4. **Aggregate and confirm.** You reconstruct the **structure layer into `outline/`** (per `outline-schema`, marked `status: draft`), and merge the **character/setting candidates into `exploration/`** — NOT into `characters/` / `worldbuilding/`. Those objects have no status field, and the extractions are the model's *reading* of the prose, not author-confirmed facts; writing them into the formal objects would fabricate a confirmed state. The author reviews the candidates in `exploration/` and promotes what they want later. The prose stays the source of truth.

## Red lines

- The imported prose is verbatim — never let it pass through the model to be re-emitted; that risks silent alteration and blows the token budget. Use `import_manuscript`, not `create_document` with copied text.
- Chapter boundaries are confirmed with the author before writing, never guessed.
- Reverse-extracted objects are proposals distilled from the prose; the author confirms them, and the prose — not the object — remains authoritative on conflict.
- Import is a proposal too: never auto-run it on a routing hunch — surface it and let the author decide.
