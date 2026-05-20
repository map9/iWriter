import * as path from 'path'
import { CompositeBackend, FilesystemBackend } from 'deepagents'
import type { DomainAgentCapabilities } from '../types'
import type { FilesystemMount } from '../../runtime/FilesystemMounts'
import { buildCreativeTools } from '../../tools/CreativeTools'
import { buildCreativeAnalysisTools } from '../../tools/CreativeAnalysisTools'
import { buildCreativeAdvisorTools } from '../../tools/CreativeAdvisorTools'
import { buildCreativeExplorationTools } from '../../tools/CreativeExplorationTools'
import { buildCreativeGitTools } from '../../tools/CreativeGitTools'
import { buildCreativeLogicTools } from '../../tools/CreativeLogicTools'
import { buildWebTools } from '../../tools/WebTools'
import { buildWritingStyleTools } from '../../tools/WritingStyleTools'
import type { CreativeDb } from '../../db/CreativeDb'
import { WorkspaceFilesystemBackend } from '../../runtime/WorkspaceFilesystemBackend'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { buildPlannerSubAgent } from './subAgents/planner'
import { buildConsistencySubAgent } from './subAgents/consistency'
import { buildExplorerSubAgent } from './subAgents/explorer'
import { buildResearcherSubAgent } from './subAgents/researcher'
import { buildWritingStyleExtractorSubAgent } from './subAgents/writingStyleExtractor'
import { buildWritingStyleSkillCreatorSubAgent } from './subAgents/writingStyleSkillCreator'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'

const CREATIVE_SKILL_SOURCES = ['/skills/', '/skills/writing-style/']

export function buildCreativeCapabilities(
  aiRootPath: string,
  mounts: FilesystemMount[],
  creativeDb: CreativeDb | null,
  snapshotBroker: SnapshotBroker,
  language: DetectedInputLanguage = 'en-US',
  onSkillsMutated?: () => void,
): DomainAgentCapabilities {
  const workspaceMount = mounts.find(mount => mount.virtualPath === '/')
  const workspacePath = workspaceMount?.hostPath ?? null

  const backend = new CompositeBackend(
    new WorkspaceFilesystemBackend(workspacePath ?? path.join(aiRootPath, 'empty-fs')),
    {
      '/skills/': new FilesystemBackend({
        rootDir: path.join(aiRootPath, 'skills'),
        virtualMode: true,
      }),
    },
  )
  const skillsRoot = path.join(aiRootPath, 'skills')
  const noop = () => {}
  const writingStyleTools = buildWritingStyleTools({
    skillsRoot,
    onSkillsMutated: onSkillsMutated ?? noop,
  })
  const webTools = buildWebTools()

  const creativeTools = buildCreativeTools({ workspacePath, creativeDb, snapshotBroker })
  const explorationTools = buildCreativeExplorationTools({ workspacePath, creativeDb })

  const mainWritingStyleTools = writingStyleTools.filter(t =>
    t.name === 'list_writing_styles' ||
    t.name === 'get_writing_style' ||
    t.name === 'update_writing_style' ||
    t.name === 'delete_writing_style',
  )

  const mainTools = [
    ...creativeTools,
    ...buildCreativeAnalysisTools({ workspacePath, creativeDb, snapshotBroker }),
    ...buildCreativeAdvisorTools({ workspacePath }),
    ...buildCreativeGitTools({ workspacePath }),
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
    ...buildCreativeLogicTools({ workspacePath }),
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
    skills: CREATIVE_SKILL_SOURCES,
    subAgents: [
      buildPlannerSubAgent(plannerTools, language),
      buildConsistencySubAgent(readOnlyTools, language),
      buildExplorerSubAgent(explorerTools, language),
      buildResearcherSubAgent(researcherTools, language),
      buildWritingStyleExtractorSubAgent([], language),
      buildWritingStyleSkillCreatorSubAgent(writingStyleSkillCreatorTools, language),
    ],
    backend,
    interruptOn: CREATIVE_INTERRUPT_ON_CONFIG,
  }
}

export const CREATIVE_INTERRUPT_ON_CONFIG = {
  confirm_writing_plan:        { allowedDecisions: ['approve', 'edit', 'reject'] as const },
  write_to_chapter:            { allowedDecisions: ['approve', 'edit', 'reject'] as const },
  resolve_open_question:       { allowedDecisions: ['approve', 'edit', 'reject'] as const },
  create_chapter:              { allowedDecisions: ['approve', 'reject'] as const },
  delete_chapter:              { allowedDecisions: ['approve', 'reject'] as const },
  rename_chapter:              { allowedDecisions: ['approve', 'reject'] as const },
  reorder_chapters:            { allowedDecisions: ['approve', 'reject'] as const },
  replace_storybible_section:  { allowedDecisions: ['approve', 'reject'] as const },
  rebuild_storybible:          { allowedDecisions: ['approve', 'reject'] as const },
  compress_storybible_history: { allowedDecisions: ['approve', 'reject'] as const },
  git_commit:                  { allowedDecisions: ['approve', 'edit', 'reject'] as const },
  git_tag:                     { allowedDecisions: ['approve', 'reject'] as const },
  start_exploration:           { allowedDecisions: ['approve', 'reject'] as const },
  finish_exploration:          { allowedDecisions: ['approve', 'reject'] as const },
  promote_exploration:         { allowedDecisions: ['approve', 'edit', 'reject'] as const },
  delete_exploration:          { allowedDecisions: ['approve', 'reject'] as const },
  delete_writing_style:        { allowedDecisions: ['approve', 'reject'] as const },
}

export const CREATIVE_INTERRUPT_ON_NAMES = new Set(Object.keys(CREATIVE_INTERRUPT_ON_CONFIG))
