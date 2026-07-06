---
name: project-bootstrap
description: Load when starting a new novel project, or when task-routing detects the workspace is missing project.md and the author accepts initialization. Also covers ongoing project.md field maintenance and version-advance recommendations.
---

# S11 project-bootstrap

A00 executes this directly. Initialization must be author-confirmed — never silent (FR-1.6).

## Bootstrap steps

1. **Trigger**: the author explicitly asks to start a novel project, or task-routing found no `project.md`, proposed init, and the author accepted.
2. **Collect `project.md` required fields** (load the `project-schema` reference): title, genre/tags, story premise, theme, reader-promise, scale-plan (decides whether the volume-outline layer is enabled), current version (initial `0.1（构思打底）`). Collect conversationally — do not dump a questionnaire.
   - **The premise's four elements (protagonist / goal / obstacle / stakes) must hold.** If any is missing, guide the author to supply it. If the author has only a vague notion, switch to S02 to converge first, then return here. Never invent the work's facts for the author.
3. **Version baseline**: if the workspace has no git repo, call `git_init` (goes through approval) — the host never creates a repo silently; if a repo exists, skip.
4. Write `project.md` via `create_document` (goes through approval).
5. **Lazily create the required object skeletons**: `worldbuilding/worldbuilding.md`, `characters/characters.md`, `outline/master-outline.md`, each as a field-title skeleton per its schema (load `worldbuilding-schema` / `character-schema` / `outline-schema`), with the outline marked `status: 草稿中`. Do not pre-create any optional object (lazy-creation principle). Content is filled later by the ideation/authoring flows.
   - Create these skeleton objects with `create_document(open_in_editor=false)` — they are written to disk but not opened as tabs, so the editor is not cluttered with empty scaffolds. (`project.md` may open normally.)
6. Suggest an initial `git_commit` to fix the init baseline (the author may decline).
7. **Ongoing maintenance**: `project.md` field edits and version-advance recommendations belong here too — read the relevant deliverables, state the basis and gaps, propose advance/hold, and on confirmation `edit_block` the change. No separate flow.

## Red lines

Initialization must be author-confirmed, never silent (FR-1.6). Do not write `project.md` if the premise's four elements do not hold. Do not invent work facts. The version field never auto-advances.
