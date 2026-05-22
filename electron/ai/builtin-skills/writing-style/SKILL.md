---
name: writing-style
description: "Router and protocol for named-author writing-style skills. Use when the author asks to write, rewrite, test, extract, create, list, refine, or delete a style based on a named author, work, source URL, or provided text/file."
---

# Writing Style

This skill manages named-author writing-style skills. It is not for arbitrary user-defined prose preferences; those belong in the story's own style constraints or conversation context.

Author style skills are managed by the app's writing-style tools. Do not browse skill directories with `ls`, `glob`, or `grep` to discover them.

## When to Use

Use this skill when the author:
- Names a writer and asks to write, rewrite, revise, or test prose in that writer's style.
- Asks to extract a style from an author, a work title, a source URL, or provided text/file.
- Asks which named-author styles are saved.
- Gives feedback that an existing named-author style does not sound right.
- Explicitly asks to remove a named-author style.

Do not create a skill for a custom style invented by the user. Keep custom style requirements in the current story/project context.

## Existing Style Flow

1. Call `list_writing_styles` to discover saved author style slugs.
2. If a matching author style exists AND the author is not explicitly asking to re-extract or update from source text, call `get_writing_style(slug)`.
3. Follow that style's Generation Recipe, Self-check, and Avoid sections before writing.
4. If the author is only testing the style, produce TWO short samples that exercise distinct narrative modes from the skill's Generation Recipe; ask which feels closer.

If the author explicitly asks to re-extract, rebuild, or update the style from source text (e.g. "基于原文重新提取", "re-extract", "update from this file"), go directly to the New Style Flow Branch A below, even though a style already exists.

## New Style Flow

When no matching named-author style exists, decide between two branches based on whether the user provided source text.

### Branch A — User provided substantial source text (preferred)

Trigger: user attached or pasted ≥ 3,000 characters of representative work by the target author.

1. Skip Researcher entirely. The provided text is the source of truth.
2. Write a brief file. Call `write_file` with:
   - path: `/large_tool_results/extractor-brief-<author-slug>.json`
   - content: a JSON object with `targetAuthor` and `sourceFilePaths` (array of absolute paths) or `sourceText` (inline text if no files):
     ```json
     { "targetAuthor": "<authorName>", "sourceFilePaths": ["<absolute path>"] }
     ```
   Do NOT put `slug` or `outputPath` in this file — WritingStyleExtractor derives them internally.
3. Call `task` with `subagent_type="WritingStyleExtractor"` and a description containing only:
   `briefFile: "<the path you wrote in step 2>"`
4. Call `task` with `subagent_type="WritingStyleSkillCreator"` and a description containing only:
   `extractionPath: "<the path field from the Extractor reply>"`
5. After save, generate TWO short test samples that exercise distinct narrative modes specified in the new skill's Generation Recipe; ask which feels closer.

Do not ask either subagent to read this skill, `skill-creator`, `/skills`, `~/.iwriter`, or any writing-style directory. Their prompts are self-contained.

### Branch B — Only author/work name available

Trigger: no representative text provided.

1. Call `task` with `subagent_type="Researcher"`. Description:
   `question: "Find representative primary-source excerpts (chapter openings, key passages) by <authorName>." scope: "Primary-source text only. No biographical or critical secondary commentary."`
2. Write a brief file. Call `write_file` with:
   - path: `/large_tool_results/extractor-brief-<author-slug>.json`
   - content: `{ "targetAuthor": "<authorName>", "sourceText": "<excerpts returned by Researcher>" }`
3. Continue as Branch A from step A.3 (call WritingStyleExtractor with `briefFile`, then WritingStyleSkillCreator with `extractionPath`).

## Extraction Protocol

WritingStyleExtractor extracts source-grounded patterns and writes a compact JSON to `outputPath`. Field set is intentionally small — every field must help an LLM mimic the style, not describe the author academically.

**Core fields** (compressed prose, ≤150 words each):
- **voice** — narrator stance, distance, irony, emotional temperature.
- **diction** — lexicon preferences, register, prohibited words.
- **syntax** — sentence-length pattern, signature constructions, punctuation habits, rhetorical moves.
- **imagery** — recurring images, sensory channels, symbols.

**Operational fields**:
- **generationRecipe** — ordered array of writing steps the agent will execute.
- **selfCheck** — 5–8 post-write checks.
- **avoid** — pitfalls to dodge.

**Provenance fields**:
- **sourceBasis** — file paths or quoted sources.
- **shortExcerpts** — ≤30-word quotes for the skill body.
- **uncertainties** — points the Extractor is unsure about.

Use only source-grounded patterns. The "identity / scope / period" metadata used in older protocols is dropped from the body — it lives in the frontmatter description.

## Skill File Shape

SKILL.md sections (in order):

- `# <Author> Writing Style`
- `## Voice` (≤120 words)
- `## Diction` (≤120 words)
- `## Syntax` (≤150 words)
- `## Imagery` (≤120 words)
- `## Generation Recipe` (numbered steps)
- `## Self-check` (bulleted)
- `## Avoid` (bulleted)
- `## Short Source Excerpts` (≤30-word quotes)

Frontmatter:

```yaml
---
name: <author-slug>
description: "Named-author writing style for <Author>. Use when the author requests prose in <Author>'s style."
---
```

The YAML description must be a single safe quoted string. Do not put Markdown lists, headings, or extraction notes into frontmatter.

## Maintenance

- List saved styles with `list_writing_styles`.
- Read a saved style with `get_writing_style(slug)`.
- Save a newly created style with `save_writing_style_skill(slug, content, overwrite?)`.
- Refine an existing style with `update_writing_style(slug, {appendNote: "..."})` for small feedback, or use WritingStyleSkillCreator for larger rewrites.
- Delete a style only when the author explicitly asks, using `delete_writing_style(slug)`.
- Do not discover or maintain styles by directly listing or reading the writing-style storage directory.

## Constraints

- Do not fabricate style assertions without sources or provided text.
- Keep direct source excerpts short and legally conservative.
- Prefer operational writing instructions over literary commentary.
- A style skill should help the agent write; it is not an essay about the author.
