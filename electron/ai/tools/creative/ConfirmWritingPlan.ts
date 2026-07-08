import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredTool } from '@langchain/core/tools'

// Creative-specific tool (04.4 §2): the authorization switch for the write-session
// model (§5 "先批意图→逐块自动累积→整章 diff 终审"). Approving the plan is the intent gate
// before drafting. Extracted from the retired storybible CreativeTools.
//
// Beats live as sentinel lines in the manuscript file, not in this payload: after approval the
// main agent (S05a writing-plan-authoring) MATERIALIZES the confirmed beats as sentinels
// (`> [场景-{N}-节拍-{M}] 核心点`) in the target chapter — new chapter via create_document, existing
// chapter via block edits — and the writer reads them from that file. This tool no longer hands the
// plan to the writer through a brief; its jobs are (1) the write-session authorization gate and
// (2) recording the confirmed intent. The SS11 fidelity baseline is the manuscript sentinels
// (plus the confirmed outline); the approved plan text here is the confirmed-intent record.
//
// The `target_files` argument is the machine-readable authorization scope (04.1 §6 Stage 2):
// on approval the host opens a write-session over these chapter files, so the block edits to them
// (the sentinel writes and the writer's prose) auto-accumulate and land through the renderer,
// 収束 at one whole-chapter finalize.
export function buildConfirmWritingPlanTool(): StructuredTool {
  return tool(
    async ({ plan }: { plan: string; target_files?: string[] }) => {
      return JSON.stringify({ approved_plan: plan }, null, 2)
    },
    {
      name: 'confirm_writing_plan',
      description: 'Ask the author to approve or edit a beat-level writing plan before drafting a chapter or a large rewrite/restructure. Approval authorizes the write-session and records the confirmed intent. AFTER approval you (the main agent) materialize the confirmed beats as sentinel lines in the target manuscript file(s) — the writer then reads them from the file; do not transcribe the plan into the writer\'s brief.',
      schema: z.object({
        plan: z.string().describe('The beat plan written DIRECTLY in the canonical sentinel format (see writing-plan-authoring): one blockquote sentinel per line `> [场景-{N}-节拍-{M}] 核心点` (always the full 场景-N-节拍-M label, never a table or a {N}-{M} short form), scenes separated by a `* * *` break, each 核心点 a single causally-necessary sentence with no explanatory tail or style instruction. This is beat-level intent, not line-by-line wording. On approval you copy these sentinels VERBATIM into the manuscript; the writer expands the prose beneath each.'),
        target_files: z.array(z.string()).optional().describe('Absolute host paths of the manuscript chapter file(s) this plan authorizes for writing (usually one; a multi-chapter restructure plan lists several). On approval these become the write-session scope: block edits to them (your sentinel writes and the writer\'s prose) auto-accumulate. Chapter outlines and other objects are NOT included — they always go through normal review.'),
      }),
    },
  ) as unknown as StructuredTool
}
