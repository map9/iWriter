import * as path from 'path'
import { CompositeBackend, FilesystemBackend } from 'deepagents'
import type { DomainAgentCapabilities } from '../types'
import type { FilesystemMount } from '../../runtime/FilesystemMounts'
import { buildCreativeTools } from '../../tools/CreativeTools'
import { buildCreativeAnalysisTools } from '../../tools/CreativeAnalysisTools'
import type { CreativeDb } from '../../db/CreativeDb'
import { WorkspaceFilesystemBackend } from '../../runtime/WorkspaceFilesystemBackend'
import type { SnapshotBroker } from '../../document/SnapshotBroker'

export function buildCreativeCapabilities(
  aiRootPath: string,
  mounts: FilesystemMount[],
  creativeDb: CreativeDb | null,
  snapshotBroker: SnapshotBroker,
): DomainAgentCapabilities {
  const workspaceMount = mounts.find(mount => mount.virtualPath === '/')
  const workspacePath = workspaceMount?.hostPath ?? null

  return {
    tools: [
      ...buildCreativeTools({ workspacePath, creativeDb, snapshotBroker }),
      ...buildCreativeAnalysisTools({ workspacePath, creativeDb, snapshotBroker }),
    ],
    skills: ['/skills/'],
    subAgents: [],
    backend: new CompositeBackend(
      new WorkspaceFilesystemBackend(workspacePath ?? path.join(aiRootPath, 'empty-fs')),
      {
        '/skills': new FilesystemBackend({
          rootDir: path.join(aiRootPath, 'skills'),
          virtualMode: true,
        }),
      },
    ),
    interruptOn: {
      confirm_writing_plan:       { allowedDecisions: ['approve', 'edit', 'reject'] },
      write_to_chapter:           { allowedDecisions: ['approve', 'edit', 'reject'] },
      replace_storybible_section: { allowedDecisions: ['approve', 'reject'] },
      rebuild_storybible:         { allowedDecisions: ['approve', 'reject'] },
    },
  }
}
