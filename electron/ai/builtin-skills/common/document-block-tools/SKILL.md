---
name: document-block-tools
description: How to read and edit documents with the block tools (get_document_outline/get_section/get_blocks, edit_block/insert_block/delete_block/replace_range/create_document). Read before reading or editing any document via block IDs.
---

# Document block tools

These tools let you read and edit any document (open tab or disk file) by stable
block IDs shown as `{b:n}`. This skill is the single source of truth for how the
block model, pagination, list editing, batching, and ID lifecycle work — the tool
descriptions stay short and point here.

## Two-level block model

Blocks come in two levels:

- **Leaf blocks** — paragraph, heading, list item, image, code block, math, etc. Each is one `{b:n}`.
- **Container blocks** — a whole list (bullet / ordered / task). A container has its own `{b:n}` and wraps its item leaves.

A block is **atomic**: reads never split a block's markdown across pages, and a
container (list/quote/code/table) is never cut in the middle. A single block larger
than the page budget occupies its own page.

## Reading

1. `get_document_outline(file_path=...)` — the heading tree with block IDs, block counts, word counts. Start here.
2. `get_section(heading_block_id, file_path=..., offset?, limit?)` — the blocks under a heading.
   - Pagination is by **content budget**, block-atomic. `limit` is the character budget per page (default 4000); `offset` is a **block offset** within the section.
   - When `has_more` is true, call again with `offset = next_offset` to get the next page.
   - **`containers` sidecar**: if the section contains lists, the result includes `containers: [{ block_id, type, item_block_ids, markdown }]`. `markdown` is the full current list — you do NOT need to read the list again to edit it.
3. `get_blocks(block_ids, file_path=...)` — exact current markdown of specific blocks. A list item shows its `container_block_id`; a container block returns the whole list markdown (`is_container: true`).

Always read the current content before editing, and pass the `expected_*` fields
(copied from what you read) so an edit fails safely if the block changed underneath you.

**`{b:n}` is a display-only marker, never content.** `get_blocks` / `get_section` prefix each block with its `{b:n}` ID so you can address it — the marker is NOT part of the block's markdown. When you copy content into an `expected_*` field, and above all when you write `new_content` (or `create_document` content), **strip the leading `{b:n}` marker**. Written documents must contain zero `{b:n}` tokens — leaking the marker into prose is a bug.

## Editing lists — decision tree

- **Change one item's text** → `edit_block` on that **item** block_id, with the new item text.
- **Structural change** (add / remove / reorder / nest items) → `edit_block` on the **container** block_id (from the `containers` sidecar or `container_block_id`), passing the **complete new list markdown** as `new_content`. The whole list is replaced atomically — this is robust where item-by-item edits are not.
- **Task lists**: keep the `- [ ]` / `- [x]` syntax in your markdown so the task list (and each item's checked state) is preserved.

## Batching multiple edits (ID lifecycle)

Block IDs are valid for **one snapshot** — i.e. one read. Within a single turn you
may issue **several** edits to the same file from one read:

- Call `edit_block` / `insert_block` / `delete_block` / `replace_range` **multiple times in one turn**, all using block IDs from the same read.
- They are reviewed and applied **together as one batch, in the correct order** (the engine applies them in reverse document position, so an earlier edit never shifts the IDs of a later one). **Do not re-read between edits of the same batch.**
- Only **after** a batch is applied has the document changed and the IDs shifted — re-read (`get_document_outline` / `get_section`) before the **next** round of edits.

If an edit fails a freshness check (its `expected_*` content no longer matches, e.g.
the author edited concurrently), re-read that region and reissue.

## Creating documents

`create_document(filename, content, directory?, open_in_editor?)` — create a new file. Requires approval.

- `filename` is a **basename only** — no path separators. A separator (e.g. `sub/file.md`) is rejected. Put the subfolder in `directory`, never in `filename`.
- `directory` is the **absolute host path** of the containing folder. **With `directory` the file is written to disk**; **without it the file is NOT written to disk** — it becomes an unsaved in-memory tab. To create a real object on disk, always pass `directory`.
- `open_in_editor` (default `true`, only applies when `directory` is set): pass `false` to write to disk without opening a tab — use for scaffold/skeleton objects created in bulk.
- Example: `create_document(filename="worldbuilding.md", directory="/abs/workspace/worldbuilding", open_in_editor=false)`.

## Approval

Every edit requires the user's approval. Same-file edits are shown as one aggregated
diff card in document order; the user can approve the batch or override individual
items. You never manage apply order — that is the engine's job.
