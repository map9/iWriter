import { TEXT_EXTENSIONS } from '../../types/file-extension'
import type { FileInfo } from '../../types/file-operation'
import { pathUtils } from '../../utils/pathUtils'
import {
  parseWorkspaceIgnoreRules,
  shouldIncludeWorkspaceEntry,
  shouldTraverseWorkspaceDirectory,
} from '../../../shared/workspace/filtering'

export * from '../../../shared/workspace/filtering'

export interface WorkspaceEntry extends FileInfo {
  relativePath: string
  isReadonly: boolean
  isHidden: boolean
}

export interface WalkWorkspaceOptions {
  workspaceRoot: string
  directoryPath?: string
  ignoreRulesText?: string
  includePattern?: string
  excludePattern?: string
  includeDirectories?: boolean
}

export function toWorkspaceRelativePath(workspaceRoot: string, filePath: string): string {
  const normalizedRoot = pathUtils.normalize(workspaceRoot)
  const normalizedPath = pathUtils.normalize(filePath)

  if (normalizedPath === normalizedRoot) return ''
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return pathUtils.basename(normalizedPath)

  return normalizedPath.slice(normalizedRoot.length + 1)
}

export function toWorkspaceEntry(workspaceRoot: string, fileInfo: FileInfo): WorkspaceEntry {
  const isHidden = fileInfo.isHidden ?? fileInfo.name.startsWith('.')
  const isReadonly = fileInfo.isWritable === false

  return {
    ...fileInfo,
    isHidden,
    isReadonly,
    relativePath: toWorkspaceRelativePath(workspaceRoot, fileInfo.path),
  }
}

export async function listWorkspaceEntries(
  directoryPath: string,
  options: WalkWorkspaceOptions,
): Promise<WorkspaceEntry[]> {
  if (!window.electronAPI) return []

  const rawEntries = await getWorkspaceEntriesRaw(directoryPath, options.workspaceRoot)
  const matcher = parseWorkspaceIgnoreRules(options.ignoreRulesText)

  return rawEntries.filter(entry => {
    if (options.includeDirectories === false && entry.isDirectory) return false
    return shouldIncludeWorkspaceEntry(entry, matcher, options.includePattern, options.excludePattern)
  })
}

export async function getWorkspaceEntriesRaw(
  directoryPath: string,
  workspaceRoot: string,
): Promise<WorkspaceEntry[]> {
  if (!window.electronAPI) return []

  const fileInfos = await window.electronAPI.getFiles(directoryPath)

  return fileInfos.map(fileInfo => toWorkspaceEntry(workspaceRoot, fileInfo))
}

export async function collectWorkspaceTextFiles(
  options: WalkWorkspaceOptions,
): Promise<WorkspaceEntry[]> {
  const workspaceRoot = options.workspaceRoot
  const directoryPath = options.directoryPath ?? workspaceRoot
  const results: WorkspaceEntry[] = []
  const matcher = parseWorkspaceIgnoreRules(options.ignoreRulesText)

  async function walk(currentDirPath: string): Promise<void> {
    const entries = await getWorkspaceEntriesRaw(currentDirPath, workspaceRoot)

    await Promise.all(entries.map(async (entry) => {
      if (entry.isDirectory) {
        const shouldIncludeDirectory = shouldIncludeWorkspaceEntry(
          entry,
          matcher,
          undefined,
          options.excludePattern,
        )
        if (!shouldIncludeDirectory) {
          if (matcher.ignores(entry.relativePath, true) && shouldTraverseWorkspaceDirectory(entry, matcher)) {
            await walk(entry.path)
          }
          return
        }
        await walk(entry.path)
        return
      }

      if (!shouldIncludeWorkspaceEntry(entry, matcher, options.includePattern, options.excludePattern)) {
        return
      }

      const ext = pathUtils.extension(entry.path)
      if ((TEXT_EXTENSIONS as readonly string[]).includes(ext)) {
        results.push(entry)
      }
    }))
  }

  await walk(directoryPath)
  return results
}
