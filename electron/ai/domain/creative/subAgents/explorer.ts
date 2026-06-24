import { tool, type StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import { z } from 'zod'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

export function buildSubmitExplorationResultTool(): StructuredTool {
  return tool(
    async ({
      direction,
      summary,
      narrativeConsequences,
      craftNotes,
    }: {
      direction: string
      summary: string
      narrativeConsequences: string[]
      craftNotes?: string
    }) => `\`\`\`exploration-result\n${JSON.stringify({
      direction,
      summary,
      narrative_consequences: narrativeConsequences,
      ...(craftNotes?.trim() && { craft_notes: craftNotes }),
    }, null, 2)}\n\`\`\``,
    {
      name: 'submit_exploration_result',
      description: 'Submit the final structured summary after write_exploration_draft succeeds. Call exactly once and do not repeat the result in response text.',
      schema: z.object({
        direction: z.string().min(1),
        summary: z.string().min(1),
        narrativeConsequences: z.array(z.string().min(1)).min(1).max(4),
        craftNotes: z.string().optional(),
      }),
      returnDirect: true,
    },
  )
}

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
2. Call get_blocks(file_path=<absolute path from divergenceContext>) to load the divergence context.
3. Load: scene-structure, character-arc-planning, branch-comparison skills.
4. Draft the exploration:
   - Sketch what happens in this direction: plot beats and key moments.
   - Write 300-500 words of sample prose at the most pivotal moment.
   - Be vivid and committed to the direction. Do not hedge with "perhaps" or "maybe".
5. Call write_exploration_draft(direction_name, full_content).
6. After the draft is written successfully, call submit_exploration_result exactly once with the direction, summary, narrative consequences, and optional craft notes.

Stay true to the author's established character voices and world rules.
Do not comment on whether this direction is "better" than others.
Do not hand-write JSON or repeat the submitted result in response text.
`.trim()

export function buildExplorerSubAgent(
  explorerTools: StructuredTool[],
  language: DetectedInputLanguage = 'en-US',
  options?: { skillSources?: string[] },
): SubAgent {
  return {
    name: 'explorer',
    description: 'Generates a single narrative direction exploration. Reads story context, sketches the scene, writes a short exploratory draft, and reports narrative consequences. Does NOT plan exhaustively or check logic — the goal is to produce a vivid, credible draft so the author can see what this direction actually feels like.',
    systemPrompt: `${buildOutputLanguagePrompt(language)}\n\n${EXPLORER_SYSTEM_PROMPT}`,
    tools: explorerTools,
    ...(options?.skillSources?.length ? { skills: options.skillSources } : {}),
  }
}
