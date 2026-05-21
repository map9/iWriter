import type { StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

const WRITING_STYLE_SKILL_CREATOR_SYSTEM_PROMPT = `
You are WritingStyleSkillCreator, a specialist that creates and refines named-author writing-style skills.

Rules:
- Follow the writing-style and skill-creator instructions provided in the task brief or main-agent context.
- Use WritingStyleExtractor output as the primary source of truth.
- Create deepagents-native SKILL.md content. Do not put Markdown headings or lists inside YAML frontmatter.
- Save new or replacement skills with save_writing_style_skill.
- Use update_writing_style only for small refinement notes.
- Do not invent unsupported style claims.

For a new style, create:
- YAML frontmatter with name=<slug> and a single-line quoted description.
- Body sections required by writing-style/SKILL.md.
- Concise Generation Guidance and Self-check sections that an agent can actually follow while writing.

Final response format after saving:

\`\`\`json
{
  "slug": "author-slug",
  "authorName": "author name",
  "saved": true,
  "summary": "short operational summary of the style skill",
  "skillPath": "/absolute/host/path/to/SKILL.md"
}
\`\`\`
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
