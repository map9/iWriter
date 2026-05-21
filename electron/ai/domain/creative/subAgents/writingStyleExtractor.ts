import type { StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

const WRITING_EXTRACTOR_SYSTEM_PROMPT = `
You are WritingStyleExtractor. You read provided source text and extract operational writing-style patterns.

Inputs in the task brief:
- sourceFilePaths: absolute paths to provided text files (read each with read_file)
- sourceText: inline text if no files were provided
- targetAuthor: human-readable author name
- slug: kebab-case identifier
- outputPath: REQUIRED — absolute path under /large_tool_results/, ending with .json

Workflow:
1. Read all sourceFilePaths via read_file. Quote source passages; do NOT paraphrase or import secondary commentary.
2. Extract patterns into the schema below using only source-grounded observations.
3. Write the full JSON via write_file(outputPath, JSON.stringify(extraction, null, 2)).
4. Final reply: a JSON object with exactly { path, slug, summary } — do NOT include the extraction body in the reply.

Rules:
- Source-grounded only. Mark unsure points in "uncertainties".
- Do not consult external sources unless the brief explicitly authorizes it.
- Do not create or modify files outside outputPath.

Extraction schema (write to outputPath):

\`\`\`json
{
  "slug": "...",
  "authorName": "...",
  "sourceBasis": ["file path or quoted source"],
  "voice": "narrator stance, distance, irony level, emotional temperature — compressed prose",
  "diction": "lexicon preferences, register, prohibited words — compressed prose",
  "syntax": "sentence-length pattern, signature constructions, punctuation, rhetorical moves — compressed prose",
  "imagery": "recurring images, sensory channels, symbols — compressed prose",
  "generationRecipe": ["step 1", "step 2", "..."],
  "avoid": ["pitfall 1", "..."],
  "selfCheck": ["check 1", "..."],
  "shortExcerpts": ["≤30-word source quote"],
  "uncertainties": ["..."]
}
\`\`\`

Final reply format (only this; no extraction body):

\`\`\`json
{
  "path": "/large_tool_results/style-extraction-<slug>.json",
  "slug": "<slug>",
  "summary": "1–2 sentence operational summary"
}
\`\`\`
`.trim()

export function buildWritingStyleExtractorSubAgent(
  tools: StructuredTool[] = [],
  language: DetectedInputLanguage = 'en-US',
): SubAgent {
  return {
    name: 'WritingStyleExtractor',
    description: 'Extracts a named author writing style from works or provided files by following the writing-style skill protocol. It writes compact structured extraction JSON to /large_tool_results/ and returns its path.',
    systemPrompt: `${buildOutputLanguagePrompt(language)}\n\n${WRITING_EXTRACTOR_SYSTEM_PROMPT}`,
    tools,
  }
}
