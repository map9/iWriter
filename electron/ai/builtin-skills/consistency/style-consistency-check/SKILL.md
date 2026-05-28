---
name: style-consistency-check
description: Check generated prose against the activated author writing-style skill's dimensions. Use after prose generation to verify style fidelity before presenting to the author.
---

# Style Consistency Check

Use this skill when reviewing a draft for alignment with the active author writing-style.

## Prerequisites

- An active writing-style skill must exist. Call `get_writing_style(slug)` to load its Generation Recipe, Self-check, and Avoid sections.
- If no writing style is active, skip this check.

## Review Protocol

For each dimension defined in the active style's Generation Recipe, verify the draft:

1. **Lexical register**: Does word choice match the style's vocabulary constraints (e.g., classical–vernacular blend, concrete nouns over abstractions)?
2. **Sentence rhythm**: Do sentence lengths and structures match the style's rhythm pattern?
3. **Emotional weight**: Is tension carried through understatement, physical detail, or irony as the style requires—rather than explicit emotional labeling?
4. **Structural beats**: Does scene structure follow the style's preferred beat pattern (e.g., anti-climactic deflation, circular return, abrupt cut)?
5. **Voice markers**: Are the style's characteristic linguistic markers present (e.g., rhetorical questions, repetition-variation, specific particle usage)?

## Self-check Application

Run each item from the active style's Self-check section against the draft. Flag any item that fails.

## Output Format

Report findings as a flat list:
- `style_dimension`: which dimension
- `severity`: `pass` | `minor` | `major`
- `evidence`: one quoted phrase from the draft
- `correction`: specific rewrite suggestion using the style's own vocabulary and rhythm

If all dimensions pass, state: "Style fidelity confirmed against [style name]."
