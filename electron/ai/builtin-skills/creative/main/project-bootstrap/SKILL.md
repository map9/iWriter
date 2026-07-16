---
name: project-bootstrap
description: Load when starting a new novel project, or when the main agent's routing detects the workspace is missing project.md and the author accepts initialization. Also covers ongoing project.md field maintenance and version-advance recommendations.
---

# project-bootstrap

The main agent executes this directly. Initialization must be author-confirmed — never silent.

## Bootstrap steps

1. **Trigger**: the author explicitly asks to start a novel project, or the main agent's routing found no `project.md`, proposed init, and the author accepted.
2. **Collect `project.md` required fields** (load the `project-schema` reference): title, genre/tags, story premise, theme, reader-promise, scale-plan (decides whether the volume-outline layer is enabled), current version (initial `0.1（构思打底）` = the initial ideation baseline). Collect conversationally — do not dump a questionnaire.
   - **The premise's four elements (protagonist / goal / obstacle / stakes) must hold.** If any is missing, guide the author to supply it. If the author has only a vague notion, switch to ideation to converge first, then return here. Never invent the work's facts for the author.
3. **Version baseline (a step you must not skip)**: BEFORE writing `project.md`, if the workspace has no git repo (no `.git`), you **must** call `git_init` (goes through approval) to establish the version baseline — the author decides on the approval card whether to accept or decline; you do not skip this proposal on the author's behalf. If a repo already exists, skip. The host never creates a repo silently.
4. Write `project.md` via `create_document` (goes through approval). It lives at the workspace root, so call `create_document(filename="project.md", directory="<workspace-abs>", content=…)` — `directory` is the absolute host path of the workspace root.
5. **Lazily create the required object skeletons**: `worldbuilding/worldbuilding.md`, `characters/characters.md`, `outline/master-outline.md`, each as a field-title skeleton per its schema (load `worldbuilding-schema` / `character-schema` / `outline-schema`), with the outline marked `status: 草稿中` (draft). Do not pre-create any optional object (lazy-creation principle). Content is filled later by the ideation/authoring flows.
   - **`create_document` call form (required for disk writes)**: `filename` is a **basename only** (no path separators — a separator is rejected), and `directory` is the **absolute host path** of the containing folder; pass `open_in_editor=false`. The object's subfolder goes in `directory`, never in `filename`. Concretely:
     - `create_document(filename="worldbuilding.md", directory="<workspace-abs>/worldbuilding", open_in_editor=false)`
     - `create_document(filename="characters.md", directory="<workspace-abs>/characters", open_in_editor=false)`
     - `create_document(filename="master-outline.md", directory="<workspace-abs>/outline", open_in_editor=false)`
   - `open_in_editor=false` writes to disk without opening a tab (avoids cluttering the editor with empty scaffolds). If you omit `directory`, the file is NOT written to disk — it becomes an unsaved in-memory tab; and if `filename` contains a separator, creation is rejected. Always pass `directory` for these skeletons. (`project.md` may open normally.)
6. Suggest an initial `git_commit` to fix the init baseline (the author may decline).
7. **Ongoing maintenance**: `project.md` field edits and version-advance recommendations belong here too — read the relevant deliverables, state the basis and gaps, propose advance/hold, and on confirmation `edit_block` the change. No separate flow.

## Red lines

Initialization must be author-confirmed, never silent. Do not write `project.md` if the premise's four elements do not hold. Do not invent work facts. The version field never auto-advances. Do not skip the `git_init` proposal (step 3) when there is no `.git` — offer it and let the author decide.
