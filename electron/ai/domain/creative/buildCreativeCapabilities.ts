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
import type { CreativeDb } from '../../db/CreativeDb'
import { WorkspaceFilesystemBackend } from '../../runtime/WorkspaceFilesystemBackend'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { buildPlannerSubAgent } from './subAgents/planner'
import { buildConsistencySubAgent } from './subAgents/consistency'
import { buildExplorerSubAgent } from './subAgents/explorer'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'

export function buildCreativeCapabilities(
  aiRootPath: string,
  mounts: FilesystemMount[],
  creativeDb: CreativeDb | null,
  snapshotBroker: SnapshotBroker,
  language: DetectedInputLanguage = 'en-US',
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
  // CompositeBackend defines execute() and id getter (returns ""), which makes
  // isSandboxBackend() return true even when the default backend is not a sandbox.
  // Override id to undefined so isSandboxBackend returns false and the execute
  // tool is not injected into the creative agent.
  Object.defineProperty(backend, 'id', { get: () => undefined })

  const creativeTools = buildCreativeTools({ workspacePath, creativeDb, snapshotBroker })
  const explorationTools = buildCreativeExplorationTools({ workspacePath, creativeDb })
  const mainTools = [
    ...creativeTools,
    ...buildCreativeAnalysisTools({ workspacePath, creativeDb, snapshotBroker }),
    ...buildCreativeAdvisorTools({ workspacePath }),
    ...buildCreativeGitTools({ workspacePath }),
    ...explorationTools,
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

  return {
    tools: mainTools,
    skills: ['/skills/'],
    subAgents: [
      buildPlannerSubAgent(plannerTools, language),
      buildConsistencySubAgent(readOnlyTools, language),
      buildExplorerSubAgent(explorerTools, language),
    ],
    backend,
    interruptOn: {
      confirm_writing_plan:       { allowedDecisions: ['approve', 'edit', 'reject'] },
      write_to_chapter:           { allowedDecisions: ['approve', 'edit', 'reject'] },
      resolve_open_question:      { allowedDecisions: ['approve', 'edit', 'reject'] },
      create_chapter:             { allowedDecisions: ['approve', 'reject'] },
      delete_chapter:             { allowedDecisions: ['approve', 'reject'] },
      rename_chapter:             { allowedDecisions: ['approve', 'reject'] },
      reorder_chapters:           { allowedDecisions: ['approve', 'reject'] },
      replace_storybible_section: { allowedDecisions: ['approve', 'reject'] },
      rebuild_storybible:         { allowedDecisions: ['approve', 'reject'] },
      compress_storybible_history: { allowedDecisions: ['approve', 'reject'] },
      git_commit:                 { allowedDecisions: ['approve', 'edit', 'reject'] },
      git_tag:                    { allowedDecisions: ['approve', 'reject'] },
      start_exploration:          { allowedDecisions: ['approve', 'reject'] },
      finish_exploration:         { allowedDecisions: ['approve', 'reject'] },
      promote_exploration:        { allowedDecisions: ['approve', 'edit', 'reject'] },
      delete_exploration:         { allowedDecisions: ['approve', 'reject'] },
    },
  }
}
