import * as path from 'path'
import type { DomainAgentCapabilities } from '../types'
import type { InterruptOnConfig } from 'langchain'
import { buildCreativeTools } from '../../tools/CreativeTools'
import { buildCreativeAnalysisTools } from '../../tools/CreativeAnalysisTools'
import { buildCreativeAdvisorTools } from '../../tools/CreativeAdvisorTools'
import { buildCreativeExplorationTools } from '../../tools/CreativeExplorationTools'
import { buildCreativeGitTools } from '../../tools/CreativeGitTools'
import { buildCreativeLogicTools } from '../../tools/CreativeLogicTools'
import { buildDocumentTools } from '../../tools/DocumentTools'
import { buildEditProposalTools } from '../../tools/EditProposalTools'
import { buildWebTools } from '../../tools/WebTools'
import { buildWritingStyleTools } from '../../tools/WritingStyleTools'
import { EDIT_INTERRUPT_ON_CONFIG } from '../edit/buildEditCapabilities'
import type { CreativeDb } from '../../db/CreativeDb'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { buildPlannerSubAgent } from './subAgents/planner'
import { buildConsistencySubAgent } from './subAgents/consistency'
import { buildExplorerSubAgent } from './subAgents/explorer'
import { buildWriterSubAgent } from './subAgents/writer'
import { buildResearcherSubAgent } from './subAgents/researcher'
import { buildWritingStyleExtractorSubAgent } from './subAgents/writingStyleExtractor'
import { buildWritingStyleSkillCreatorSubAgent } from './subAgents/writingStyleSkillCreator'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'

export function buildCreativeCapabilities(input: {
  aiRootPath: string,
  workspacePath: string | null,
  creativeDb: CreativeDb | null,
  snapshotBroker: SnapshotBroker,
  language?: DetectedInputLanguage,
  onSkillsMutated?: () => void,
}): DomainAgentCapabilities {
  const skillsRoot = path.join(input.aiRootPath, 'skills')
  const skillSources = (...names: string[]) => names.map(name => path.join(skillsRoot, name))
  const noop = () => {}
  const writingStyleTools = buildWritingStyleTools({
    skillsRoot,
    onSkillsMutated: input.onSkillsMutated ?? noop,
  })
  const webTools = buildWebTools()

  const creativeTools = buildCreativeTools({ workspacePath: input.workspacePath, creativeDb: input.creativeDb, snapshotBroker: input.snapshotBroker })
  const explorationTools = buildCreativeExplorationTools({ workspacePath: input.workspacePath, creativeDb: input.creativeDb })
  const docTools = buildDocumentTools(input.snapshotBroker)
  const editProposalTools = buildEditProposalTools()

  const mainWritingStyleTools = writingStyleTools.filter(t =>
    t.name === 'list_writing_styles' ||
    t.name === 'get_writing_style' ||
    t.name === 'update_writing_style' ||
    t.name === 'delete_writing_style',
  )

  // B4: deprecated tools removed from agent; create_chapter/delete_chapter redirected to create_document per B4b
  const deprecatedCreativeToolNames = new Set(['read_chapter', 'read_fragments', 'search_draft', 'write_to_chapter', 'create_chapter', 'delete_chapter'])
  const mainCreativeTools = creativeTools.filter(t => !deprecatedCreativeToolNames.has(t.name))
  // MainAgent coordinates structure and approvals. Manuscript block edits are owned by WriterAgent.
  const mainEditProposalTools = editProposalTools.filter(t => t.name === 'create_document')
  const mainExplorationTools = explorationTools.filter(t =>
    t.name !== 'promote_exploration' &&
    t.name !== 'write_exploration_draft'
  )
  const mainDocumentToolNames = new Set([
    'get_document_outline',
    'get_section',
    'get_blocks',
    'search_blocks_in_document',
    'search_sections_in_document',
  ])
  const mainDocumentTools = docTools.filter(t => mainDocumentToolNames.has(t.name))

  const mainTools = [
    ...mainCreativeTools,
    ...mainDocumentTools,
    ...mainEditProposalTools,
    ...buildCreativeAnalysisTools({ workspacePath: input.workspacePath, creativeDb: input.creativeDb, snapshotBroker: input.snapshotBroker }),
    ...buildCreativeAdvisorTools({ workspacePath: input.workspacePath }),
    ...buildCreativeGitTools({ workspacePath: input.workspacePath }),
    ...mainExplorationTools,
    ...mainWritingStyleTools,
  ]

  // Sub-agent read tools: storybible/session from creativeTools + DocumentTools (no read_chapter/read_fragments/search_draft)
  // Main agent keeps old creative read tools until B4 removes them.
  const creativeReadToolNames = new Set(['read_storybible', 'list_chapters', 'get_session_diff'])
  const creativeReadOnlyTools = creativeTools.filter(tool => creativeReadToolNames.has(tool.name))
  const docReadToolNames = new Set([
    'get_document_outline', 'get_section', 'get_sections',
    'get_blocks', 'get_block_context',
    'search_blocks_in_document', 'search_sections_in_document',
  ])
  const docReadSubAgentTools = docTools.filter(t => docReadToolNames.has(t.name))
  // Combined read-only tool set for sub-agents (absolute-path aware)
  const subAgentReadTools = [...creativeReadOnlyTools, ...docReadSubAgentTools]

  const styleReadTools = writingStyleTools.filter(t =>
    t.name === 'list_writing_styles' || t.name === 'get_writing_style',
  )
  const plannerTools = [
    ...subAgentReadTools,
    ...buildCreativeLogicTools({ workspacePath: input.workspacePath }),
  ]
  const explorerToolNames = new Set([
    'read_storybible', 'list_chapters', 'get_session_diff',
    'write_exploration_draft',
  ])
  const explorerTools = [
    ...creativeTools.filter(tool => explorerToolNames.has(tool.name)),
    ...explorationTools.filter(tool => explorerToolNames.has(tool.name)),
    ...docReadSubAgentTools,
  ]

  const writingStyleSkillCreatorTools = writingStyleTools.filter(t =>
    t.name === 'list_writing_styles' ||
    t.name === 'get_writing_style' ||
    t.name === 'save_writing_style_skill' ||
    t.name === 'update_writing_style',
  )
  const researcherTools = webTools

  // WriterAgent: block read/write (no create_document) + storybible read + style read
  const writerReadStorybibleTools = creativeTools.filter(t => t.name === 'read_storybible')
  const writerEditToolNames = new Set(['edit_block', 'insert_block', 'delete_block', 'replace_range'])
  const writerTools = [
    ...docTools,
    ...editProposalTools.filter(t => writerEditToolNames.has(t.name)),
    ...writerReadStorybibleTools,
    ...styleReadTools,
  ]

  return {
    tools: mainTools,
    subAgents: [
      buildPlannerSubAgent(plannerTools, input.language ?? 'en-US', { skillSources: skillSources('common', 'planner') }),
      buildConsistencySubAgent([...subAgentReadTools, ...styleReadTools], input.language ?? 'en-US', { skillSources: skillSources('common', 'consistency') }),
      buildExplorerSubAgent(explorerTools, input.language ?? 'en-US', { skillSources: skillSources('common', 'explorer') }),
      buildWriterSubAgent(writerTools, input.language ?? 'en-US', { skillSources: skillSources('common', 'writer') }),
      buildResearcherSubAgent([...researcherTools], input.language ?? 'en-US', { skillSources: skillSources('researcher') }),
      buildWritingStyleExtractorSubAgent([], input.language ?? 'en-US'),
      buildWritingStyleSkillCreatorSubAgent(writingStyleSkillCreatorTools, input.language ?? 'en-US'),
    ],
    interruptOn: CREATIVE_INTERRUPT_ON_CONFIG,
  }
}

export const CREATIVE_INTERRUPT_ON_CONFIG: Record<string, InterruptOnConfig> = {
  // Block-level document edit tools (shared with edit domain)
  ...EDIT_INTERRUPT_ON_CONFIG,
  confirm_writing_plan:        { allowedDecisions: ['approve', 'edit', 'reject'] },
  resolve_open_question:       { allowedDecisions: ['approve', 'edit', 'reject'] },
  rename_chapter:              { allowedDecisions: ['approve', 'reject'] },
  reorder_chapters:            { allowedDecisions: ['approve', 'reject'] },
  replace_storybible_section:  { allowedDecisions: ['approve', 'reject'] },
  rebuild_storybible:          { allowedDecisions: ['approve', 'reject'] },
  compress_storybible_history: { allowedDecisions: ['approve', 'reject'] },
  git_commit:                  { allowedDecisions: ['approve', 'edit', 'reject'] },
  git_tag:                     { allowedDecisions: ['approve', 'reject'] },
  start_exploration:           { allowedDecisions: ['approve', 'reject'] },
  finish_exploration:          { allowedDecisions: ['approve', 'reject'] },
  delete_exploration:          { allowedDecisions: ['approve', 'reject'] },
  delete_writing_style:        { allowedDecisions: ['approve', 'reject'] },
}

export const CREATIVE_INTERRUPT_ON_NAMES = new Set(Object.keys(CREATIVE_INTERRUPT_ON_CONFIG))
