export const DEFAULT_WORKSPACE_IGNORE_RULES = [
  '# One rule per line. Syntax is similar to .gitignore.',
  '._*',
  '__MACOSX',
  '.DS_Store',
  '**/.DS_Store',
  '.git/',
  '.iwriter/',
].join('\n')

export const WORKSPACE_IGNORE_FILENAME = '.iwtignore'
export const GITIGNORE_FILENAME = '.gitignore'

export const GIT_METADATA_RELATIVE_PATHS = new Set([
  '.git/HEAD',
  '.git/index',
  '.git/MERGE_HEAD',
  '.git/packed-refs',
])

export function isGitMetadataRelativePath(relativePath: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  return GIT_METADATA_RELATIVE_PATHS.has(normalizedPath)
    || normalizedPath.startsWith('.git/refs/')
}

export type WorkspaceFilterScope = 'explorer' | 'search' | 'watcher'

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

export interface WorkspaceFilterEntry {
  relativePath: string
  isDirectory: boolean
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
  useGitignore?: boolean | null
}): string {
  return mergeWorkspaceIgnoreRules(
    options.preferenceRules,
    options.useGitignore === true ? options.gitignoreRules : undefined,
    options.workspaceRules,
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
    },
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
  entry: WorkspaceFilterEntry,
  matcher: WorkspaceIgnoreMatcher,
  includePattern?: string,
  excludePattern?: string,
): boolean {
  if (matcher.ignores(entry.relativePath, entry.isDirectory)) {
    return false
  }

  if (!entry.isDirectory && includePattern?.trim() && !matchesPatternList(entry.relativePath, includePattern)) {
    return false
  }

  if (excludePattern?.trim()) {
    const normalizedPath = entry.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
    if (parsePatternList(excludePattern).some(regex => regex.test(normalizedPath))) return false
  }

  return true
}

export function shouldTraverseWorkspaceDirectory(
  entry: WorkspaceFilterEntry,
  matcher: WorkspaceIgnoreMatcher,
): boolean {
  if (!entry.isDirectory) return false
  if (!matcher.ignores(entry.relativePath, true)) return true

  return matcher.rules.some(rule => negatedRuleCanMatchDescendant(rule, entry.relativePath))
}
