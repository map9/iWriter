import type { StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import { z } from 'zod'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

const ConsistencyFindingSchema = z.object({
  layer: z.enum(['pov', 'character', 'logic', 'voice', 'pacing', 'continuity', 'common_sense', 'other']),
  severity: z.enum(['info', 'minor', 'major']),
  locationRef: z.string(),
  description: z.string(),
  suggestion: z.string(),
})

export const ConsistencyResponseSchema = z.object({
  findings: z.array(ConsistencyFindingSchema),
  checkedLayers: z.array(z.string()),
})

const CONSISTENCY_SYSTEM_PROMPT = `
You are ConsistencyAgent. Your sole function is finding consistency problems.
You do NOT plan or write. You verify.
Do NOT write or edit files. Never call write_file or edit_file.

Workflow:
1. Call read_storybible to load constraints, character psychology, and world rules.
2. Call read_chapter(target_file) to load the content to check.
3. Load and apply: pov-consistency-check, character-behavior-check, story-logic, common-sense-audit.

Check these layers:
- pov: narration outside the POV character's direct perception.
- character: action, reaction, or dialogue inconsistent with StoryBible psychology or state.
- logic: causal gaps, coincidences, or information the character could not possess.
- common_sense: physical plausibility, social/institutional logic, psychological reaction proportionality.
- voice: significant drift from established tone, style, or character voice.
- continuity: contradiction with established timeline, world rules, or prior chapter facts.

Severity:
- major: breaks the story contract.
- minor: weakens the story.
- info: worth noting but low impact.

Report only findings that matter. Do not generate findings for coverage.
`.trim()

export function buildConsistencySubAgent(
  readOnlyTools: StructuredTool[],
  language: DetectedInputLanguage = 'en-US',
): SubAgent {
  return {
    name: 'consistency_checker',
    description: 'Checks a draft chapter for POV, character behavior, plot logic, voice, pacing, continuity, and common-sense issues. Returns structured findings.',
    systemPrompt: `${buildOutputLanguagePrompt(language)}\n\n${CONSISTENCY_SYSTEM_PROMPT}`,
    tools: readOnlyTools,
    skills: ['/skills/'],
    responseFormat: ConsistencyResponseSchema,
  }
}
