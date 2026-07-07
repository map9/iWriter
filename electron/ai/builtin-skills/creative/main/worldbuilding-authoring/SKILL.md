---
name: worldbuilding-authoring
description: Load when writing or editing worldbuilding or character objects (worldbuilding/*.md, characters/*.md) whose content has already converged from a candidate. A00 executes this directly.
---

# S03 worldbuilding-authoring

A00 executes this directly. The job is to turn a **converged** setting or character decision into a well-formed object file, and to flag its impact when it touches confirmed material.

## Problem it solves

A setting written as a flat list of "what exists" gives the writer nothing to derive behavior from. This skill produces settings whose constraints are *load-bearing* — a forbidden zone that states *why* it exists, a character whose psychology triangle drives action — so later prose and outline work can lean on them.

## Procedure

1. **Confirm convergence.** The content must be a decision, not a candidate still being weighed. If it is still open ("要不要试试…", multiple live directions), stop and route back to ideation (S02) — do not promote a candidate into a formal object.
2. **Check field completeness.** Load the `worldbuilding-schema` reference (and `character-schema` when writing a character). Every required field must be present; a **forbidden zone / hard rule must state its reason** — *why* the world works this way — not merely list what characters cannot do.
3. **Bring in the relevant craft.** When the object involves a character, load `character-believability` (build the psychology triangle as a derivation basis, not an afterthought). When it touches the work's theme, load `thematic-coherence`.
4. **Fragment check (FR-1.5).** If `materials/fragments.md` exists and is non-empty, read its "未采用" (not-yet-adopted) entries. For any entry whose `related-refs` or content hits the object you are writing, attach a "要不要把这条碎片并入" proposal to your edit. No hit → do not bring it up at all (don't disturb).
5. **Write.** Use `create_document` for a new object or `edit_block` for an existing one, writing to `worldbuilding/*.md` or `characters/*.md`. Follow the schema's `create_document` call form (basename `filename` + absolute `directory`).
6. **Show impact on high-risk changes.** If the change touches an already-confirmed core rule or a character's established psychology triangle, surface the affected surface (which characters / outline scenes / prose depend on it) so the author decides with the consequences visible — do not silently overwrite confirmed material.

## How to verify it worked

- Every required schema field is filled; each forbidden zone / hard rule carries a *reason*, not just a prohibition.
- A character object's desire / fear / false-belief are concrete enough that a specific behavior can be *derived* from them (see `character-believability`), not generic ("内心充满矛盾").
- Confirmed-material changes were presented with their impact surface, not applied silently.

## Red lines

Forbidden zones state *why*, never only *what is not allowed*. Character independent-filing follows the defined threshold (see `character-schema`). Candidate content must not enter formal-object paths before it has converged.
