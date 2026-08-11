import type { SnapshotBroker } from '../../document/SnapshotBroker'
import type { EditorStateBroker } from '../../document/EditorStateBroker'
import { buildEditorStateTool } from '../../tools/common/EditorStateTools'
import { buildDocumentTools } from '../../tools/common/DocumentTools'
import { buildEditProposalTools } from '../../tools/common/EditProposalTools'
import { buildFilesystemMutationTools } from '../../tools/common/FilesystemMutationTools'
import { buildWebTools } from '../../tools/common/WebTools'
import { buildPdfTools } from '../../tools/common/PdfTools'
import type { DomainAgentCapabilities } from '../types'
import type { InterruptOnConfig } from 'langchain'

export function buildEditCapabilities({
  snapshotBroker,
  editorStateBroker,
}: {
  snapshotBroker: SnapshotBroker
  editorStateBroker: EditorStateBroker
}): DomainAgentCapabilities {
  const docTools = buildDocumentTools(snapshotBroker)
  const editTools = buildEditProposalTools()
  const fsMutationTools = buildFilesystemMutationTools()
  const webTools = buildWebTools()
  const pdfTools = buildPdfTools()

  return {
    tools: [buildEditorStateTool(editorStateBroker), ...docTools, ...editTools, ...fsMutationTools, ...webTools, ...pdfTools],
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
