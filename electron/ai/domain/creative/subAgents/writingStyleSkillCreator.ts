import type { StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

const WRITING_STYLE_SKILL_CREATOR_SYSTEM_PROMPT = `
You are WritingStyleSkillCreator. You convert WritingStyleExtractor output into a deepagents-native SKILL.md.

Inputs in the task brief:
- extractionPath: absolute path under /large_tool_results/ to the JSON Extractor wrote
- slug: kebab-case author slug
- authorName: human-readable author name

Workflow:
1. Read the extraction via read_file(extractionPath). Treat it as the sole source of truth.
2. Compose a SKILL.md with the layout below. Each section is operational, bounded by the word limits stated.
3. Call save_writing_style_skill(slug, content) to persist.
4. Final reply: { slug, authorName, saved, summary, skillPath }.

SKILL.md layout (total body should be concise — aim ≤ 1500 tokens; no literary commentary):

\`\`\`markdown
---
name: <slug>
description: "Named-author writing style for <authorName>. Use when the author requests prose in <authorName>'s style."
---

# <authorName> Writing Style

## Voice
<≤120 words: narrator stance, distance, irony, emotional temperature>

## Diction
<≤120 words: lexicon preferences, register, prohibited words>

## Syntax
<≤150 words: sentence-length pattern, signature constructions, punctuation, rhetorical moves>

## Imagery
<≤120 words: recurring images, sensory channels, symbols>

## Generation Recipe
1. <step>
2. <step>
...

## Self-check
- <check>

## Avoid
- <pitfall>

## Short Source Excerpts
- <≤30-word quote>
\`\`\`

Rules:
- Do not invent unsupported claims; use only fields present in the extraction.
- Do not put lists or headings in YAML frontmatter; description must be a single safe quoted string.
- Keep each section operational and within the word limit above.
`.trim()

export function buildWritingStyleSkillCreatorSubAgent(
  tools: StructuredTool[],
  language: DetectedInputLanguage = 'en-US',
): SubAgent {
  return {
    name: 'WritingStyleSkillCreator',
    description: 'Creates or refines named-author writing-style skills from WritingStyleExtractor output. It reads writing-style and skill-creator instructions, then saves valid deepagents SKILL.md files.',
    systemPrompt: `${buildOutputLanguagePrompt(language)}\n\n${WRITING_STYLE_SKILL_CREATOR_SYSTEM_PROMPT}`,
    tools,
  }
}
