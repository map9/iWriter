---
name: foreshadowing-audit
description: Load during ConsistencyAgent post-write review to verify that plants from earlier chapters have appropriate echoes or deliberate non-acknowledgment in the current chapter, and that characters have not gained information that was supposed to remain hidden.
---

# Foreshadowing Audit

Use this skill to find forgotten plants, premature reveals, and accidental knowledge leaks.

## Audit Sources

Check StoryBible `## Story State`, `## Open Questions`, prior chapter summaries, and the current chapter.

## Questions

- Does a previously planted object, gesture, line, or absence need an echo here?
- Is a promised payoff being delayed intentionally, or has it been forgotten?
- Does any character know or infer information that should still be hidden?
- Does the narration reveal a mystery the author appears to be preserving?

## Findings

Report only actionable issues.

- Use `layer: continuity`.
- Use `severity: major` for premature reveals or broken mystery logic.
- Use `severity: minor` for missing echoes or weak setup-payoff continuity.
- Point `locationRef` to the relevant chapter, scene, or paragraph.

## Do Not

Do not invent new foreshadowing requirements. Audit what exists or what the current chapter clearly implies.
