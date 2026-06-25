import { TEXT_EXTENSIONS } from '../../types/file-extension'
import type { FileInfo } from '../../types/file-operation'
import { pathUtils } from '../../utils/pathUtils'

export const DEFAULT_WORKSPACE_IGNORE_RULES = [
  '# One rule per line. Syntax is similar to .gitignore.',
  '.DS_Store',
  '**/.DS_Store',
  '.git/',
  'node_modules/',
  'dist/',
  'dist-electron/',
  'release/',
  'coverage/',
  '.vite/',
  '.cache/',
  'docs/.vitepress/dist/',
  'docs/.vitepress/.temp/',
  'docs/.vitepress/cache/',
].join('\n')

export const WORKSPACE_IGNORE_FILENAME = '.iwtignore'
export const GITIGNORE_FILENAME = '.gitignore'

export interface WorkspaceIgnoreRule {
  pattern: string
  negated: boolean
  directoryOnly: boolean
  anchoredToRoot: boolean
  basenameOnly: boolean
  regex: RegExp
}

export interface WorkspaceIgnoreMatcher {
  readonly rules: WorkspaceIgnoreRule[]
  ignores(relativePath: string, isDirectory: boolean): boolean
}

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

export function mergeWorkspaceIgnoreRules(...ruleSets: Array<string | undefined | null>): string {
  return ruleSets
    .map(ruleSet => (ruleSet ?? '').trim())
    .filter(Boolean)
    .join('\n')
}

export function buildWorkspaceIgnoreRules(options: {
  preferenceRules?: string | null
  gitignoreRules?: string | null
  workspaceRules?: string | null
  useGitignoreAsWorkspaceIgnore?: boolean | null
}): string {
  return mergeWorkspaceIgnoreRules(
    options.preferenceRules,
    options.useGitignoreAsWorkspaceIgnore === false ? undefined : options.gitignoreRules,
    options.workspaceRules
  )
}

function negatedRuleCanMatchDescendant(rule: WorkspaceIgnoreRule, directoryPath: string): boolean {
  if (!rule.negated) return false
  if (rule.basenameOnly) return true

  const normalizedDirectory = directoryPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const normalizedPattern = rule.pattern.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalizedDirectory || !normalizedPattern) return false

  if (normalizedPattern === normalizedDirectory || normalizedPattern.startsWith(`${normalizedDirectory}/`)) {
    return true
  }

  const firstSegment = normalizedPattern.split('/')[0] ?? ''
  if (!firstSegment || /[*?]/.test(firstSegment)) return true

  return normalizedDirectory === firstSegment || normalizedDirectory.startsWith(`${firstSegment}/`)
}

function trimInlineComment(line: string): string {
  let escaped = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '#') {
      if (index === 0 || /\s/.test(line[index - 1] ?? '')) {
        return line.slice(0, index).trim()
      }
    }
  }

  return line.trim()
}

function escapeRegexChar(char: string): string {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char
}

function globToRegexSource(glob: string): string {
  let source = ''

  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    const next = glob[index + 1]

    if (char === '*') {
      if (next === '*') {
        const afterNext = glob[index + 2]
        if (afterNext === '/') {
          source += '(?:.*/)?'
          index += 2
        } else {
          source += '.*'
          index += 1
        }
      } else {
        source += '[^/]*'
      }
      continue
    }

    if (char === '?') {
      source += '[^/]'
      continue
    }

    source += escapeRegexChar(char ?? '')
  }

  return source
}

function compileIgnoreRule(pattern: string): WorkspaceIgnoreRule {
  const negated = pattern.startsWith('!')
  const rawPattern = negated ? pattern.slice(1) : pattern
  const anchoredToRoot = rawPattern.startsWith('/')
  const directoryOnly = rawPattern.endsWith('/')
  const normalizedPattern = rawPattern.replace(/^\/+/, '').replace(/\/+$/, '')
  const basenameOnly = !normalizedPattern.includes('/')
  const patternSource = globToRegexSource(normalizedPattern)

  let regexSource: string

  if (directoryOnly) {
    if (anchoredToRoot) {
      regexSource = `^${patternSource}(?:/.*)?$`
    } else if (basenameOnly) {
      regexSource = `(?:^|.*\/)${patternSource}(?:/.*)?$`
    } else {
      regexSource = `(?:^|.*\/)${patternSource}(?:/.*)?$`
    }
  } else if (anchoredToRoot) {
    regexSource = `^${patternSource}$`
  } else if (basenameOnly) {
    regexSource = `(?:^|.*\/)${patternSource}$`
  } else {
    regexSource = `(?:^|.*\/)${patternSource}$`
  }

  return {
    pattern: normalizedPattern,
    negated,
    directoryOnly,
    anchoredToRoot,
    basenameOnly,
    regex: new RegExp(regexSource),
  }
}

export function parseWorkspaceIgnoreRules(rulesText?: string): WorkspaceIgnoreMatcher {
  const rules = (rulesText ?? '')
    .split(/\r?\n/)
    .map(line => trimInlineComment(line))
    .filter(Boolean)
    .map(line => compileIgnoreRule(line))

  return {
    rules,
    ignores(relativePath: string, isDirectory: boolean): boolean {
      const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
      if (!normalizedPath) return false

      let ignored = false

      for (const rule of rules) {
        if (rule.directoryOnly && !rule.regex.test(normalizedPath)) {
          continue
        }
        if (!rule.directoryOnly && !rule.regex.test(normalizedPath)) {
          continue
        }
        if (rule.directoryOnly && isDirectory === false && !normalizedPath.includes('/')) {
          continue
        }
        ignored = !rule.negated
      }

      return ignored
    }
  }
}

function parsePatternList(patternText?: string): RegExp[] {
  if (!patternText?.trim()) return []

  return patternText
    .split(/[\n,]/)
    .map(pattern => pattern.trim())
    .filter(Boolean)
    .map(pattern => {
      const normalized = pattern.replace(/^\/+/, '')
      const hasSlash = normalized.includes('/')
      const source = globToRegexSource(normalized)
      const regexSource = hasSlash
        ? `^(?:${source})$`
        : `(?:^|.*\/)${source}$`
      return new RegExp(regexSource)
    })
}

export function matchesPatternList(relativePath: string, patterns?: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const regexes = parsePatternList(patterns)

  if (!regexes.length) return true
  return regexes.some(regex => regex.test(normalizedPath))
}

export function shouldIncludeWorkspaceEntry(
  entry: Pick<WorkspaceEntry, 'relativePath' | 'isDirectory'>,
  matcher: WorkspaceIgnoreMatcher,
  includePattern?: string,
  excludePattern?: string
): boolean {
  if (matcher.ignores(entry.relativePath, entry.isDirectory)) {
    return false
  }

  if (!entry.isDirectory && includePattern?.trim() && !matchesPatternList(entry.relativePath, includePattern)) {
    return false
  }

  if (excludePattern?.trim()) {
    const excluded = parsePatternList(excludePattern).some(regex => regex.test(entry.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')))
    if (excluded) return false
  }

  return true
}

export function shouldTraverseWorkspaceDirectory(
  entry: Pick<WorkspaceEntry, 'relativePath' | 'isDirectory'>,
  matcher: WorkspaceIgnoreMatcher
): boolean {
  if (!entry.isDirectory) return false
  if (!matcher.ignores(entry.relativePath, true)) return true

  return matcher.rules.some(rule => negatedRuleCanMatchDescendant(rule, entry.relativePath))
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
  options: WalkWorkspaceOptions
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
  workspaceRoot: string
): Promise<WorkspaceEntry[]> {
  if (!window.electronAPI) return []

  const fileInfos = await window.electronAPI.getFiles(directoryPath)

  return fileInfos.map(fileInfo => toWorkspaceEntry(workspaceRoot, fileInfo))
}

export async function collectWorkspaceTextFiles(
  options: WalkWorkspaceOptions
): Promise<WorkspaceEntry[]> {
  const workspaceRoot = options.workspaceRoot
  const directoryPath = options.directoryPath ?? workspaceRoot
  const results: WorkspaceEntry[] = []
  const matcher = parseWorkspaceIgnoreRules(options.ignoreRulesText)
  async function walk(currentDirPath: string): Promise<void> {
    const entries = await getWorkspaceEntriesRaw(currentDirPath, workspaceRoot)

    await Promise.all(entries.map(async (entry) => {
      if (entry.isDirectory) {
        const shouldIncludeDirectory = shouldIncludeWorkspaceEntry(entry, matcher, undefined, options.excludePattern)
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
