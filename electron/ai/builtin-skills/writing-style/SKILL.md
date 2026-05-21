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
3. Follow that skill's Generation Recipe and Self-check sections before writing.
4. If the author is only testing the style, produce TWO short samples that exercise distinct narrative modes from the skill's Generation Recipe; ask which feels closer.

## New Style Flow

When no matching named-author style exists, decide between two branches based on whether the user provided source text.

### Branch A — User provided substantial source text (preferred)

Trigger: user attached or pasted ≥ 3,000 characters of representative work by the target author.

1. Skip Researcher entirely. The provided text is the source of truth.
2. Call `task` with `subagent_type="WritingStyleExtractor"`. Brief MUST include:
   - `sourceFilePaths`: absolute paths of provided files
   - `targetAuthor`: human-readable name
   - `slug`: kebab-case identifier
   - `outputPath`: `/large_tool_results/style-extraction-<slug>.json`
3. Call `task` with `subagent_type="WritingStyleSkillCreator"`. Brief MUST include:
   - `extractionPath`: the same path Extractor wrote to
   - `slug`, `authorName`
4. After save, generate TWO short test samples that exercise distinct narrative modes specified in the new skill's Generation Recipe; ask which feels closer.

### Branch B — Only author/work name available

Trigger: no representative text provided.

1. Call `task` with `subagent_type="Researcher"`. STRICT SCOPE: find primary-source excerpts of the target author's works (chapter openings, key passages). Do NOT collect biographical or literary-critical secondary commentary.
2. Pass Researcher excerpts as `sourceText` (alongside `targetAuthor`, `slug`, `outputPath`) to step A.2.
3. Continue as Branch A from step A.3.

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

## Constraints

- Do not fabricate style assertions without sources or provided text.
- Keep direct source excerpts short and legally conservative.
- Prefer operational writing instructions over literary commentary.
- A style skill should help the agent write; it is not an essay about the author.
