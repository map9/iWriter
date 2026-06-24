import { tool, type StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import { z } from 'zod'
import type { DetectedInputLanguage } from '../../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../../src/ai/message/detectInputLanguage'

const ConsistencyFindingSchema = z.object({
  layer: z.enum(['pov', 'character', 'logic', 'voice', 'pacing', 'continuity', 'common_sense', 'other']),
  severity: z.enum(['info', 'minor', 'major']),
  locationRef: z.string().optional(),
  description: z.string().min(1),
  suggestion: z.string().optional(),
})

export function buildSubmitConsistencyFindingsTool(
  language: DetectedInputLanguage = 'en-US',
): StructuredTool {
  return tool(
    async ({ findings }: { findings: z.infer<typeof ConsistencyFindingSchema>[] }) => {
      if (!findings.length) {
        return language === 'zh-CN'
          ? '未发现需要处理的一致性问题。'
          : language === 'ja-JP'
            ? '対応が必要な整合性の問題は見つかりませんでした。'
            : 'No consistency issues require attention.'
      }
      return `\`\`\`consistency-findings\n${JSON.stringify(findings, null, 2)}\n\`\`\``
    },
    {
      name: 'submit_consistency_findings',
      description: 'Submit the final consistency findings. Call exactly once after completing the review, including an empty findings array when no issues were found.',
      schema: z.object({
        findings: z.array(ConsistencyFindingSchema),
      }),
      returnDirect: true,
    },
  )
}

const CONSISTENCY_SYSTEM_PROMPT = `
You are ConsistencyAgent. Your sole function is finding consistency problems.
You do NOT plan or write. You verify.
Do NOT write or edit files. Never call write_file or edit_file.

## Brief Validation

Read the brief in your first user message. It MUST contain the following labeled field:
  - target_file  (absolute host path to the chapter, e.g. /Users/xxx/myproject/draft/ch01.md)

If target_file is missing or empty, STOP immediately and reply with exactly:

  MISSING_FIELDS: target_file

Do NOT use ls, glob, or grep to find the chapter yourself. The brief is the only source
of this field; if it lacks it the upstream caller must amend it.

Workflow:
1. Call read_storybible to load constraints, character psychology, and world rules.
2. Call get_blocks(file_path=<target_file>) to load the content to check.
3. If a writing style is active, call list_writing_styles and get_writing_style(slug) first to load style constraints.
4. Load and apply: pov-consistency-check, character-behavior-check, story-logic, common-sense-audit, foreshadowing-audit, arc-progression-check, style-consistency-check (if a writing style is active, apply style-consistency-check against it).

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

After completing the review, call submit_consistency_findings exactly once.
Pass only findings that matter. Use an empty findings array when there are no issues.
Do not hand-write JSON or repeat the submitted findings in response text.
`.trim()

export function buildConsistencySubAgent(
  readOnlyTools: StructuredTool[],
  language: DetectedInputLanguage = 'en-US',
  options?: { skillSources?: string[] },
): SubAgent {
  return {
    name: 'consistency_checker',
    description: 'Checks a draft chapter for POV, character behavior, plot logic, voice, pacing, continuity, and common-sense issues. Returns structured findings.',
    systemPrompt: `${buildOutputLanguagePrompt(language)}\n\n${CONSISTENCY_SYSTEM_PROMPT}`,
    tools: readOnlyTools,
    ...(options?.skillSources?.length ? { skills: options.skillSources } : {}),
  }
}
