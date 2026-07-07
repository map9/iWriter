import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredTool } from '@langchain/core/tools'

// Creative-specific tool (04.4 §2): the authorization switch for the write-session
// model (§5 "先批意图→逐块自动累积→整章 diff 终审"). Approving the plan registers the
// authorization scope; the approved/edited plan text becomes both the writer's brief and
// the SS11 fidelity-check baseline. Extracted from the retired storybible CreativeTools.
//
// `target_files` is the machine-readable authorization scope required by 04.1 §6 ("章节清单"):
// the manuscript files this plan authorizes for auto-accumulating block edits. The host matches
// block edits against this list deterministically — 授权域只含计划声明的正文文件，章纲及其它对象永
// 不自动放行。普通 S05 清单长度 1；S07 重构为多章。
export function buildConfirmWritingPlanTool(): StructuredTool {
  return tool(
    async ({ plan, target_files }: { plan: string; target_files: string[] }) => {
      return JSON.stringify({ approved_plan: plan, authorized_files: target_files }, null, 2)
    },
    {
      name: 'confirm_writing_plan',
      description: 'Ask the author to approve or edit a writing plan before drafting a scene/chapter or a large rewrite/restructure. The approved (or author-edited) plan authorizes a write session on the listed manuscript files and is the fidelity baseline for later review.',
      schema: z.object({
        plan: z.string().describe('Complete author-readable Markdown writing plan: scenes covered, POV, conflict, emotional turn, and how it fits the story.'),
        target_files: z.array(z.string()).describe('Absolute host paths of the manuscript file(s) this plan authorizes for drafting (e.g. the ch{NNN}.md being written). Only block edits to these files auto-accumulate; every other object stays under normal review. One file for a normal scene/chapter; multiple for a cross-chapter restructure.'),
      }),
    },
  ) as unknown as StructuredTool
}
