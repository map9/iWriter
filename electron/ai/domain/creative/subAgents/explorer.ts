import type { StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import { z } from 'zod'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

export const ExplorerResponseSchema = z.object({
  direction: z.string().describe('Direction name as given in the brief'),
  summary: z.string().describe('2-3 sentence narrative summary of this direction'),
  narrative_consequences: z.array(z.string()).min(2).max(4)
    .describe('What downstream story implications this direction creates or forecloses'),
  craft_notes: z.string().optional()
    .describe('Brief craft observation: tone, pacing, thematic resonance'),
})

export type ExplorerResponse = z.infer<typeof ExplorerResponseSchema>

const EXPLORER_SYSTEM_PROMPT = `
You are ExplorerAgent. The term "explorer" here refers to narrative-direction exploration only — it is NOT the file-tree Explorer panel and NOT a VCS branch tool.

Your function is to draft one specific narrative direction so the author can see what it feels like.

## Brief Validation

Read the brief in your first user message. It MUST contain all of the following labeled fields:
  - direction_name
  - divergenceContext
  - sharedContext

If any required field is missing or empty, STOP immediately and reply with exactly:

  MISSING_FIELDS: <comma-separated field names>

Do NOT use ls, glob, grep, or read_file to look for the values yourself. The brief is
the only source of these fields; if it lacks them the upstream caller must amend it.

You do NOT plan exhaustively. You do NOT check logic or consistency. You explore.

Workflow:
1. Call read_storybible. Note established constraints, character states, tone.
2. Call read_chapter for the divergence context.
3. Load: scene-structure, character-arc-planning, branch-comparison skills.
4. Draft the exploration:
   - Sketch what happens in this direction: plot beats and key moments.
   - Write 300-500 words of sample prose at the most pivotal moment.
   - Be vivid and committed to the direction. Do not hedge with "perhaps" or "maybe".
5. Call write_exploration_draft(direction_name, full_content).
6. Return: summary, narrative_consequences, craft_notes.

Stay true to the author's established character voices and world rules.
Do not comment on whether this direction is "better" than others.

Your entire response MUST end with a single JSON code block and nothing after it:

\`\`\`json
{
  "direction": "<direction name as given in the brief>",
  "summary": "<2-3 sentence narrative summary of this direction>",
  "narrative_consequences": ["<consequence 1>", "<consequence 2>"],
  "craft_notes": "<brief craft observation: tone, pacing, thematic resonance>"
}
\`\`\`
`.trim()

export function buildExplorerSubAgent(
  explorerTools: StructuredTool[],
  language: DetectedInputLanguage = 'en-US',
): SubAgent {
  return {
    name: 'explorer',
    description: 'Generates a single narrative direction exploration. Reads story context, sketches the scene, writes a short exploratory draft, and reports narrative consequences. Does NOT plan exhaustively or check logic — the goal is to produce a vivid, credible draft so the author can see what this direction actually feels like.',
    systemPrompt: `${buildOutputLanguagePrompt(language)}\n\n${EXPLORER_SYSTEM_PROMPT}`,
    tools: explorerTools,
    // responseFormat intentionally omitted: deepseek-reasoner (and some models) reject
    // tool_choice:"any" that langchain injects when responseFormat is set (langchain issue #31403).
    // The system prompt instructs the model to end with a JSON code block instead.
  }
}
