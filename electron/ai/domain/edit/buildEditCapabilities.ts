import * as path from 'path'
import { CompositeBackend, FilesystemBackend } from 'deepagents'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { AttachedFileBackend } from '../../runtime/AttachedFileBackend'
import type { FilesystemMount } from '../../runtime/FilesystemMounts'
import { buildDocumentTools } from '../../tools/DocumentTools'
import { buildEditProposalTools } from '../../tools/EditProposalTools'
import type { DomainAgentCapabilities } from '../types'

export function buildEditCapabilities(
  snapshotBroker: SnapshotBroker,
  aiRootPath: string,
  mounts: FilesystemMount[],
): DomainAgentCapabilities {
  const docTools = buildDocumentTools(snapshotBroker)
  const editTools = buildEditProposalTools()
  const workspaceMount = mounts.find(mount => mount.virtualPath === '/')
  const defaultBackend = new FilesystemBackend({
    rootDir: workspaceMount?.hostPath ?? path.join(aiRootPath, 'empty-fs'),
    virtualMode: true,
  })
  const routes = Object.fromEntries(
    mounts
      .filter(mount => mount.virtualPath !== '/')
      .map(mount => [
        mount.virtualPath,
        mount.kind === 'attached_file'
          ? new AttachedFileBackend(mount.hostPath)
          : new FilesystemBackend({ rootDir: mount.hostPath, virtualMode: true }),
      ])
  )

  return {
    tools: [...docTools, ...editTools],
    backend: new CompositeBackend(defaultBackend, routes),
    skills: [],
    interruptOn: {
      edit_block:      { allowedDecisions: ['approve', 'edit', 'reject'] },
      insert_block:    { allowedDecisions: ['approve', 'edit', 'reject'] },
      delete_block:    { allowedDecisions: ['approve', 'reject'] },
      replace_range:   { allowedDecisions: ['approve', 'edit', 'reject'] },
      create_document: { allowedDecisions: ['approve', 'edit', 'reject'] },
    },
  }
}
