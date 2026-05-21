import * as path from 'path'
import type { DomainAgentCapabilities } from '../types'
import type { InterruptOnConfig } from 'langchain'
import { buildCreativeTools } from '../../tools/CreativeTools'
import { buildCreativeAnalysisTools } from '../../tools/CreativeAnalysisTools'
import { buildCreativeAdvisorTools } from '../../tools/CreativeAdvisorTools'
import { buildCreativeExplorationTools } from '../../tools/CreativeExplorationTools'
import { buildCreativeGitTools } from '../../tools/CreativeGitTools'
import { buildCreativeLogicTools } from '../../tools/CreativeLogicTools'
import { buildWebTools } from '../../tools/WebTools'
import { buildWritingStyleTools } from '../../tools/WritingStyleTools'
import type { CreativeDb } from '../../db/CreativeDb'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { buildPlannerSubAgent } from './subAgents/planner'
import { buildConsistencySubAgent } from './subAgents/consistency'
import { buildExplorerSubAgent } from './subAgents/explorer'
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
  const noop = () => {}
  const writingStyleTools = buildWritingStyleTools({
    skillsRoot,
    onSkillsMutated: input.onSkillsMutated ?? noop,
  })
  const webTools = buildWebTools()

  const creativeTools = buildCreativeTools({ workspacePath: input.workspacePath, creativeDb: input.creativeDb, snapshotBroker: input.snapshotBroker })
  const explorationTools = buildCreativeExplorationTools({ workspacePath: input.workspacePath, creativeDb: input.creativeDb })

  const mainWritingStyleTools = writingStyleTools.filter(t =>
    t.name === 'list_writing_styles' ||
    t.name === 'get_writing_style' ||
    t.name === 'update_writing_style' ||
    t.name === 'delete_writing_style',
  )

  const mainTools = [
    ...creativeTools,
    ...buildCreativeAnalysisTools({ workspacePath: input.workspacePath, creativeDb: input.creativeDb, snapshotBroker: input.snapshotBroker }),
    ...buildCreativeAdvisorTools({ workspacePath: input.workspacePath }),
    ...buildCreativeGitTools({ workspacePath: input.workspacePath }),
    ...explorationTools,
    ...mainWritingStyleTools,
  ]

  const readToolNames = new Set([
    'read_storybible',
    'read_chapter',
    'read_fragments',
    'search_draft',
    'list_chapters',
    'get_session_diff',
  ])
  const readOnlyTools = creativeTools.filter(tool => readToolNames.has(tool.name))
  const plannerTools = [
    ...readOnlyTools,
    ...buildCreativeLogicTools({ workspacePath: input.workspacePath }),
  ]
  const explorerToolNames = new Set([
    ...readToolNames,
    'list_chapters',
    'write_exploration_draft',
  ])
  const explorerTools = [
    ...creativeTools.filter(tool => explorerToolNames.has(tool.name)),
    ...explorationTools.filter(tool => explorerToolNames.has(tool.name)),
  ]

  const writingStyleSkillCreatorTools = writingStyleTools.filter(t =>
    t.name === 'list_writing_styles' ||
    t.name === 'get_writing_style' ||
    t.name === 'save_writing_style_skill' ||
    t.name === 'update_writing_style',
  )
  const researcherTools = webTools

  return {
    tools: mainTools,
    subAgents: [
      buildPlannerSubAgent(plannerTools, input.language ?? 'en-US'),
      buildConsistencySubAgent(readOnlyTools, input.language ?? 'en-US'),
      buildExplorerSubAgent(explorerTools, input.language ?? 'en-US'),
      buildResearcherSubAgent([...researcherTools], input.language ?? 'en-US'),
      buildWritingStyleExtractorSubAgent([], input.language ?? 'en-US'),
      buildWritingStyleSkillCreatorSubAgent(writingStyleSkillCreatorTools, input.language ?? 'en-US'),
    ],
    interruptOn: CREATIVE_INTERRUPT_ON_CONFIG,
  }
}

export const CREATIVE_INTERRUPT_ON_CONFIG: Record<string, InterruptOnConfig> = {
  confirm_writing_plan:        { allowedDecisions: ['approve', 'edit', 'reject'] },
  write_to_chapter:            { allowedDecisions: ['approve', 'edit', 'reject'] },
  resolve_open_question:       { allowedDecisions: ['approve', 'edit', 'reject'] },
  create_chapter:              { allowedDecisions: ['approve', 'reject'] },
  delete_chapter:              { allowedDecisions: ['approve', 'reject'] },
  rename_chapter:              { allowedDecisions: ['approve', 'reject'] },
  reorder_chapters:            { allowedDecisions: ['approve', 'reject'] },
  replace_storybible_section:  { allowedDecisions: ['approve', 'reject'] },
  rebuild_storybible:          { allowedDecisions: ['approve', 'reject'] },
  compress_storybible_history: { allowedDecisions: ['approve', 'reject'] },
  git_commit:                  { allowedDecisions: ['approve', 'edit', 'reject'] },
  git_tag:                     { allowedDecisions: ['approve', 'reject'] },
  start_exploration:           { allowedDecisions: ['approve', 'reject'] },
  finish_exploration:          { allowedDecisions: ['approve', 'reject'] },
  promote_exploration:         { allowedDecisions: ['approve', 'edit', 'reject'] },
  delete_exploration:          { allowedDecisions: ['approve', 'reject'] },
  delete_writing_style:        { allowedDecisions: ['approve', 'reject'] },
}

export const CREATIVE_INTERRUPT_ON_NAMES = new Set(Object.keys(CREATIVE_INTERRUPT_ON_CONFIG))
