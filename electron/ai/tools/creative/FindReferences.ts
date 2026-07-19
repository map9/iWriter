/**
 * FindReferences — creative-domain read-only tool for building an object's full
 * mention/impact list before a restructure or a high-risk change (FR-6.2).
 *
 * This is a deterministic orchestration ON TOP OF the generic block-aware search
 * (same infra as search_in_directory): it runs one search per supplied alias,
 * unions the block-level hits per file, and reports which aliases hit nothing so
 * the caller can tell whether the impact list is complete. The failure mode it
 * removes is "missed an alias → impact list has a hole → a high-risk change is
 * approved against an incomplete blast radius". Alias RESOLUTION stays with the
 * caller (it read the character/worldbuilding files); this tool guarantees the
 * union/dedup across every alias is complete. Read-only — no approval gate.
 */

import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import { DocumentSearch, listWorkspaceDocumentPaths, type DocumentSearchOptions } from '../../document/DocumentSearch'

interface AggregatedBlock {
  block_id: number
  heading_block_id: number | null
  heading: string | null
  node_type: string
  match_count: number
  matched_names: Set<string>
  preview: string
}

interface AggregatedFile {
  file_path: string
  file_name: string
  total_matches: number
  matched_names: Set<string>
  blocks: Map<number, AggregatedBlock>
}

export function buildFindReferencesTool(snapshotBroker: SnapshotBroker) {
  return tool(
    async ({
      names,
      directory_path,
      case_sensitive,
      whole_word,
      regex,
      include_glob,
      exclude_glob,
      max_files,
    }: {
      names: string[]
      directory_path: string
      case_sensitive?: boolean
      whole_word?: boolean
      regex?: boolean
      include_glob?: string
      exclude_glob?: string
      max_files?: number
    }) => {
      const dir = directory_path?.trim()
      if (!dir) return 'Error: directory_path is required and must be an absolute host directory path.'
      if (!path.isAbsolute(dir)) {
        return `Error: directory_path must be an absolute host path, not "${dir}".`
      }
      if (!fs.existsSync(dir)) {
        return `Error: directory_path does not exist on disk: "${dir}".`
      }
      let stats: fs.Stats
      try {
        stats = fs.statSync(dir)
      } catch {
        return `Error: Could not stat directory_path: "${dir}".`
      }
      if (!stats.isDirectory()) {
        return `Error: directory_path must point to a directory: "${dir}".`
      }

      const searchNames = [...new Set((names ?? []).map(name => name.trim()).filter(Boolean))]
      if (searchNames.length === 0) {
        return 'Error: names must contain at least one non-empty term (the object plus all of its known aliases).'
      }

      const options: DocumentSearchOptions = {
        caseSensitive: case_sensitive,
        wholeWord: whole_word,
        regex,
      }
      const filePaths = listWorkspaceDocumentPaths(
        dir,
        include_glob,
        exclude_glob,
        max_files !== undefined ? Math.max(1, max_files) : 200
      )

      const perNameTotals = new Map<string, number>(searchNames.map(name => [name, 0]))
      const fileAgg = new Map<string, AggregatedFile>()

      for (const filePath of filePaths) {
        const snapshot = await snapshotBroker.requestSnapshot(filePath)
        if (!snapshot) continue
        for (const name of searchNames) {
          const result = DocumentSearch.searchDocumentBlocksRaw(snapshot, name, options, 200)
          if (!result?.matches?.length) continue
          perNameTotals.set(name, (perNameTotals.get(name) ?? 0) + result.total_matches)

          const existingFile = fileAgg.get(filePath)
          const file: AggregatedFile = existingFile ?? {
            file_path: filePath,
            file_name: filePath.split(/[\\/]/).pop() ?? filePath,
            total_matches: 0,
            matched_names: new Set<string>(),
            blocks: new Map<number, AggregatedBlock>(),
          }
          if (!existingFile) fileAgg.set(filePath, file)
          file.matched_names.add(name)

          for (const match of result.matches) {
            const existingBlock = file.blocks.get(match.block_id)
            const block: AggregatedBlock = existingBlock ?? {
              block_id: match.block_id,
              heading_block_id: match.heading_block_id ?? null,
              heading: match.heading ?? null,
              node_type: match.node_type,
              match_count: 0,
              matched_names: new Set<string>(),
              preview: match.preview,
            }
            if (!existingBlock) file.blocks.set(match.block_id, block)
            block.match_count += match.match_count
            block.matched_names.add(name)
            file.total_matches += match.match_count
          }
        }
      }

      const files = [...fileAgg.values()]
        .sort((a, b) => b.total_matches - a.total_matches)
        .map(file => ({
          file_path: file.file_path,
          file_name: file.file_name,
          total_matches: file.total_matches,
          matched_names: [...file.matched_names],
          blocks: [...file.blocks.values()]
            .sort((a, b) => b.match_count - a.match_count)
            .map(block => ({
              block_id: block.block_id,
              heading_block_id: block.heading_block_id,
              heading: block.heading,
              node_type: block.node_type,
              match_count: block.match_count,
              matched_names: [...block.matched_names],
              preview: block.preview,
            })),
        }))

      const namesWithNoHits = searchNames.filter(name => (perNameTotals.get(name) ?? 0) === 0)

      return JSON.stringify({
        object_names: searchNames,
        directory: dir,
        scanned_files: filePaths.length,
        matched_files: files.length,
        total_matches: files.reduce((sum, file) => sum + file.total_matches, 0),
        per_name_totals: Object.fromEntries(perNameTotals),
        // Aliases that matched nothing: either genuinely unused OR spelled differently in the
        // prose. Verify before treating the impact list as complete.
        names_with_no_hits: namesWithNoHits,
        files,
      }, null, 2)
    },
    {
      name: 'find_references',
      description:
        'Build the COMPLETE mention/impact list for one story object (a character, place, faction, rule, item) across a directory of documents, before a restructure or another high-risk change. ' +
        'Pass the object plus ALL its known aliases as `names`; the tool searches each, unions the block-level hits per file, and reports which aliases hit nothing. ' +
        'Resolve the aliases first by reading the object\'s character/worldbuilding file — a missing alias leaves a hole in the impact list. ' +
        'Read-only: it locates and aggregates mentions; it does not edit. ' +
        'Use search_in_directory for a single free-text query; use this when you need every reference to one object gathered and deduplicated.',
      schema: z.object({
        names: z
          .array(z.string())
          .describe('The object\'s canonical name plus every known alias/nickname/pronoun-noun (e.g. ["Elena", "the Duchess", "Lady Vareth"]). Resolve these from the object\'s file first.'),
        directory_path: z
          .string()
          .describe('Real absolute host path to the directory to scan (e.g. the manuscript/ dir, or the workspace root to include outline/characters too).'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search.'),
        whole_word: z.boolean().optional().describe('Match whole words only (recommended for short names to avoid substring noise).'),
        regex: z.boolean().optional().describe('Treat each name as a regular expression.'),
        include_glob: z.string().optional().describe('Optional wildcard include filter such as "manuscript/**/*.md".'),
        exclude_glob: z.string().optional().describe('Optional wildcard exclude filter such as "archive/**".'),
        max_files: z.number().optional().describe('Maximum number of files to scan (default: 200).'),
      }),
    }
  )
}
