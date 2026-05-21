import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { buildDocumentTools } from '../../tools/DocumentTools'
import { buildEditProposalTools } from '../../tools/EditProposalTools'
import type { DomainAgentCapabilities } from '../types'
import type { InterruptOnConfig } from 'langchain'

export function buildEditCapabilities({
  snapshotBroker,
}: {
  snapshotBroker: SnapshotBroker
}): DomainAgentCapabilities {
  const docTools = buildDocumentTools(snapshotBroker)
  const editTools = buildEditProposalTools()

  return {
    tools: [...docTools, ...editTools],
    interruptOn: EDIT_INTERRUPT_ON_CONFIG,
  }
}

export const EDIT_INTERRUPT_ON_CONFIG: Record<string, InterruptOnConfig> = {
  edit_block:      { allowedDecisions: ['approve', 'edit', 'reject'] },
  insert_block:    { allowedDecisions: ['approve', 'edit', 'reject'] },
  delete_block:    { allowedDecisions: ['approve', 'reject'] },
  replace_range:   { allowedDecisions: ['approve', 'edit', 'reject'] },
  create_document: { allowedDecisions: ['approve', 'edit', 'reject'] },
}

export const EDIT_INTERRUPT_ON_NAMES = new Set(Object.keys(EDIT_INTERRUPT_ON_CONFIG))
