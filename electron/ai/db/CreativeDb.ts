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

export interface StoryBibleChangeInput {
  toolName: string
  targetPath: string
  wordDelta: number
  summary?: string
}

export interface StoryBibleChangeStats {
  totalWordDelta: number
  recordCount: number
  byTool: Record<string, { count: number; wordDelta: number }>
  oldestRecordedAt: number | null
  newestRecordedAt: number | null
}

export const STORYBIBLE_REBUILD_WORD_THRESHOLD = 2000

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
      CREATE TABLE IF NOT EXISTS storybible_change_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_path TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        target_path TEXT NOT NULL,
        word_delta INTEGER NOT NULL,
        summary TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_change_log_ws_recorded
        ON storybible_change_log(workspace_path, recorded_at DESC);
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

  recordStoryBibleChange(workspacePath: string, change: StoryBibleChangeInput): void {
    this.db
      .prepare(`
        INSERT INTO storybible_change_log
          (workspace_path, recorded_at, tool_name, target_path, word_delta, summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        workspacePath,
        Date.now(),
        change.toolName,
        change.targetPath,
        Math.trunc(change.wordDelta),
        change.summary ?? null,
      )

    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM storybible_change_log WHERE workspace_path = ?')
      .get(workspacePath) as { count: number } | undefined
    if ((row?.count ?? 0) > 1000) {
      this.db
        .prepare(`
          DELETE FROM storybible_change_log
          WHERE id IN (
            SELECT id FROM storybible_change_log
            WHERE workspace_path = ?
            ORDER BY recorded_at ASC, id ASC
            LIMIT 200
          )
        `)
        .run(workspacePath)
    }
  }

  getStoryBibleChangeStats(workspacePath = this.workspacePath, sinceTimestamp?: number): StoryBibleChangeStats {
    const params: Array<string | number> = [workspacePath]
    const sinceClause = typeof sinceTimestamp === 'number' ? 'AND recorded_at >= ?' : ''
    if (sinceClause) params.push(sinceTimestamp!)
    const rows = this.db
      .prepare(`
        SELECT tool_name, word_delta, recorded_at
        FROM storybible_change_log
        WHERE workspace_path = ? ${sinceClause}
        ORDER BY recorded_at ASC, id ASC
      `)
      .all(...params) as Array<{ tool_name: string; word_delta: number; recorded_at: number }>

    const byTool: StoryBibleChangeStats['byTool'] = {}
    let totalWordDelta = 0
    let oldestRecordedAt: number | null = null
    let newestRecordedAt: number | null = null
    for (const row of rows) {
      totalWordDelta += Math.abs(row.word_delta)
      const entry = byTool[row.tool_name] ?? { count: 0, wordDelta: 0 }
      entry.count += 1
      entry.wordDelta += Math.abs(row.word_delta)
      byTool[row.tool_name] = entry
      oldestRecordedAt = oldestRecordedAt === null ? row.recorded_at : Math.min(oldestRecordedAt, row.recorded_at)
      newestRecordedAt = newestRecordedAt === null ? row.recorded_at : Math.max(newestRecordedAt, row.recorded_at)
    }

    return {
      totalWordDelta,
      recordCount: rows.length,
      byTool,
      oldestRecordedAt,
      newestRecordedAt,
    }
  }

  clearStoryBibleChangeLog(workspacePath = this.workspacePath): void {
    this.db
      .prepare('DELETE FROM storybible_change_log WHERE workspace_path = ?')
      .run(workspacePath)
  }
}

export function getCreativeDb(workspacePath: string): CreativeDb {
  const resolved = path.resolve(workspacePath)
  if (!dbCache.has(resolved)) {
    dbCache.set(resolved, new CreativeDb(resolved))
  }
  return dbCache.get(resolved)!
}
