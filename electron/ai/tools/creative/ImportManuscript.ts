/**
 * ImportManuscript — creative-domain tool for physically importing an existing
 * manuscript into the workspace (FR-14.3 / novel-import / SS16 source-preparation).
 *
 * ONE two-stage tool, `import_manuscript(source, boundaries?)` (04.4 / 04.3 §189):
 *   - dry-run  (boundaries absent): convert the source via Pandoc and HEURISTICALLY
 *     detect candidate chapter boundaries (ATX headings, 第N章 / Chapter N patterns,
 *     numbering). Returns the candidate list for the LLM to sample-check and the
 *     author to confirm. Writes nothing.
 *   - execute  (boundaries present): split at the confirmed boundary lines, strip
 *     redundant blank lines, and write ch{NNN}.md straight to disk.
 * The prose goes from Pandoc to disk verbatim (逐字一致) — it never round-trips
 * through the model. The execute stage is approval-gated (interruptOn). Distilling
 * settings/characters/outline from the prose is a SEPARATE reverse-extraction step.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { PandocService } from '../../../PandocService'

interface BoundaryCandidate {
  boundary_line: number
  title: string
  confidence: 'high' | 'medium'
  preview: string
}

const THEMATIC_BREAK = /^\s*([-*_])(\s*\1){2,}\s*$/

// Heuristic chapter-start detection over Pandoc's gfm output lines (SS16 §258).
export function detectBoundaries(lines: string[]): BoundaryCandidate[] {
  const candidates: BoundaryCandidate[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (THEMATIC_BREAK.test(line)) continue // scene break, not a chapter boundary

    let title: string | null = null
    let confidence: 'high' | 'medium' | null = null

    const atx = /^(#{1,2})\s+(.+?)\s*$/.exec(line)
    const cjk = /^\s*(第\s*[0-9零一二三四五六七八九十百千两廿卅]+\s*[章回卷])\s*(.*)$/.exec(line)
    const eng = /^\s*((?:chapter|part|book)\s+[\divxlcdmIVXLCDM]+)\b\.?\s*(.*)$/i.exec(line)
    const numbered = /^\s*(\d{1,4})[.、)]\s+(.+?)\s*$/.exec(line)
    const bareNumber = /^\s*(\d{1,4})\s*$/.exec(line)

    if (atx) {
      title = atx[2] ?? ''
      confidence = 'high'
    } else if (cjk) {
      title = [cjk[1], cjk[2]].filter(Boolean).join(' ').trim()
      confidence = 'high'
    } else if (eng) {
      title = [eng[1], eng[2]].filter(Boolean).join(' ').trim()
      confidence = 'high'
    } else if (numbered) {
      title = numbered[2] ?? ''
      confidence = 'medium'
    } else if (bareNumber) {
      title = bareNumber[1] ?? ''
      confidence = 'medium'
    }

    if (title !== null && confidence !== null) {
      candidates.push({ boundary_line: i, title, confidence, preview: line.trim().slice(0, 120) })
    }
  }
  return candidates
}

function collapseBlankRuns(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n')
}

async function convert(
  sourcePath: string,
  pandocPath: string | undefined
): Promise<{ ok: true; lines: string[]; sourceFormat: string } | { ok: false; error: string }> {
  const trimmed = sourcePath?.trim()
  if (!trimmed) return { ok: false, error: 'Error: source_path is required and must be an absolute host path.' }
  if (!path.isAbsolute(trimmed)) return { ok: false, error: `Error: source_path must be an absolute host path, not "${trimmed}".` }

  const imported = await new PandocService().importFile({ inputPath: trimmed, pandocPath })
  if (!imported.success || imported.markdown === undefined) {
    return { ok: false, error: `Error: Pandoc import failed (${imported.errorCode ?? 'UNKNOWN'}): ${imported.error ?? 'no output'}` }
  }
  return { ok: true, lines: imported.markdown.split('\n'), sourceFormat: imported.sourceFormat ?? 'unknown' }
}

function chapterFileName(index: number): string {
  return `ch${String(index).padStart(3, '0')}.md`
}

export function buildImportManuscriptTool() {
  return tool(
    async ({ source_path, target_directory, boundaries, filename_start, pandoc_path }: {
      source_path: string
      target_directory?: string
      boundaries?: number[]
      filename_start?: number
      pandoc_path?: string
    }) => {
      const converted = await convert(source_path, pandoc_path)
      if (!converted.ok) return converted.error
      const { lines, sourceFormat } = converted
      const start = filename_start !== undefined ? Math.max(1, filename_start) : 1

      // ── dry-run: detect and return candidate boundaries, write nothing ──
      if (boundaries === undefined) {
        const candidates = detectBoundaries(lines)
        return JSON.stringify({
          stage: 'dry-run',
          source_path,
          source_format: sourceFormat,
          total_lines: lines.length,
          candidate_count: candidates.length,
          // Sample-check the low-confidence ones (read the text around them) and confirm
          // the list with the author, THEN call again with boundaries=[...line indices].
          candidates: candidates.map((c, i) => ({
            ...c,
            target_file: chapterFileName(start + i),
          })),
          low_confidence_lines: candidates.filter(c => c.confidence === 'medium').map(c => c.boundary_line),
        }, null, 2)
      }

      // ── execute: split at confirmed boundaries and write ──
      const dir = target_directory?.trim()
      if (!dir) return 'Error: target_directory is required for the execute stage (when boundaries is provided).'
      if (!path.isAbsolute(dir)) return `Error: target_directory must be an absolute host path, not "${dir}".`

      const sorted = [...new Set(boundaries)].filter(n => Number.isInteger(n) && n >= 0 && n < lines.length).sort((a, b) => a - b)
      if (sorted.length === 0) return 'Error: boundaries must contain at least one valid chapter-start line index (from the dry-run candidates).'

      await fs.mkdir(dir, { recursive: true })
      const written: string[] = []

      const preamble = collapseBlankRuns(lines.slice(0, sorted[0]).join('\n')).trim()
      if (preamble.length > 0) {
        const frontPath = path.join(dir, 'front-matter.md')
        await fs.writeFile(frontPath, preamble + '\n', 'utf8')
        written.push(frontPath)
      }

      for (let i = 0; i < sorted.length; i++) {
        const from = sorted[i]!
        const to = i + 1 < sorted.length ? sorted[i + 1]! : lines.length
        const content = collapseBlankRuns(lines.slice(from, to).join('\n')).trim() + '\n'
        const targetPath = path.join(dir, chapterFileName(start + i))
        await fs.writeFile(targetPath, content, 'utf8')
        written.push(targetPath)
      }

      return JSON.stringify({
        stage: 'execute',
        source_format: sourceFormat,
        written_files: written,
        chapter_count: sorted.length,
      }, null, 2)
    },
    {
      name: 'import_manuscript',
      description:
        'Physically import an existing manuscript into the workspace, in two stages of ONE tool. ' +
        'STAGE 1 dry-run (omit `boundaries`): converts the source (docx/odt/markdown/…) via Pandoc and returns HEURISTICALLY-detected candidate chapter boundaries (line index + title + confidence). Writes nothing — sample-check the low-confidence ones and confirm the boundary list with the author. ' +
        'STAGE 2 execute (pass `boundaries` = the confirmed chapter-start line indices + `target_directory`): splits at those lines and writes ch{NNN}.md verbatim (逐字一致 — the prose never passes back through the model); approval-gated; content before the first boundary goes to front-matter.md. ' +
        'Distilling settings/characters/outline from the prose is a separate reverse-extraction step, not this tool.',
      schema: z.object({
        source_path: z.string().describe('Real absolute host path to the source manuscript file.'),
        boundaries: z
          .array(z.number())
          .optional()
          .describe('Confirmed chapter-start line indices (from the dry-run candidates). OMIT for stage-1 dry-run detection; PASS for stage-2 execute.'),
        target_directory: z
          .string()
          .optional()
          .describe('Real absolute host path to write chapters into (e.g. the workspace manuscript/ dir). Required for execute (when boundaries is given); created if missing.'),
        filename_start: z.number().optional().describe('First chapter number for ch{NNN}.md naming (default 1).'),
        pandoc_path: z.string().optional().describe('Optional explicit path to the pandoc executable.'),
      }),
    }
  )
}
