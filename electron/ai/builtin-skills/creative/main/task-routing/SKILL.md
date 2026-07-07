---
name: task-routing
description: The main agent's resident router. Load its full body as the FIRST action of every turn — before any other tool call or decision. It decides the scene category, the context-assembly strategy, and whether to execute directly, delegate to a专用 subagent, or delegate via general-purpose.
---

# S01 task-routing

This is a lightweight per-turn decision, not a heavy scan. Do not read the whole project or run git diff to decide a mode.

## Routing procedure

0. **Explicit instruction wins (FR-2.5)**: if the author names a mode/flow ("进构思模式", "直接写别猜", "继续写第三章"), adopt it and skip the signal weighing below. Only give a single minimal prompt when the explicit instruction hard-conflicts with project state (e.g. the named chapter's outline does not exist). Approval gates and safety red lines are never relaxed by an explicit instruction.
1. **Collaboration memory**: read/apply user-level rules in `~/.iwriter/ai/memory/creative/memory.md` — author maturity, intervention strength, risk preference. These shape working style, risk threshold, explanation depth, clarification frequency; they never supply story facts.
2. **Object-path prefix of the request**: `worldbuilding/`·`characters/`·`outline/` → leans ideation/authoring; `manuscript/` → leans writing; no clear object → keep reading signals.
3. If useful, read only `project.md`'s version field as a soft hint (0.x leans ideation, 1.x+ leans writing). Never globally scan or auto-diff to判断 mode.
4. **Wording (a leaning, not a keyword match)**: "要不要试试"·"有没有别的可能" → ideation; "写"·"续写"·"改成"·"按这个章纲" → writing; "写个开篇试试" is an ideation judgment even though the verb is "写".
5. **Risk check**: is the landing target a formal object or the candidate area? The higher the risk, the more you should clarify first. Memory risk-preference tunes explanation granularity and clarification threshold but never lowers the §5 approval red lines.
   - **Stage-gate readiness**: when the task moves the project to a next creative stage (settings→master outline, master→chapter outline, chapter→prose), check the upstream is ready first — load `story-development-flow` for the gates. If not ready, surface the gap and propose filling it; never cross a gate on your own. The author may cross explicitly, with one quality-risk note.
6. Signals conflict or all weak → one lightweight clarification ("这是想正式定下来，还是先探索一下？"). Do not default to the higher-risk branch.
7. **Decide the execution path** for the chosen scene category:
   - A00 executes directly: worldbuilding (S03), outline (S04), **writing-plan authoring (S05a)** — drafting the beat plan, confirming it via `confirm_writing_plan`, and the pre-write state machine — restructuring diagnosis (S07), novel-import orchestration (S10), project bootstrap & `project.md` maintenance (S11), lightweight recording (SS15).
   - Delegate to a专用 subagent: `explorer` (S02), `writer` (S05b — prose expansion of the approved beats, after S05a), `consistency-checker` (S06), `researcher` (S08).
   - Delegate via general-purpose: style transfer (S09); S10 distillation batches (SS17).
   - **A "write chapter N" request is S05a, not a direct delegation**: load `writing-plan-authoring` first — it decides whether the chapter outline is ready, whether to draft/confirm beats, or whether to hold (don't blindly rewrite existing prose).
8. **Four special signals**:
   - Workspace missing `project.md` → propose bootstrap (S11); **propose only, do not auto-run** (FR-1.6).
   - `manuscript/` non-empty but `worldbuilding.md`/`characters.md`/`master-outline.md` missing or thin → propose import/reverse-extraction (S10); propose only.
   - **"我写到哪了" progress recovery** → answer from点读, not a global scan: list `manuscript/` (last name in字母序 = current front), read that chapter's outline `status`, the host's open write-session registration, and `process/open-questions.md` pending items (if any). `.iwriter/status.md` may be read as a quick hint but must be reconciled with the点读. Offer to rebuild `status.md` (only after author confirms).
   - **"记一下"·"先记着" zero-friction capture** → recording category: append to `materials/fragments.md` per SS15 directly; do not open any flow, do not force classification.
9. If a writing delegation returns a "前提缺口" (outline unconfirmed, setting unstable), briefly switch back to ideation/authoring to fill the premise, get author confirmation, then resume the original writing task (FR-2.4). Never silently fill premises for the author.

## Candidate handling

Ideation output always goes to `exploration/`; it becomes a formal object only after the author explicitly selects it (a directory convention, no dedicated tool).

## Red lines

Never skip this step because a request "looks simple". Candidate content must not enter formal-object paths before author confirmation.
