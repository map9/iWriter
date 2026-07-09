import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredTool } from '@langchain/core/tools'

// Creative-specific tool (Phase 2 M1b-3): the write-session CLOSING gate. After the writer has laid
// down all the prose for a chapter (auto-accumulated silently through the write-session opened by
// confirm_writing_plan), the main agent (A00) calls this to present ONE whole-chapter finalize card:
// baseline (the snapshot captured when the session lazy-activated) vs. current (the chapter on disk).
//
// The body only returns a confirmation string — all side effects happen in the host on resume
// (AgentEngine._handleFinalizeDecisions), symmetric with confirm_writing_plan:
//   • approve  → close the write-session (the accepted chapter stays on disk; version-tracking commit
//                is left to the model's existing git_commit card).
//   • respond  → rework: the session stays OPEN, the writer revises, A00 finalizes again later.
//   • reject   → restore the baseline snapshot to disk (discard the session's writing) and close it.
export function buildFinalizeChapterTool(): StructuredTool {
  return tool(
    async ({ chapter, summary }: { chapter: string; summary?: string }) => {
      return JSON.stringify({ finalized_chapter: chapter, summary: summary ?? '' }, null, 2)
    },
    {
      name: 'finalize_chapter',
      description: 'Present a WHOLE-CHAPTER finalize card to the author once a chapter is fully drafted, closing its write-session. The card shows the baseline (session start) vs. the current chapter and offers three outcomes: approve (accept the draft, close the session), reply-with-feedback (rework — the session stays open for another writing pass), or reject (discard the session\'s writing, restore the baseline). Call this only after the chapter\'s prose is complete; do not commit or restore files yourself — approving/rejecting this card drives the write-session close.',
      schema: z.object({
        chapter: z.string().describe('The manuscript chapter file this session wrote — an absolute host path (preferred; a workspace-relative path is resolved against the workspace root). This must be the same file that was authorized via confirm_writing_plan.target_files.'),
        summary: z.string().optional().describe('A one- or two-sentence summary of what this chapter covers / what changed, shown on the finalize card to orient the author before they accept or reject.'),
      }),
    },
  ) as unknown as StructuredTool
}
