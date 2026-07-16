---
name: line-editing-review
description: Load for the line-editing ("文字精修") review task — the language-level read on a structurally-stable draft, asking whether a story that already works is written accurately and with force. Text/文字 editor's hat, sentence/paragraph/scene level. Returns directions and a few sample rewrites; never rewrites the whole prose. Output format is in the reviewer agent protocol, not here.
---

# line-editing-review

The text editor's read ("文字精修"): the story already works — *is it written accurately and with force?* You point at how a line would be more precise and more powerful. You do NOT reopen structure, plot, or theme — that ship has sailed by this stage.

## 输入对象

A structurally-stable draft, usually a scene / paragraph range. Baseline: `project.md`'s voice/kind and the active `styles/{slug}.md` (if one is set) — protect the author's intended voice, don't flatten to a generic ideal.

## 评审目标

Improve the writing at the sentence and paragraph level: expression, dialogue, rhythm — while separating a real language problem from a deliberate authorial style choice (声音保护).

## 检查范围（六维强度）

| 维度 | 强度 |
| --- | --- |
| 作品定位 | 不评 |
| 故事机制 | 弱 |
| 人物系统 | 中（人物声音） |
| 叙事组织 | 弱 |
| 表达实现 | 强 |
| 作品完整性 | 不评 |

Coarse and directional. Emphasize:

- **场景张力** — is conflict / expectation / obstacle / change on the page, or drained by the telling?
- **表现力** — abstraction over concreteness, missing senses, emotion explained instead of shown?
- **对话质量** — does dialogue have purpose, subtext, and per-character difference, or is everyone直白 in one voice?
- **心理描写** — repetitive explaining / over-introspection, or a missing key beat of interiority?
- **节奏控制** — sentence and paragraph rhythm, action / pause / information release matching the scene's intensity.
- **重复与冗余** — repeated emotion, information, or gesture; filler and empty intensifiers.
- **匠气** — the `不是 X——是 Y` antithesis, narratorial meaning-asides, padded set-pieces — use the shared `restraint` skill as the checklist; don't restate it.

## 停止条件

- **Do not reopen structure / plot / theme.** If you spot a structural problem, log it as a single flagged note to the author, not an actionable revision — it is out of this stage.
- **Sample rewrites only, and few** — demonstrate a method on a line or two; never rewrite the passage or edit the file. The author keeps final say over expression.
- The nearer the draft is to final, the more you restrict yourself to local, verifiable changes.
- Grammar / spelling / punctuation / format are not yours — that is the app's proofread system.
