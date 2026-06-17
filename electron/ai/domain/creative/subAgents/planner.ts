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

## Brief Validation

Read the brief in your first user message. It MUST contain all of the following labeled fields:
  - sceneBrief
  - characters
  - targetChapter

If any required field is missing or empty, STOP immediately and reply with exactly:

  MISSING_FIELDS: <comma-separated field names>

Do NOT use ls, glob, grep, or read_file to look for the values yourself. The brief is
the only source of these fields; if it lacks them the upstream caller must amend it.

Workflow:
1. Call read_storybible.
2. Call get_character_psychology for every character named in the brief.
   - If a character is missing or has an incomplete psychology triangle, include a psychological commonSenseFlag and ask the author to establish it first.
3. Call get_section or get_blocks with the absolute chapter file path for prior context as needed.
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
alternatives MUST be an array of strings only. Do NOT use objects such as { "direction": "", "tradeoff": "" }.
Use the exact logicAudit field names shown below. Do NOT use coreDesire, coreFear,
category, flag, severity, or causalNecessity keys.
commonSenseFlags[].dimension MUST be exactly one of "physical", "social", or "psychological"; do not translate these enum values.

## Output Format

After completing all tool calls, your FINAL response must be a single valid json object.
No explanatory prose before or after. No markdown code fences. No "` + '```' + `json" prefix.
Output the raw json object directly — nothing else.

The json object must have exactly these keys:

{
  "plan": "<the full plan text>",
  "rationale": "<why this direction>",
  "alternatives": ["<alt 1>", "<alt 2>"],
  "logicAudit": {
    "motivationTraces": [
      {
        "character": "",
        "action": "",
        "activatedDesireOrFear": "",
        "falseBelief": "",
        "derivation": ""
      }
    ],
    "causalChain": [
      {
        "beat": "",
        "priorState": "",
        "trigger": "",
        "characterInterpretation": "",
        "decision": "",
        "consequence": ""
      }
    ],
    "commonSenseFlags": [
      {
        "dimension": "physical",
        "issue": "",
        "correction": ""
      }
    ]
  }
}
`.trim()

export function buildPlannerSubAgent(
  plannerTools: StructuredTool[],
  language: DetectedInputLanguage = 'en-US',
  options?: { skillSources?: string[] },
): SubAgent {
  return {
    name: 'planner',
    description: 'Produces a logic-first writing plan. Reads story context, derives character motivation from psychology triangles, builds causal beats, and performs common-sense checks. Returns plan, rationale, alternatives, and Logic Audit.',
    systemPrompt: `${buildOutputLanguagePrompt(language)}\n\n${PLANNER_SYSTEM_PROMPT}`,
    tools: plannerTools,
    // responseFormat enables ProviderStrategy (native JSON parsing) in langchain 1.4.x.
    // DeepSeek's app-level profile declares structuredOutput:true, so langchain
    // routes through ProviderStrategy — which reads the model's text content directly with
    // JSON.parse — rather than ToolStrategy, avoiding any tool_choice:"any" injection.
    // The system prompt instructs the model to output bare JSON (no fences) so that
    // ProviderStrategy.parse can extract the structured result without regex post-processing.
    // TaskToolCompatMiddleware provides a normalization + Zod fallback for residual shape errors.
    responseFormat: PlannerResponseSchema,
    ...(options?.skillSources?.length ? { skills: options.skillSources } : {}),
  }
}
