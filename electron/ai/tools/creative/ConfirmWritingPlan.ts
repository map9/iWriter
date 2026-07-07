import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredTool } from '@langchain/core/tools'

// Creative-specific tool (04.4 §2): the authorization switch for the write-session
// model (§5 "先批意图→逐块自动累积→整章 diff 终审"). Approving the plan is the intent gate
// before drafting; the approved/edited plan text becomes both the writer's brief and the SS11
// fidelity-check baseline. Extracted from the retired storybible CreativeTools.
//
// NOTE: the write-session authorization scope (`target_files` → auto-accumulating block edits,
// 04.1 §6 Stage 2) is deferred to M1 together with the renderer auto-apply + chapter-finalize
// path (see scaffold/approval/WritingSessionRegistry). Until then this tool is just the intent
// gate and does not carry a machine-readable authorization scope.
export function buildConfirmWritingPlanTool(): StructuredTool {
  return tool(
    async ({ plan }: { plan: string }) => {
      return JSON.stringify({ approved_plan: plan }, null, 2)
    },
    {
      name: 'confirm_writing_plan',
      description: 'Ask the author to approve or edit a writing plan before drafting a scene/chapter or a large rewrite/restructure. The approved (or author-edited) plan is the writer\'s brief and the fidelity baseline for later review.',
      schema: z.object({
        plan: z.string().describe('Complete author-readable Markdown writing plan: scenes covered, POV, conflict, emotional turn, and how it fits the story.'),
      }),
    },
  ) as unknown as StructuredTool
}
