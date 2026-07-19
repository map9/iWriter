# source-preparation

Preparing a source manuscript for import is **mechanical**, not a reading task. You are deciding structure and boundaries, not judging the prose — do NOT read the whole book to import it (that defeats the point of a verbatim physical import and burns the token budget on text the tool moves untouched).

## What to settle with the author

- **The source file** — one absolute path. If the manuscript is spread across many files, the author consolidates first, or you import them as separate runs with a continuing `filename_start`.
- **The chapter delimiter** — which heading level starts a new chapter (`#` vs `##`). Sample a few points to confirm the level is used consistently; a manuscript that uses `#` for both the title page and chapters will mis-split.
- **What is not chapter prose** — a title page, table of contents, dedication, appendices, author's note. These land in `front-matter.md` (content before the first chapter heading) or should be trimmed from the source first. Confirm with the author which to keep.
- **Numbering start** — where chapter numbering begins (`filename_start`), e.g. importing volume two beginning at ch021.

## How to verify without reading it all

Call `import_manuscript` with no `boundaries` (dry-run) — it returns the heuristically-detected candidate boundaries (line index, title, confidence) without writing. Read only the text around the **low-confidence** candidates to accept or reject them, and watch for gaps (a long stretch with no boundary usually means a missed one). Add/remove entries to get the confirmed list, then call again with `boundaries` = those line indices to execute.

The LLM's job here is boundary judgment on the *candidate list*, not proofreading the *prose*.
