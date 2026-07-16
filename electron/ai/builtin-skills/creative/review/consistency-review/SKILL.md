---
name: consistency-review
description: Load for the consistency ("对不对") review task — the proofreading editor's audit of correctness, consistency, and completeness. Two stages, two separate verdicts (fidelity, then hard consistency). Grammar/spelling/format are NOT covered — the app's proofread system owns those. Returns a graded issue list; never rewrites the prose. Output format is in the reviewer agent protocol, not here.
---

# consistency-review

The proofreading editor's audit ("对不对"): *is the text correct, consistent, and free of gaps and contradictions?* This is correctness, not taste — leave "好不好" to `developmental-review`. Two stages, each with its own verdict; never merge them.

## 输入对象

A near-final draft, or cross-chapter text. Baseline: the **confirmed** chapter outline (and any approved writing plan), `worldbuilding/` (esp. history-timeline), `characters/`, and previously narrated text. If the outline's `status` is not confirmed, say so rather than inventing a baseline. Check against the relevant objects and prior text **on demand** — do not build or maintain a persistent timeline/setting table.

## 评审目标

Two separate audits, two separate verdicts:

- **Stage 1 — 忠实度**: is the prose faithful to what was authorized to be written?
- **Stage 2 — 硬一致**: is the text internally and against-canon consistent, and are threads closed?

## 检查范围（六维强度）

| 维度 | 强度 |
| --- | --- |
| 作品完整性 | 强 |
| 其余维度 | 不评（交给其它 lens） |

**Stage 1 — 忠实度**

- Does each scene deliver the outline's **目标 → 冲突 → 结果** (no "顺利达成" where the outline demanded real conflict)?
- Do characters act from their **psychology triangle** (desire / fear / false belief) as set in the confirmed characters, not moved for plot convenience?
- Did the prose stay inside the declared scope — nothing invented or reordered beyond the plan?

**Stage 2 — 硬一致** (cover them; a dimension that's fine needs a sentence)

- **自然度 / 常识** — anything violating basic plausibility given the established setting.
- **时间连续性** — event order, elapsed time, ages, season / time-of-day self-consistent across chapters and not contradicting confirmed setting or previously narrated facts.
- **空间连续性** — geography, distance, movement routes, scene positions plausible and consistent.
- **人物连续性** — appearance, history, ability, relationships, knowledge range, habits consistent front to back.
- **设定连续性** — world rules, tech/power, item state, institutions not in conflict.
- **事实准确性** — history / law / medicine / profession / science / culture reliable (delegate genuine research questions upward; you flag, you don't research).
- **线索闭合** — planted hints get paid off; payoffs have a plant; note unresolved threads.
- **风格一致性** — if a `styles/{slug}.md` is active, does the prose hold that voice.

## 停止条件

- **Correctness only** — do not review "好不好" (that is `developmental-review`) and do not do line polishing.
- **Grammar / spelling / punctuation / format normalization are NOT yours.** The app's proofread system (LanguageTool) owns 文案校订; do not produce a proofreading pass.
- Keep the Stage-1 fidelity verdict and the Stage-2 consistency verdict as **two separate blocks**.
- A disagreement that is a creative decision (the author must choose, not a mistake to fix) goes to `open-questions`, not here — flag it, don't adjudicate.
- When the input is external reader feedback (试读意见), map it into the graded format against objects/chapters; do not adjudicate whether the feedback is right.
- Read only — never edit the prose.
