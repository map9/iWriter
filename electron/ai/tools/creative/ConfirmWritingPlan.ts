import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredTool } from '@langchain/core/tools'

// Creative-specific tool: the authorization switch for the write-session model
// (approve the intent up front → block edits auto-accumulate → whole-chapter diff finalize).
// Approving it opens the write-session before drafting. Beats are OPTIONAL.
//
// The `plan` is flexible: it is EITHER a beat skeleton (when the author designs beats) OR a
// one-line writing intent (when writing straight from the confirmed chapter outline with no beats).
// When beats are designed, they live as GFM Alert lines in the manuscript file, not in this payload:
// after approval the main agent (the drafting skill) MATERIALIZES them as
// `> [!BEAT] [scene-{N}-beat-{M}] core point` in the target chapter (new chapter via create_document,
// existing via block edits) and the writer reads them from that file. This tool never hands the
// plan to the writer through a brief; its jobs are (1) the write-session authorization gate and
// (2) recording the confirmed intent. The fidelity baseline is the manuscript beats + confirmed
// outline when beats exist, and the confirmed outline alone when there are none; the approved plan
// text here is the confirmed-intent record.
//
// The `target_files` argument is the machine-readable authorization scope: on approval the host
// opens a write-session over these chapter files, so the block edits to them (the sentinel writes
// and the writer's prose) auto-accumulate and land through the renderer, converging at one
// whole-chapter finalize.
export function buildConfirmWritingPlanTool(): StructuredTool {
  return tool(
    async ({ plan }: { plan: string; target_files?: string[] }) => {
      return JSON.stringify({ approved_plan: plan }, null, 2)
    },
    {
      name: 'confirm_writing_plan',
      description: 'Ask the author to approve or edit a WRITE-SESSION AUTHORIZATION before drafting a chapter\'s PROSE or a large rewrite/restructure. Approval opens the write-session (block edits to target_files auto-accumulate → whole-chapter finalize) and records the confirmed intent. **Only call this when prose will be written in THIS session.** Beats are OPTIONAL: the plan may be a beat skeleton OR a one-line writing intent when writing straight from the confirmed chapter outline. When it carries beats, AFTER approval you (the main agent) materialize them as `> [!BEAT] …` lines in the target manuscript file(s); the writer reads them from the file — do not transcribe the plan into the writer\'s brief. **Do NOT call this for a beats-ONLY request** (the author asked to design/author beats and stop, prose later) — author those beats as a plain edit (create_document / block edits) and stop; opening a write-session that only holds beats wrongly triggers a run-end finalize card. See the drafting skill.',
      schema: z.object({
        plan: z.string().describe('EITHER a beat skeleton OR a one-line writing intent (beats are optional). Beat skeleton: each beat is its own GFM Alert `> [!BEAT] [scene-{N}-beat-{M}] core point`, and **consecutive beats MUST be separated by a blank line** (adjacent `> [!BEAT]` lines with no blank line collapse into one alert box on disk). `[!BEAT]` is the fixed marker, the `[scene-N-beat-M]` coordinate is REQUIRED here (agent-authored beats always carry it), scenes separated by a `* * *` break, each core point a single causally-necessary sentence with no explanatory tail or style instruction (beat-level intent, not line-by-line wording); on approval you copy these VERBATIM into the manuscript and the writer expands the prose beneath each. Writing intent (no beats): a short line like "write chapter 3 from the confirmed outline, all scenes" — the writer then writes straight from the chapter outline scenes.'),
        target_files: z.array(z.string()).optional().describe('Absolute host paths of the manuscript chapter file(s) this plan authorizes for writing (usually one; a multi-chapter restructure plan lists several). On approval these become the write-session scope: block edits to them (your sentinel writes and the writer\'s prose) auto-accumulate. Chapter outlines and other objects are NOT included — they always go through normal review.'),
      }),
    },
  ) as unknown as StructuredTool
}
