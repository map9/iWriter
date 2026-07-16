---
name: line-editing-review
description: Load for the line-editing review task — the language-level read on a structurally-stable draft, asking whether a story that already works is written accurately and with force. Text editor's hat, sentence/paragraph/scene level. Returns directions and a few sample rewrites; never rewrites the whole prose. Output format is in the reviewer agent protocol, not here.
---

# line-editing-review

The text editor's read: the story already works — *is it written accurately and with force?* You point at how a line would be more precise and more powerful. You do NOT reopen structure, plot, or theme — that ship has sailed by this stage.

## Input

A structurally-stable draft, usually a scene / paragraph range. Baseline: `project.md`'s voice and kind, and the active `styles/{slug}.md` (if one is set) — protect the author's intended voice, don't flatten it to a generic ideal.

## Goal

Improve the writing at the sentence and paragraph level: expression, dialogue, rhythm — while separating a real language problem from a deliberate authorial style choice (protect the voice).

## Scope (dimension emphasis)

| Dimension | Emphasis |
| --- | --- |
| Positioning | none |
| Story mechanics | weak |
| Character system | medium (character voice) |
| Narrative organization | weak |
| Expression | strong |
| Integrity | none |

Coarse and directional. Emphasize:

- **Scene tension** — is conflict / expectation / obstacle / change on the page, or drained by the telling?
- **Vividness** — abstraction over concreteness, missing senses, emotion explained instead of shown?
- **Dialogue** — does it have purpose, subtext, and per-character difference, or is everyone on-the-nose in one voice?
- **Interiority** — repetitive explaining / over-introspection, or a missing key beat of interior life?
- **Rhythm** — sentence and paragraph rhythm; action / pause / information release matching the scene's intensity.
- **Repetition and redundancy** — repeated emotion, information, or gesture; filler and empty intensifiers.
- **Mannered prose** — the profundity-by-antithesis tic, narratorial meaning-asides, padded set-pieces — use the shared `restraint` skill as the checklist; don't restate it.

## Stop

- **Do not reopen structure / plot / theme.** If you spot a structural problem, log it as a single flagged note to the author, not an actionable revision — it is out of this stage.
- **Sample rewrites only, and few** — demonstrate a method on a line or two; never rewrite the passage or edit the file. The author keeps final say over expression.
- The nearer the draft is to final, the more you restrict yourself to local, verifiable changes.
- Grammar / spelling / punctuation / format are not yours — that is the app's proofread system.
