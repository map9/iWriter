---
name: writing-style
description: "Router and protocol for named-author writing-style skills. Use when the author asks to write, rewrite, test, extract, create, list, refine, or delete a style based on a named author, work, source URL, or provided text/file."
---

# Writing Style

This skill manages named-author writing-style skills. It is not for arbitrary user-defined prose preferences; those belong in the story's own style constraints or conversation context.

Author style skills live as sub-skills under this directory:

```txt
/skills/writing-style/<author-slug>/SKILL.md
```

Examples:
- `/skills/writing-style/lu-xun/SKILL.md`
- `/skills/writing-style/zhang-ai-ling/SKILL.md`

## When to Use

Use this skill when the author:
- Names a writer and asks to write, rewrite, revise, or test prose in that writer's style.
- Asks to extract a style from an author, a work title, a source URL, or provided text/file.
- Asks which named-author styles are saved.
- Gives feedback that an existing named-author style does not sound right.
- Explicitly asks to remove a named-author style.

Do not create a skill for a custom style invented by the user. Keep custom style requirements in the current story/project context.

## Existing Style Flow

1. Check the Available Skills list for an author style loaded from `/skills/writing-style/`.
2. If a matching author style exists, read its `SKILL.md` with `read_file(file_path="<path>", limit=1000)`.
3. Follow that skill's Generation Guidance and Self-check sections before writing.
4. If the author is only testing the style, produce a short sample and ask whether the style feels right.

## New Style Flow

When no matching named-author style exists:

1. Call `task` with `subagent_type="Researcher"` to gather source material.
   - Acceptable inputs include author name, work title, source URL, or provided files/text.
   - Ask Researcher for source-grounded findings and short permissible excerpts only.
   - Researcher must not create or update skills.

2. Call `task` with `subagent_type="WritingStyleExtractor"`.
   - Give it the user's request plus the Researcher findings and any provided text/file paths.
   - It must return a structured style extraction using the Extraction Protocol below.
   - It must not create files.

3. Call `task` with `subagent_type="WritingStyleSkillCreator"`.
   - Give it the WritingStyleExtractor result.
   - It must read this `writing-style` skill and the `skill-creator` skill.
   - It must create a valid deepagents skill by calling `save_writing_style_skill`.

4. After the skill is created, generate a short test sample using the new style and ask whether it feels right.

## Extraction Protocol

WritingStyleExtractor should extract only source-grounded patterns. It should explicitly mark uncertain observations.

Required sections:

- **Identity and scope**: author/work/source basis, language, period, and what the style applies to.
- **Lexicon**: diction, register, repeated word classes, archaic/colloquial/literary tendencies, and words to avoid.
- **Syntax**: sentence length, clause structure, connectors, negation, repetition, inversion, punctuation habits.
- **Rhythm**: paragraph movement, acceleration/deceleration, contrast between short and long sentences.
- **Imagery and motifs**: recurring images, sensory channels, symbolic objects, spatial/temporal atmosphere.
- **Narrator stance**: distance, irony, direct judgment, self-awareness, intimacy, viewpoint habits.
- **Rhetorical moves**: irony, contrast, metaphor, sudden deflation, aphorism, repetition, argument shape.
- **Emotional temperature**: restraint, heat, grief, humor, bitterness, tenderness, or detachment.
- **Generation guidance**: concrete instructions for writing in the style.
- **Avoid list**: ways imitation becomes fake, excessive, modernized, or generic.
- **Self-check**: 5-8 checks the agent should run before delivering prose.

## Skill File Shape

WritingStyleSkillCreator should create a compact `SKILL.md` with:

```yaml
---
name: <author-slug>
description: "Named-author writing style for <author>. Use when the author requests prose in <author>'s style."
---
```

Body sections:

- `# <Author> Writing Style`
- `## Source Basis`
- `## Style Markers`
- `## Generation Guidance`
- `## Avoid`
- `## Self-check`
- `## Short Source Excerpts`
- `## Refinement Notes`

The YAML description must be a single safe string. Do not put Markdown lists, headings, or long extraction notes into frontmatter.

## Maintenance

- List saved styles with `list_writing_styles`.
- Read a saved style with `get_writing_style(slug)`.
- Save a newly created style with `save_writing_style_skill(slug, content, overwrite?)`.
- Refine an existing style with `update_writing_style(slug, {appendNote: "..."})` for small feedback, or use WritingStyleSkillCreator for larger rewrites.
- Delete a style only when the author explicitly asks, using `delete_writing_style(slug)`.

## Constraints

- Do not fabricate style assertions without sources or provided text.
- Keep direct source excerpts short and legally conservative.
- Prefer operational writing instructions over literary commentary.
- A style skill should help the agent write; it is not an essay about the author.
