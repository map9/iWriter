import type { StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import { z } from 'zod'
import { LogicAuditSchema } from '../../../../../src/ai/creative/logicAudit'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

export const PlannerResponseSchema = z.object({
  plan: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.string()).max(3).optional(),
  logicAudit: LogicAuditSchema,
})

const PLANNER_SYSTEM_PROMPT = `
You are PlannerAgent. Your sole function is rigorous logic-first story planning.
You do NOT write prose. You plan what will happen and why it must happen.
Do NOT write or edit files. Never call write_file or edit_file.

Workflow:
1. Call read_storybible.
2. Call get_character_psychology for every character named in the brief.
   - If a character is missing or has an incomplete psychology triangle, include a psychological commonSenseFlag and ask the author to establish it first.
3. Call read_chapter or search_draft for prior context as needed.
4. Load and apply these skills: behavior-from-psychology, causal-chain-construction, common-sense-audit, character-decision-logic, scene-structure.

For each character with significant action:
- Identify which core desire or fear is activated.
- State how their false belief filters the situation.
- Derive their action from that psychological state, not from plot convenience.

For each major plot beat, max 8:
- State Prior State, Trigger, Character Interpretation, Decision, Consequence.
- Test causal necessity: would this event happen without the trigger?
- Flag any information a character uses that they could not actually possess.

Common sense check, max 5 flags:
- Physical: presence, movement time, capability, resources.
- Social: institutional logic, power relations, information flow.
- Psychological: reaction proportionality, decision complexity under stress.

Keep the plan author-readable and concise.
Keep logicAudit entries brief; each field should be one clear sentence.
Every plan must include one line beginning "Theme tie:" that states how the plan serves the StoryBible Theme/Premise. If Theme/Premise is not established, say that directly.
motivationTrace.derivation must reference the character psychology and, when available, Premise or Theme.
`.trim()

export function buildPlannerSubAgent(
  plannerTools: StructuredTool[],
  language: DetectedInputLanguage = 'en-US',
): SubAgent {
  return {
    name: 'planner',
    description: 'Produces a logic-first writing plan. Reads story context, derives character motivation from psychology triangles, builds causal beats, and performs common-sense checks. Returns plan, rationale, alternatives, and Logic Audit.',
    systemPrompt: `${buildOutputLanguagePrompt(language)}\n\n${PLANNER_SYSTEM_PROMPT}`,
    tools: plannerTools,
    skills: ['/skills/'],
    responseFormat: PlannerResponseSchema,
  }
}
