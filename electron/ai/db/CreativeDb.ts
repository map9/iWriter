import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'

export interface CreativeSessionLog {
  id: number
  workspacePath: string
  endedAt: number
  fileHashes: Record<string, string>
}

export interface SessionDiff {
  has_previous_session: boolean
  added: string[]
  modified: string[]
  deleted: string[]
}

const dbCache = new Map<string, CreativeDb>()

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function walkMarkdownFiles(rootDir: string, relativeRoot = ''): string[] {
  const results: string[] = []
  const dirPath = path.join(rootDir, relativeRoot)
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const relativePath = normalizeRelativePath(path.join(relativeRoot, entry.name))
    const fullPath = path.join(rootDir, relativePath)
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(rootDir, relativePath))
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push(fullPath)
    }
  }
  return results
}

export function computeWorkspaceHashes(workspacePath: string): Record<string, string> {
  const hashes: Record<string, string> = {}
  const storyBiblePath = path.join(workspacePath, 'storybible.md')
  const draftPath = path.join(workspacePath, 'draft')
  const files = [
    ...(fs.existsSync(storyBiblePath) ? [storyBiblePath] : []),
    ...walkMarkdownFiles(draftPath),
  ]

  for (const filePath of files) {
    let content: Buffer
    try {
      content = fs.readFileSync(filePath)
    } catch {
      continue
    }
    const relativePath = normalizeRelativePath(path.relative(workspacePath, filePath))
    hashes[relativePath] = crypto.createHash('sha256').update(content).digest('hex')
  }
  return hashes
}

export function computeSessionDiff(
  previous: Record<string, string> | null,
  current: Record<string, string>,
): SessionDiff {
  if (!previous) {
    return {
      has_previous_session: false,
      added: Object.keys(current).sort(),
      modified: [],
      deleted: [],
    }
  }

  const previousKeys = new Set(Object.keys(previous))
  const currentKeys = new Set(Object.keys(current))
  const added = [...currentKeys].filter(key => !previousKeys.has(key)).sort()
  const deleted = [...previousKeys].filter(key => !currentKeys.has(key)).sort()
  const modified = [...currentKeys]
    .filter(key => previousKeys.has(key) && previous[key] !== current[key])
    .sort()

  return {
    has_previous_session: true,
    added,
    modified,
    deleted,
  }
}

export class CreativeDb {
  private db: Database.Database

  constructor(private workspacePath: string) {
    const dbDir = path.join(workspacePath, '.iwriter')
    fs.mkdirSync(dbDir, { recursive: true })
    this.db = new Database(path.join(dbDir, 'creative.db'))
    this.setup()
  }

  private setup(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_path TEXT NOT NULL,
        ended_at INTEGER NOT NULL,
        file_hashes TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_log_workspace_ended
        ON session_log(workspace_path, ended_at DESC);
    `)
  }

  getLastSession(workspacePath = this.workspacePath): CreativeSessionLog | null {
    const row = this.db
      .prepare('SELECT id, workspace_path, ended_at, file_hashes FROM session_log WHERE workspace_path = ? ORDER BY ended_at DESC LIMIT 1')
      .get(workspacePath) as { id: number; workspace_path: string; ended_at: number; file_hashes: string } | undefined
    if (!row) return null
    let fileHashes: Record<string, string> = {}
    try {
      const parsed = JSON.parse(row.file_hashes)
      fileHashes = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      fileHashes = {}
    }
    return {
      id: row.id,
      workspacePath: row.workspace_path,
      endedAt: row.ended_at,
      fileHashes,
    }
  }

  upsertSession(workspacePath = this.workspacePath, fileHashes = computeWorkspaceHashes(workspacePath)): void {
    const del = this.db.prepare('DELETE FROM session_log WHERE workspace_path = ?')
    const ins = this.db.prepare('INSERT INTO session_log (workspace_path, ended_at, file_hashes) VALUES (?, ?, ?)')
    this.db.transaction(() => {
      del.run(workspacePath)
      ins.run(workspacePath, Date.now(), JSON.stringify(fileHashes))
    })()
  }

  getSessionDiff(workspacePath = this.workspacePath): SessionDiff {
    const previous = this.getLastSession(workspacePath)
    const current = computeWorkspaceHashes(workspacePath)
    return computeSessionDiff(previous?.fileHashes ?? null, current)
  }
}

export function getCreativeDb(workspacePath: string): CreativeDb {
  const resolved = path.resolve(workspacePath)
  if (!dbCache.has(resolved)) {
    dbCache.set(resolved, new CreativeDb(resolved))
  }
  return dbCache.get(resolved)!
}
