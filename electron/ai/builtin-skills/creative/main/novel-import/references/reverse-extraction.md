# reverse-extraction

Reconstructing the upstream objects — settings, characters, outline — *from* imported prose, so the project has the scaffolding it would normally have been authored from. This is read-heavy across the whole manuscript, so it is **batched and delegated**, never done in one pass in the main context.

## Batching

- Split the manuscript into batches of roughly **5–8 chapters** (or ~50k characters — see the large-work batching convention). Delegate one **general-purpose** subagent per batch (it inherits the reference/craft skills; the dedicated writer/reviewer subagents are the wrong tool here).
- Each batch brief carries the absolute chapter paths for that batch + what to extract (characters and their traits/relationships as they appear; world rules and forbidden zones; the events/arc of these chapters as outline nodes) + **where to write evidence**: a `/large_tool_results/import-batch-{n}.md` file. The batch subagent **reads prose and writes only its evidence file** — it never writes into `worldbuilding/`, `characters/`, or `outline/`.
- Batches are independent and can run without carrying each other's full context; a short "characters/threads seen so far" note forward-passed between batches keeps naming consistent, but the evidence files are the durable output.

## Where each layer's output goes (the hard rule)

The three layers land in different places — because only the outline object carries a `status` field, so only it can hold a "draft" (半正式) state; the character/setting objects have no status, so a reconstruction must NOT be written into them as if confirmed.

- **Structure layer → `outline/`** (per `outline-template`), marked `status: draft`. The batch subagent may write these directly; on aggregation A00 reconstructs the master-outline structure nodes + foreshadow table into `outline/` (draft).
- **Character layer & Setting layer → `exploration/`** — as **candidates only**, never into `characters/` or `worldbuilding/`. They are the model's *reading* of the prose, not facts the author confirmed; writing them into the formal objects would fabricate a confirmed state. A00 merges/dedups the character and setting candidates across batches into `exploration/` for the author to review and, if they choose, promote later.

## Aggregation (main agent)

Read the batch evidence files (`/large_tool_results/s10-batch-{n}.md`) and the draft outline, then — under approval — reconstruct the master-outline structure nodes + foreshadow table into `outline/` (draft), and merge/dedup the character and setting candidates into `exploration/`. Do NOT re-read the whole manuscript prose.

## The standing rule

The **prose is the source of truth**; every extracted object is a proposal distilled from it. On conflict the prose wins and the author decides what the object should record. A field with no evidence in the prose is left blank and flagged as a gap — never fabricated. Candidates never enter a formal (confirmed) object before the author confirms.
