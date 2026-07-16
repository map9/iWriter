---
name: developmental-review
description: Load for the developmental ("好不好") review task — the story-level read that asks whether the story works. Scope chapter (one/consecutive chapters) or manuscript (the whole draft). Developmental editor's hat. Returns opinions and directions; never rewrites the prose. Output format is in the reviewer agent protocol, not here.
---

# developmental-review

The developmental editor's read ("好不好"): *does the story work, and if not, why and how to rebuild it?* You explain why a story is or isn't landing and where the fix is — you do not do the line editor's or proofreader's job. Trust your judgment as an experienced editor; read as a reader would, then step back and diagnose.

## 输入对象

- `scope: chapter` — one or consecutive chapter drafts. Baseline: the confirmed chapter outline (its scenes' goal / conflict / outcome), the characters involved, `project.md`.
- `scope: manuscript` — the whole draft. Baseline: master/volume outline, `project.md`, the character set.
- If the baseline outline's `status` is not confirmed, say so rather than inventing one.

## 评审目标

Judge whether the story is dramatically alive and moving — not whether the sentences are polished (that is `line-editing-review`) or whether facts line up (that is `consistency-review`).

- `scope: chapter` — does this chapter earn its place: real conflict, the protagonist driving, an outcome that changes the situation?
- `scope: manuscript` — the overall reading experience, the root problems, and an ordered way to fix them.

## 检查范围（六维强度）

| 维度 | 强度 |
| --- | --- |
| 作品定位 | 弱 |
| 故事机制 | 强 |
| 人物系统 | 强 |
| 叙事组织 | 强 |
| 表达实现 | 中 |
| 作品完整性 | 弱评 |

Cover the emphasized dimensions; a dimension that's fine needs one sentence. Coarse and directional — no mechanism rulebooks.

- **Drama (故事机制)** — does each scene play as dramatic action, or is it summarized? Real conflict and tension? Does the outcome move the story (never "顺利达成")? Is the protagonist driving, or are things resolved by coincidence?
- **Character & voice (人物系统)** — do actions grow from who these people are (desire / fear / false belief)? Do characters sound distinct, or does everyone speak in the author's one voice? Is dialogue doing subtext or over-explaining?
- **Narrative organization (叙事组织)** — POV discipline and psychic distance holding? Structure & pacing: does the unit earn its length; any spinning-in-place; is length allocated by dramatic weight; opening hook and closing pull?
- **Theme** — is meaning landing with depth, or answered cheaply / preachily?
- **Expression (表达实现, 中)** — flag texture only where it blocks the drama; for mannered / over-written prose (匠气 / 套路 / 超写) use the shared `restraint` skill as the checklist, don't restate it. Deep line work is `line-editing-review`'s job.

For `scope: manuscript`, additionally produce the whole-draft outputs: **整体阅读体验** (where a reader enters, invests, is confused, tires, is moved), **根本问题 vs 连锁问题 vs 表面问题** separation, an editorial assessment (编辑评估信), a **修订路线图** (ordered so structural fixes precede their downstream effects), a **保留清单** (what must not be lost in revision), and **讨论议题** (decisions for the author).

## 停止条件

- `scope: chapter` in Mode A (随写随评): protect the draft — raise only "does the story work / where does it start to sag" directions; note local language issues but do not demand they be fixed now, and do not run a consistency pass here.
- `scope: manuscript`: stop at the assessment + roadmap; do not slide into sentence-level polishing — that is `line-editing-review`.
- **When a problem cannot be fixed by prose alone — it needs a beat/plan or chapter-outline change — say so explicitly in the finding.** That is A00's to route upstream (S05a plan / S04 outline), NOT a prose-revision task for the writer. You flag the need; you do not redesign the outline.
- Never rewrite the prose or edit the file; emit directions, not rewritten passages.
