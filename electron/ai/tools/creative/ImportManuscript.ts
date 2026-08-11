/**
 * Physical manuscript import for the creative domain.
 *
 * The tool has two stages:
 *   - dry-run: mechanically convert the source and classify likely chapter, volume,
 *     and back-matter boundaries. Nothing is written.
 *   - execute: split only at author-confirmed chapter boundaries and apply explicit
 *     front/back-matter and collision policies.
 *
 * Reverse reconstruction of project, setting, characters, and outlines is handled
 * by the novel-import skill after the physical import.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { PandocService } from '../../../PandocService'
import { resolveRuntimePath } from '../../runtime/RuntimePathResolver'

type BoundaryConfidence = 'high' | 'medium'
type BoundaryKind = 'chapter' | 'volume' | 'front-matter' | 'back-matter'
type RetentionPolicy = 'preserve' | 'discard'
type CollisionPolicy = 'reject' | 'skip' | 'overwrite'

interface BoundaryCandidate {
  boundary_line: number
  kind: BoundaryKind
  title: string
  confidence: BoundaryConfidence
  preview: string
  context_before: string[]
  context_after: string[]
}

interface PlannedFile {
  path: string
  content: string
  kind: 'chapter' | 'front-matter' | 'back-matter'
}

const THEMATIC_BREAK = /^\s*([-*_])(\s*\1){2,}\s*$/
const CJK_NUMBER = '[0-9零一二三四五六七八九十百千万两廿卅〇○]+'
const ENGLISH_NUMBER = '(?:\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)'

function contextLines(lines: string[], index: number, direction: -1 | 1, limit = 2): string[] {
  const result: string[] = []
  for (
    let cursor = index + direction;
    cursor >= 0 && cursor < lines.length && result.length < limit;
    cursor += direction
  ) {
    const value = (lines[cursor] ?? '').trim()
    if (value) result.push(value.slice(0, 180))
  }
  return direction === -1 ? result.reverse() : result
}

function candidate(
  lines: string[],
  lineIndex: number,
  kind: BoundaryKind,
  title: string,
  confidence: BoundaryConfidence,
): BoundaryCandidate {
  return {
    boundary_line: lineIndex,
    kind,
    title: title.trim(),
    confidence,
    preview: (lines[lineIndex] ?? '').trim().slice(0, 180),
    context_before: contextLines(lines, lineIndex, -1),
    context_after: contextLines(lines, lineIndex, 1),
  }
}

function classifyExplicitTitle(title: string): Omit<BoundaryCandidate, 'boundary_line' | 'preview' | 'context_before' | 'context_after'> | null {
  const trimmed = title.trim()

  const cjkBackMatter = new RegExp(
    `^(?:附录(?:\\s*(?:${CJK_NUMBER}|[A-Za-z]))?|后记|跋|致谢|作者的话|作者后记|参考文献)(?:\\s*[:：—-]?\\s*.*)?$`,
    'i',
  ).exec(trimmed)
  const englishBackMatter = /^(?:appendix(?:\s+[a-z\d]+)?|afterword|acknowledg(?:e)?ments?|author'?s note|bibliography)(?:\s*[:—-]?\s*.*)?$/i.exec(trimmed)
  if (cjkBackMatter || englishBackMatter) {
    return { kind: 'back-matter', title: trimmed, confidence: 'high' }
  }

  const cjkFrontMatter = /^(?:扉页|版权页|目录|献词|前言|序言|自序)(?:\s*[:：—-]?\s*.*)?$/i.exec(trimmed)
  const englishFrontMatter = /^(?:title page|copyright|contents|table of contents|dedication|preface|foreword)(?:\s*[:—-]?\s*.*)?$/i.exec(trimmed)
  if (cjkFrontMatter || englishFrontMatter) {
    return { kind: 'front-matter', title: trimmed, confidence: 'high' }
  }

  const cjkVolume = new RegExp(
    `^(?:(第\\s*${CJK_NUMBER}\\s*[卷部篇])|([上中下终]\\s*篇)|(卷\\s*${CJK_NUMBER}))\\s*(.*)$`,
    'i',
  ).exec(trimmed)
  const englishVolume = new RegExp(`^((?:part|book)\\s+${ENGLISH_NUMBER})\\b\\.?\\s*(.*)$`, 'i').exec(trimmed)
  if (cjkVolume) {
    return {
      kind: 'volume',
      title: [cjkVolume[1] ?? cjkVolume[2] ?? cjkVolume[3], cjkVolume[4]].filter(Boolean).join(' ').trim(),
      confidence: 'high',
    }
  }
  if (englishVolume) {
    return {
      kind: 'volume',
      title: [englishVolume[1], englishVolume[2]].filter(Boolean).join(' ').trim(),
      confidence: 'high',
    }
  }

  const cjkChapter = new RegExp(`^(第\\s*${CJK_NUMBER}\\s*[章回])\\s*(.*)$`, 'i').exec(trimmed)
  const cjkNarrativeEdge = /^(序章|楔子|引子|终章|尾声|终曲)\s*(.*)$/i.exec(trimmed)
  const englishChapter = new RegExp(`^(chapter\\s+${ENGLISH_NUMBER})\\b\\.?\\s*(.*)$`, 'i').exec(trimmed)
  const englishNarrativeEdge = /^(prologue|epilogue|interlude)\b\.?\s*(.*)$/i.exec(trimmed)
  if (cjkChapter) {
    return {
      kind: 'chapter',
      title: [cjkChapter[1], cjkChapter[2]].filter(Boolean).join(' ').trim(),
      confidence: 'high',
    }
  }
  if (englishChapter) {
    return {
      kind: 'chapter',
      title: [englishChapter[1], englishChapter[2]].filter(Boolean).join(' ').trim(),
      confidence: 'high',
    }
  }
  if (cjkNarrativeEdge) {
    return {
      kind: 'chapter',
      title: [cjkNarrativeEdge[1], cjkNarrativeEdge[2]].filter(Boolean).join(' ').trim(),
      confidence: 'high',
    }
  }
  if (englishNarrativeEdge) {
    return {
      kind: 'chapter',
      title: [englishNarrativeEdge[1], englishNarrativeEdge[2]].filter(Boolean).join(' ').trim(),
      confidence: 'high',
    }
  }

  return null
}

// Heuristic boundary classification over Pandoc's GFM output. Line indices are zero-based.
export function detectBoundaryCandidates(lines: string[]): BoundaryCandidate[] {
  const candidates: BoundaryCandidate[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (THEMATIC_BREAK.test(line)) continue

    const atx = /^(#{1,2})\s+(.+?)\s*$/.exec(line)
    const visibleTitle = atx?.[2] ?? line
    const explicit = classifyExplicitTitle(visibleTitle)
    if (explicit) {
      candidates.push(candidate(lines, i, explicit.kind, explicit.title, explicit.confidence))
      continue
    }

    // An otherwise unclassified H1/H2 is retained as a high-confidence chapter
    // candidate for backward compatibility. The surrounding context lets the
    // author reject title pages and other false positives during confirmation.
    if (atx) {
      candidates.push(candidate(lines, i, 'chapter', atx[2] ?? '', 'high'))
      continue
    }

    const numbered = /^\s*(\d{1,4})[.、)]\s+(.+?)\s*$/.exec(line)
    const bareNumber = /^\s*(\d{1,4})\s*$/.exec(line)
    if (numbered) {
      candidates.push(candidate(lines, i, 'chapter', numbered[2] ?? '', 'medium'))
    } else if (bareNumber) {
      candidates.push(candidate(lines, i, 'chapter', bareNumber[1] ?? '', 'medium'))
    }
  }

  return candidates
}

// Kept as the chapter-only API used by earlier callers.
export function detectBoundaries(lines: string[]): BoundaryCandidate[] {
  return detectBoundaryCandidates(lines).filter(item => item.kind === 'chapter')
}

function convertedSlice(lines: string[], from: number, to: number): string {
  const content = lines.slice(from, to).join('\n').trim()
  return content ? `${content}\n` : ''
}

function hasNonBlankContent(lines: string[], from: number, to: number): boolean {
  return lines.slice(from, to).some(line => line.trim().length > 0)
}

async function convert(
  sourcePath: string,
  pandocPath: string | undefined,
): Promise<{ ok: true; lines: string[]; sourceFormat: string } | { ok: false; error: string }> {
  const trimmed = sourcePath?.trim()
  if (!trimmed) return { ok: false, error: 'Error: source_path is required and must be an absolute host path.' }
  if (!path.isAbsolute(trimmed)) return { ok: false, error: `Error: source_path must be an absolute host path, not "${trimmed}".` }

  const imported = await new PandocService().importFile({ inputPath: trimmed, pandocPath })
  if (!imported.success || imported.markdown === undefined) {
    return {
      ok: false,
      error: `Error: Pandoc import failed (${imported.errorCode ?? 'UNKNOWN'}): ${imported.error ?? 'no output'}`,
    }
  }
  return {
    ok: true,
    lines: imported.markdown.split('\n'),
    sourceFormat: imported.sourceFormat ?? 'unknown',
  }
}

function chapterFileName(index: number): string {
  return `ch${String(index).padStart(3, '0')}.md`
}

function invalidBoundaryLines(boundaries: number[], lineCount: number): number[] {
  return boundaries.filter(value => !Number.isInteger(value) || value < 0 || value >= lineCount)
}

async function existingPaths(files: PlannedFile[]): Promise<Set<string>> {
  const existing = new Set<string>()
  await Promise.all(files.map(async file => {
    try {
      await fs.access(file.path)
      existing.add(file.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }))
  return existing
}

export function buildImportManuscriptTool() {
  return tool(
    async ({
      source_path,
      target_directory,
      boundaries,
      volume_boundaries,
      filename_start,
      front_matter_policy,
      back_matter_start_line,
      back_matter_policy,
      collision_policy,
      pandoc_path,
    }: {
      source_path: string
      target_directory?: string
      boundaries?: number[]
      volume_boundaries?: number[]
      filename_start?: number
      front_matter_policy?: RetentionPolicy
      back_matter_start_line?: number
      back_matter_policy?: RetentionPolicy
      collision_policy?: CollisionPolicy
      pandoc_path?: string
    }, runtime) => {
      const resolvedSource = resolveRuntimePath(source_path, runtime, 'source_path')
      if (!resolvedSource.ok) return resolvedSource.error
      const sourcePath = resolvedSource.path
      const converted = await convert(sourcePath, pandoc_path)
      if (!converted.ok) return converted.error
      const { lines, sourceFormat } = converted
      const start = filename_start ?? 1
      if (!Number.isInteger(start) || start < 1) {
        return 'Error: filename_start must be a positive integer.'
      }

      // ── dry-run: classify likely boundaries and write nothing ──
      if (boundaries === undefined) {
        const detected = detectBoundaryCandidates(lines)
        const chapterCandidates = detected.filter(item => item.kind === 'chapter')
        const volumeCandidates = detected.filter(item => item.kind === 'volume')
        const frontMatterCandidates = detected.filter(item => item.kind === 'front-matter')
        const backMatterCandidates = detected.filter(item => item.kind === 'back-matter')
        const firstChapterLine = chapterCandidates[0]?.boundary_line

        return JSON.stringify({
          stage: 'dry-run',
          source_path: sourcePath,
          source_format: sourceFormat,
          conversion_notice:
            'The source was mechanically converted to Markdown by Pandoc. No prose passed through the model, but source formatting and edge whitespace may differ from the original file.',
          line_index_base: 0,
          total_lines: lines.length,
          has_front_matter:
            firstChapterLine !== undefined && hasNonBlankContent(lines, 0, firstChapterLine),
          candidate_count: chapterCandidates.length,
          candidates: chapterCandidates.map((item, index) => ({
            ...item,
            target_file: chapterFileName(start + index),
          })),
          volume_candidates: volumeCandidates,
          front_matter_candidates: frontMatterCandidates,
          back_matter_candidates: backMatterCandidates,
          low_confidence_lines: chapterCandidates
            .filter(item => item.confidence === 'medium')
            .map(item => item.boundary_line),
        }, null, 2)
      }

      // ── execute: validate the complete plan before writing anything ──
      if (!target_directory?.trim()) {
        return 'Error: target_directory is required for the execute stage (when boundaries is provided).'
      }
      const resolvedDirectory = resolveRuntimePath(target_directory, runtime, 'target_directory')
      if (!resolvedDirectory.ok) return resolvedDirectory.error
      const dir = resolvedDirectory.path

      const invalid = invalidBoundaryLines(boundaries, lines.length)
      if (invalid.length > 0) {
        return `Error: boundaries contains invalid zero-based line indices: ${invalid.join(', ')}.`
      }
      const sorted = [...new Set(boundaries)].sort((a, b) => a - b)
      if (sorted.length === 0) {
        return 'Error: boundaries must contain at least one confirmed chapter-start line index.'
      }

      const rawVolumeBoundaries = volume_boundaries ?? []
      const invalidVolumeLines = invalidBoundaryLines(rawVolumeBoundaries, lines.length)
      if (invalidVolumeLines.length > 0) {
        return `Error: volume_boundaries contains invalid zero-based line indices: ${invalidVolumeLines.join(', ')}.`
      }
      const sortedVolumeBoundaries = [...new Set(rawVolumeBoundaries)].sort((a, b) => a - b)
      const contentStarts = [...sorted]
      for (const volumeLine of sortedVolumeBoundaries) {
        if (sorted.includes(volumeLine)) {
          return `Error: line ${volumeLine} cannot be both a chapter boundary and a volume boundary.`
        }
        const nextChapterIndex = sorted.findIndex(chapterLine => chapterLine > volumeLine)
        if (nextChapterIndex < 0) {
          return `Error: volume boundary ${volumeLine} has no following chapter to attach to.`
        }
        const previousChapterLine = nextChapterIndex > 0 ? sorted[nextChapterIndex - 1]! : -1
        if (volumeLine <= previousChapterLine) {
          return `Error: volume boundary ${volumeLine} does not fall before a later chapter range.`
        }
        contentStarts[nextChapterIndex] = Math.min(contentStarts[nextChapterIndex]!, volumeLine)
      }

      const lastChapterStart = sorted[sorted.length - 1]!
      if (back_matter_start_line !== undefined) {
        if (
          !Number.isInteger(back_matter_start_line)
          || back_matter_start_line < 0
          || back_matter_start_line >= lines.length
        ) {
          return 'Error: back_matter_start_line must be a valid zero-based source line index.'
        }
        if (back_matter_start_line <= lastChapterStart) {
          return 'Error: back_matter_start_line must occur after the last confirmed chapter boundary.'
        }
        if (!back_matter_policy) {
          return 'Error: back_matter_policy must be explicitly set to preserve or discard when back_matter_start_line is provided.'
        }
      } else if (back_matter_policy !== undefined) {
        return 'Error: back_matter_start_line is required when back_matter_policy is provided.'
      }

      const firstContentStart = contentStarts[0]!
      const hasFrontMatter = hasNonBlankContent(lines, 0, firstContentStart)
      if (hasFrontMatter && !front_matter_policy) {
        return 'Error: front_matter_policy must be explicitly set to preserve or discard because content exists before the first chapter.'
      }

      const chapterEnd = back_matter_start_line ?? lines.length
      const emptyChapterStarts = contentStarts.filter((from, index) => {
        const to = index + 1 < contentStarts.length ? contentStarts[index + 1]! : chapterEnd
        return to <= from || !hasNonBlankContent(lines, from, to)
      })
      if (emptyChapterStarts.length > 0) {
        return `Error: confirmed boundaries produce empty or invalid chapters at line indices: ${emptyChapterStarts.join(', ')}.`
      }

      const planned: PlannedFile[] = []
      if (hasFrontMatter && front_matter_policy === 'preserve') {
        planned.push({
          path: path.join(dir, 'front-matter.md'),
          content: convertedSlice(lines, 0, firstContentStart),
          kind: 'front-matter',
        })
      }

      for (let index = 0; index < sorted.length; index++) {
        const from = contentStarts[index]!
        const to = index + 1 < contentStarts.length ? contentStarts[index + 1]! : chapterEnd
        planned.push({
          path: path.join(dir, chapterFileName(start + index)),
          content: convertedSlice(lines, from, to),
          kind: 'chapter',
        })
      }

      const hasBackMatter =
        back_matter_start_line !== undefined
        && hasNonBlankContent(lines, back_matter_start_line, lines.length)
      if (hasBackMatter && back_matter_policy === 'preserve') {
        planned.push({
          path: path.join(dir, 'back-matter.md'),
          content: convertedSlice(lines, back_matter_start_line!, lines.length),
          kind: 'back-matter',
        })
      }

      const policy = collision_policy ?? 'reject'
      const existing = await existingPaths(planned)
      if (existing.size > 0 && policy === 'reject') {
        return JSON.stringify({
          stage: 'execute',
          status: 'blocked-by-collision',
          collision_policy: policy,
          conflicts: [...existing],
          planned_files: planned.map(file => file.path),
          written_files: [],
          message: 'No files were written. Confirm a new target/numbering range or explicitly choose skip/overwrite.',
        }, null, 2)
      }

      await fs.mkdir(dir, { recursive: true })
      const written: string[] = []
      const skipped: string[] = []
      const overwritten: string[] = []

      for (const file of planned) {
        if (existing.has(file.path) && policy === 'skip') {
          skipped.push(file.path)
          continue
        }
        await fs.writeFile(file.path, file.content, 'utf8')
        written.push(file.path)
        if (existing.has(file.path)) overwritten.push(file.path)
      }

      return JSON.stringify({
        stage: 'execute',
        status: 'completed',
        source_format: sourceFormat,
        conversion_notice:
          'The source was mechanically converted to Markdown by Pandoc. No prose passed through the model, but source formatting and edge whitespace may differ from the original file.',
        collision_policy: policy,
        planned_files: planned.map(file => file.path),
        written_files: written,
        skipped_files: skipped,
        overwritten_files: overwritten,
        chapter_count: sorted.length,
        volume_boundaries_attached: sortedVolumeBoundaries,
        chapter_files_written: planned
          .filter(file => file.kind === 'chapter' && written.includes(file.path))
          .length,
        front_matter: hasFrontMatter
          ? (front_matter_policy === 'preserve' ? 'preserved' : 'discarded')
          : 'absent',
        back_matter: back_matter_start_line === undefined
          ? 'not-specified'
          : (hasBackMatter && back_matter_policy === 'preserve' ? 'preserved' : 'discarded-or-empty'),
      }, null, 2)
    },
    {
      name: 'import_manuscript',
      description:
        'Mechanically import an existing manuscript without sending its prose through the model. ' +
        'DRY-RUN: omit boundaries to convert via Pandoc and return separate chapter, volume, front-matter, and back-matter candidates with zero-based line indices and nearby context; writes nothing. ' +
        'EXECUTE: pass author-confirmed chapter boundaries, optional confirmed volume boundaries (attached to the following chapter), a target_directory, explicit front/back-matter decisions when applicable, numbering, and a collision policy. The tool validates the full plan before writing ch{NNN}.md plus optional front-matter.md/back-matter.md. ' +
        'Pandoc conversion can change source formatting or edge whitespace; this is mechanical preservation, not byte-for-byte identity. Reverse reconstruction is a separate skill step.',
      schema: z.object({
        source_path: z.string().describe('Workspace-relative or real absolute host path to the source manuscript file.'),
        boundaries: z
          .array(z.number().int().nonnegative())
          .optional()
          .describe('Author-confirmed zero-based chapter-start line indices. Omit for dry-run; pass for execute. Do not include volume or back-matter boundaries.'),
        volume_boundaries: z
          .array(z.number().int().nonnegative())
          .optional()
          .describe('Confirmed zero-based volume-heading lines. Each is preserved by attaching it to the following chapter file; never include these lines in boundaries.'),
        target_directory: z
          .string()
          .optional()
          .describe('Workspace-relative or real absolute host path of manuscript/. Required for execute; created if missing.'),
        filename_start: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Chapter number used for the first ch{NNN}.md file; defaults to 1.'),
        front_matter_policy: z
          .enum(['preserve', 'discard'])
          .optional()
          .describe('Required for execute when non-blank content exists before the first chapter. Preserve writes front-matter.md.'),
        back_matter_start_line: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Author-confirmed zero-based line at which non-chapter back matter begins; it must be after the final chapter boundary.'),
        back_matter_policy: z
          .enum(['preserve', 'discard'])
          .optional()
          .describe('Required with back_matter_start_line. Preserve writes back-matter.md; discard excludes it from the final chapter.'),
        collision_policy: z
          .enum(['reject', 'skip', 'overwrite'])
          .optional()
          .describe('How to handle target files that already exist. Defaults to reject, which writes nothing when any conflict exists.'),
        pandoc_path: z.string().optional().describe('Optional explicit path to the Pandoc executable.'),
      }),
    },
  )
}
