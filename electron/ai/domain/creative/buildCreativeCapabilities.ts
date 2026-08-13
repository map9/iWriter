import * as path from 'path'
import type { DomainAgentCapabilities } from '../types'
import type { InterruptOnConfig } from 'langchain'
import type { StructuredTool } from '@langchain/core/tools'
import { buildGitTools, shouldInterruptGit } from '../../tools/common/GitTools'
import { buildDocumentTools } from '../../tools/common/DocumentTools'
import { buildEditProposalTools } from '../../tools/common/EditProposalTools'
import { buildFilesystemMutationTools } from '../../tools/common/FilesystemMutationTools'
import { buildPdfTools } from '../../tools/common/PdfTools'
import { buildWebTools } from '../../tools/common/WebTools'
import { buildConfirmWritingPlanTool } from '../../tools/creative/ConfirmWritingPlan'
import { buildFinalizeChapterTool } from '../../tools/creative/FinalizeChapter'
import { buildFindReferencesTool } from '../../tools/creative/FindReferences'
import { buildImportManuscriptTool } from '../../tools/creative/ImportManuscript'
import { EDIT_INTERRUPT_ON_CONFIG } from '../edit/buildEditCapabilities'
import { ToolRegistry } from '../../tools/ToolRegistry'
import { assembleSubagents } from '../../scaffold/subagents/SubagentAssembler'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import type { EditorStateBroker } from '../../document/EditorStateBroker'
import { buildEditorStateTool } from '../../tools/common/EditorStateTools'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'
import type { GitMutationEvent } from '../../../../src/types/git'
import type { GitService } from '../../../GitService'

// Phase 2 M0 (B1剩余 + A1): the creative域 tool面 is now the general common + git tools plus
// the single creative专用 tool `confirm_writing_plan`. The storybible/sqlite object model and
// its ~34 tools are retired; the object model is a markdown file tree the agent builds lazily
// via the generic document/filesystem tools. Sub-agents are assembled declaratively from
// `~/.iwriter/ai/subagents/{common,creative}/*/agent.md` (see SubagentAssembler).
export function buildCreativeCapabilities(input: {
  aiRootPath: string,
  workspacePath: string | null,
  snapshotBroker: SnapshotBroker,
  editorStateBroker: EditorStateBroker,
  language?: DetectedInputLanguage,
  gitService: GitService,
  onGitMutation: (event: GitMutationEvent) => void,
}): DomainAgentCapabilities {
  const skillsRoot = path.join(input.aiRootPath, 'skills')
  const subagentsRoot = path.join(input.aiRootPath, 'subagents')
  const language = input.language ?? 'en-US'

  // Build the general tool面. deepagents filesystem tools (read_file/write_file/ls/grep/glob)
  // come from the backend and are NOT registered here.
  const tools: StructuredTool[] = [
    buildEditorStateTool(input.editorStateBroker),
    ...buildDocumentTools(input.snapshotBroker),
    ...buildEditProposalTools(),
    ...buildFilesystemMutationTools(),
    ...buildPdfTools(),
    ...buildWebTools(),
    ...buildGitTools({
      gitService: input.gitService,
      onMutation: input.onGitMutation,
    }),
    buildConfirmWritingPlanTool(),
    buildFinalizeChapterTool(),
    // Read-only impact/reference aggregation for restructuring (FR-6.2). No interruptOn gate.
    buildFindReferencesTool(input.snapshotBroker),
    // Manuscript import (FR-14.3): one two-stage tool (dry-run detect / execute write).
    buildImportManuscriptTool(),
  ]

  const registry = new ToolRegistry(tools)

  const subAgents = assembleSubagents({
    subagentsRoot,
    skillsRoot,
    workspacePath: input.workspacePath,
    domain: 'creative',
    language,
    registry,
  })

  return {
    // A00 (main控) draws the broadest tool面; per-object write restrictions (manuscript block
    // edits owned by SA02, etc.) are enforced by prompt/red-lines and the write-session policy,
    // not by removing tools A00 needs for non-manuscript objects (S03/S04/S11).
    tools: registry.all(),
    subAgents,
    interruptOn: CREATIVE_INTERRUPT_ON_CONFIG,
  }
}

export const CREATIVE_INTERRUPT_ON_CONFIG: Record<string, InterruptOnConfig> = {
  // Block-level document edit tools (shared with edit domain).
  ...EDIT_INTERRUPT_ON_CONFIG,
  // Creative专用: plan authorization gate (§5 write-session).
  confirm_writing_plan: { allowedDecisions: ['approve', 'edit', 'reject'] },
  // Creative专用: whole-chapter finalize gate closing the write-session (M1b-3). approve=accept,
  // reject=discard+restore baseline; rework routes through the reject channel with RESPOND_MARKER.
  finalize_chapter: { allowedDecisions: ['approve', 'reject'] },
  // Creative专用: physical manuscript import uses one gated tool for both stages. Dry-run
  // classifies candidate boundaries and writes nothing; execute validates the confirmed file
  // plan, front/back-matter decisions, and collision policy before writing.
  import_manuscript: { allowedDecisions: ['approve', 'reject'] },
  // Reuse LangChain HITL's per-call predicate: safe reads auto-run; mutations interrupt.
  git: {
    allowedDecisions: ['approve', 'reject'],
    when: request => shouldInterruptGit(request.toolCall.args.args),
  },
}

export const CREATIVE_INTERRUPT_ON_NAMES = new Set(Object.keys(CREATIVE_INTERRUPT_ON_CONFIG))
