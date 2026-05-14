---
name: arc-progression-check
description: Load during ConsistencyAgent post-write review when checking whether the current chapter advances each protagonist's arc relative to the previous chapter. Flags stagnation (2+ chapters without substantive arc movement) and unbacked leaps (sudden psychological shifts without setup).
---

# Arc Progression Check

Use this skill to verify that character arcs move credibly across chapters.

## What Counts As Movement

Arc movement is a pressure event changing the character's relationship to desire, fear, false belief, self-image, or another person.

Small movement counts if it is real:

- A false belief is challenged.
- A defense mechanism fails.
- A desire becomes more costly.
- A fear becomes harder to avoid.
- A relationship forces a new self-understanding.

## Problems To Flag

- Stagnation: two or more chapters with no substantive internal pressure or changed stance.
- Unbacked leap: a sudden psychological shift without setup.
- Repeated beat: the character relearns the same lesson in the same way.
- External-only plot: events happen to the character but do not affect the arc.

## Findings

- Use `layer: character`.
- Use `severity: minor` for stagnation or repeated beats.
- Use `severity: major` for unbacked leaps that break believability.

## Calibration

Do not demand dramatic transformation every chapter. A credible hesitation can be stronger than an instant breakthrough.
