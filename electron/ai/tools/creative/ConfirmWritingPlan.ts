import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredTool } from '@langchain/core/tools'

// Creative-specific tool (04.4 §2): the authorization switch for the write-session
// model (§5 "先批意图→逐块自动累积→整章 diff 终审"). Approving the plan is the intent gate
// before drafting; the approved/edited plan text becomes both the writer's brief and the SS11
// fidelity-check baseline. Extracted from the retired storybible CreativeTools.
//
// The `target_files` argument is the machine-readable authorization scope (04.1 §6 Stage 2):
// on approval the host opens a write-session over these chapter files, so the writer's block
// edits to them auto-accumulate and land through the renderer,収束 at one whole-chapter finalize.
export function buildConfirmWritingPlanTool(): StructuredTool {
  return tool(
    async ({ plan }: { plan: string; target_files?: string[] }) => {
      return JSON.stringify({ approved_plan: plan }, null, 2)
    },
    {
      name: 'confirm_writing_plan',
      description: 'Ask the author to approve or edit a beat-level writing plan before drafting a chapter or a large rewrite/restructure. The approved (or author-edited) plan is the writer\'s brief and the fidelity baseline for later review.',
      schema: z.object({
        plan: z.string().describe('Complete author-readable Markdown writing plan at BEAT granularity: for each confirmed outline scene, the 2-5 beats it breaks into, each a one-line core point (核心点) that is causally necessary. This is beat-level intent (what to write), not line-by-line wording. The writer expands these approved beats into prose.'),
        target_files: z.array(z.string()).optional().describe('Absolute host paths of the manuscript chapter file(s) this plan authorizes for writing (usually one; a multi-chapter restructure plan lists several). On approval these become the write-session scope: the writer\'s block edits to them auto-accumulate. Chapter outlines and other objects are NOT included — they always go through normal review.'),
      }),
    },
  ) as unknown as StructuredTool
}
