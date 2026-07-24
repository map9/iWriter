---
name: style-transfer
description: Load when distilling a target prose voice from an author-provided exemplar into a reusable styles/{slug}.md — "write in this voice", "capture the feel of this passage/author". A00 executes this by delegating to a general-purpose subagent (the exemplar is a large block of text, best isolated from the main context). Read style-template before writing the object.
---

# style-transfer

Distilling a target voice from an exemplar into `styles/{slug}.md`. Because the exemplar is a large block of text, A00 does not run this inline — it **delegates to a general-purpose subagent** to isolate that text from the main context; the subagent produces the style object under approval.

## Steps

1. **Read the author-provided exemplar** — one to a few paragraphs of the target voice (this large text is exactly why the work is delegated, not run in the main context).
2. **Distill the fields per `style-template`** (SS05) from the exemplar: voice / diction (including banned words) / syntax / imagery.
3. **Produce the operational generation-recipe and self-check list** — do-this steps a writer can follow and a reviewer can check, not literary commentary.
4. **Write `styles/{slug}.md`** (under approval), with the exemplar as the object's primary anchor and `scope` set (whole-book default, or a specific character's dialogue).

The writer then takes the exemplar as its PRIMARY voice target — write *to* that voice, never copy the exemplar's content (the exemplar outranks the analysis fields).

## Red lines

- Distill **only from the exemplar itself** — never invent traits the exemplar does not show.
- Write to `styles/` and nowhere else.
- The exemplar is author-owned and is the anchor; the analysis fields describe it, not the reverse — on conflict the exemplar wins.
