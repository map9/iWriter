/**
 * FileBlockEditApplier — applies BlockEditProposals to .iwt files on disk.
 *
 * Used when a BlockEditProposal has `filePath` set (targeting a file on disk
 * rather than the active TipTap editor). Operates at the Markdown text level:
 *
 *   .iwt JSON  →  HTML  →  Markdown blocks  →  apply edit  →  Markdown  →  HTML  →  .iwt JSON
 */

import { marked } from 'marked'
import type { BlockEditProposal } from '@/types/ai'
import type { ApplyResult } from './BlockEditApplier'
import { htmlToMarkdown } from '@/import-export/formatConverter'
import {
  parseMarkdownBlocks,
  type FileBlock,
} from './FileDocumentView'

interface IwtJson {
  version?: string
  content?: string
  metadata?: Record<string, unknown>
}

/** Read, parse and return the .iwt JSON from disk. */
async function readIwtFile(filePath: string): Promise<IwtJson | null> {
  const raw = await window.electronAPI.readFile(filePath)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as IwtJson
  } catch {
    return null
  }
}

/** Serialize a FileBlock array back to Markdown. */
function blocksToMarkdown(blocks: FileBlock[]): string {
  return blocks.map(b => b.content).join('\n\n')
}

/**
 * Apply a block edit operation to the FileBlock array in place.
 * Returns an error string if the target block(s) cannot be found, or null on success.
 */
function applyToBlocks(blocks: FileBlock[], proposal: BlockEditProposal): string | null {
  switch (proposal.type) {
    case 'edit': {
      const { displayBlockId, newContent } = proposal
      if (displayBlockId === undefined || newContent === undefined) {
        return 'Missing displayBlockId or newContent'
      }
      const idx = blocks.findIndex(b => b.displayId === displayBlockId)
      if (idx === -1) {
        return `Block ${displayBlockId} not found in file. The file may have changed since it was last read.`
      }
      const existing = blocks[idx]!
      // Reconstruct full Markdown content preserving block type prefix:
      // - heading: re-add `# ` prefix  - list_item: already has `- ` / `1. ` prefix in parseMarkdownBlocks
      // - code, blockquote: content already includes fences/`>`
      // - paragraph/other: plain
      let fullContent: string
      if (existing.type === 'heading' && existing.level) {
        fullContent = `${'#'.repeat(existing.level)} ${newContent}`
      } else {
        // For paragraph, list_item, code, blockquote: LLM provides type-specific inline text.
        // For list_item the existing.content already has `- `; but edit_block strips it per tool spec.
        // Re-attach prefix by detecting from existing content.
        const listMatch = existing.content.match(/^([-*+] |\d+\.\s)/)
        const blockquoteMatch = existing.content.match(/^(>+\s?)/)
        if (listMatch) {
          fullContent = `${listMatch[1]}${newContent}`
        } else if (blockquoteMatch) {
          fullContent = `${blockquoteMatch[1]}${newContent}`
        } else {
          fullContent = newContent
        }
      }
      blocks[idx] = { ...existing, content: fullContent }
      return null
    }

    case 'insert': {
      const { displayBlockId: afterId, newContent } = proposal
      if (afterId === undefined || newContent === undefined) {
        return 'Missing displayBlockId or newContent'
      }
      const newBlocks = parseMarkdownBlocks(newContent)
      if (afterId === 0) {
        blocks.unshift(...newBlocks)
      } else {
        const idx = blocks.findIndex(b => b.displayId === afterId)
        if (idx === -1) {
          return `Block ${afterId} not found in file. The file may have changed since it was last read.`
        }
        blocks.splice(idx + 1, 0, ...newBlocks)
      }
      return null
    }

    case 'delete': {
      const { displayBlockId } = proposal
      if (displayBlockId === undefined) return 'Missing displayBlockId'
      const idx = blocks.findIndex(b => b.displayId === displayBlockId)
      if (idx === -1) {
        return `Block ${displayBlockId} not found in file. The file may have changed since it was last read.`
      }
      blocks.splice(idx, 1)
      return null
    }

    case 'replace_range': {
      const { startDisplayBlockId, endDisplayBlockId, newContent } = proposal
      if (startDisplayBlockId === undefined || endDisplayBlockId === undefined || newContent === undefined) {
        return 'Missing startDisplayBlockId, endDisplayBlockId, or newContent'
      }
      const startIdx = blocks.findIndex(b => b.displayId === startDisplayBlockId)
      const endIdx   = blocks.findIndex(b => b.displayId === endDisplayBlockId)
      if (startIdx === -1) {
        return `Block ${startDisplayBlockId} not found in file. The file may have changed since it was last read.`
      }
      if (endIdx === -1) {
        return `Block ${endDisplayBlockId} not found in file. The file may have changed since it was last read.`
      }
      if (startIdx > endIdx) {
        return `startDisplayBlockId (${startDisplayBlockId}) must be ≤ endDisplayBlockId (${endDisplayBlockId})`
      }
      const newBlocks = parseMarkdownBlocks(newContent)
      blocks.splice(startIdx, endIdx - startIdx + 1, ...newBlocks)
      return null
    }

    default:
      return `Unsupported proposal type: ${proposal.type}`
  }
}

/**
 * Apply a BlockEditProposal that targets a file on disk (proposal.filePath is set).
 * Reads the .iwt file, applies the block edit at the Markdown level, and writes back.
 */
export async function applyBlockEditToFile(proposal: BlockEditProposal): Promise<ApplyResult> {
  const filePath = proposal.filePath
  if (!filePath) return { success: false, error: 'No filePath on proposal' }

  if (!filePath.toLowerCase().endsWith('.iwt')) {
    return { success: false, error: 'File-based block edits only support .iwt files' }
  }

  // 1. Read and parse the .iwt file
  const iwt = await readIwtFile(filePath)
  if (!iwt) return { success: false, error: `Could not read file: ${filePath}` }

  const html = iwt.content ?? ''

  // 2. HTML → Markdown → FileBlock[]
  const markdown = htmlToMarkdown(html)
  const blocks = parseMarkdownBlocks(markdown)

  // 3. Apply the edit to the block array
  const editError = applyToBlocks(blocks, proposal)
  if (editError) return { success: false, error: editError }

  // 4. FileBlock[] → Markdown → HTML
  const updatedMarkdown = blocksToMarkdown(blocks)
  const updatedHtml = await marked(updatedMarkdown)

  // 5. Wrap back into .iwt JSON and save
  const iwtJson = JSON.stringify({
    version: iwt.version ?? '1.0.0',
    content: updatedHtml,
    metadata: {
      ...(iwt.metadata ?? {}),
      lastModified: new Date().toISOString(),
    },
  })

  const ok = await window.electronAPI.saveFile(iwtJson, filePath)
  if (!ok) return { success: false, error: `Failed to write file: ${filePath}` }

  return { success: true }
}
