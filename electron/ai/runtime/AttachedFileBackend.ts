import * as fs from 'fs/promises'
import * as path from 'path'
import { FilesystemBackend } from 'deepagents'
import type {
  BackendProtocolV2,
  EditResult,
  FileDownloadResponse,
  FileInfo,
  FileUploadResponse,
  GlobResult,
  GrepMatch,
  GrepResult,
  LsResult,
  ReadRawResult,
  ReadResult,
  WriteResult,
} from 'deepagents'

function hasPath(value: unknown): value is { path: string } {
  return !!value && typeof value === 'object' && typeof (value as { path?: unknown }).path === 'string'
}

function accessDenied(kind: 'path' | 'directory', value: string): string {
  return `Access denied: ${kind} "${value}" is outside attached file scope.`
}

export class AttachedFileBackend implements BackendProtocolV2 {
  private delegate: FilesystemBackend
  private allowedVirtualPath: string
  private allowedDirPath = '/'
  private fileName: string

  constructor(private readonly filePath: string) {
    this.fileName = path.basename(filePath)
    this.allowedVirtualPath = `/${this.fileName}`
    this.delegate = new FilesystemBackend({
      rootDir: path.dirname(filePath),
      virtualMode: true,
    })
  }

  private normalizeVirtualPath(input?: string | null): string {
    const raw = (input ?? '/').trim() || '/'
    if (raw === '/') return '/'
    const normalized = raw.replace(/\\/g, '/')
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  private resolveFilePath(input?: string | null): { ok: true; path: string } | { ok: false; error: string } {
    const normalized = this.normalizeVirtualPath(input)
    if (normalized === '/' || normalized === this.allowedVirtualPath) {
      return { ok: true, path: this.allowedVirtualPath }
    }
    return { ok: false, error: accessDenied('path', normalized) }
  }

  async ls(dirPath: string): Promise<LsResult> {
    const normalized = this.normalizeVirtualPath(dirPath)
    if (normalized !== this.allowedDirPath) {
      return { error: accessDenied('directory', normalized) }
    }
    return { files: [{
      path: this.allowedVirtualPath,
      name: this.fileName,
      is_dir: false,
    }] as FileInfo[] }
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<ReadResult> {
    const resolved = this.resolveFilePath(filePath)
    if (!resolved.ok) return { error: resolved.error }
    return this.delegate.read(resolved.path, offset, limit)
  }

  async readRaw(filePath: string): Promise<ReadRawResult> {
    const resolved = this.resolveFilePath(filePath)
    if (!resolved.ok) return { error: resolved.error }
    return this.delegate.readRaw(resolved.path)
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    const resolved = this.resolveFilePath(filePath)
    if (!resolved.ok) return { error: resolved.error, filesUpdate: null }
    return this.delegate.write(resolved.path, content)
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    const resolved = this.resolveFilePath(filePath)
    if (!resolved.ok) return { error: resolved.error, filesUpdate: null }
    return this.delegate.edit(resolved.path, oldString, newString, replaceAll)
  }

  async grep(pattern: string, searchPath?: string | null, glob?: string | null): Promise<GrepResult> {
    const normalized = this.normalizeVirtualPath(searchPath)
    if (normalized !== '/' && normalized !== this.allowedVirtualPath) {
      return { error: accessDenied('path', normalized) }
    }
    const result = await this.delegate.grep(pattern, this.allowedVirtualPath, glob)
    if (result.error) return result
    const matches = (result.matches ?? []).filter((entry: GrepMatch) => hasPath(entry) && entry.path === this.allowedVirtualPath)
    return { ...result, matches }
  }

  async glob(pattern: string, searchPath?: string): Promise<GlobResult> {
    const normalized = this.normalizeVirtualPath(searchPath)
    if (normalized !== '/' && normalized !== this.allowedVirtualPath) {
      return { error: accessDenied('path', normalized) }
    }
    const result = await this.delegate.glob(pattern, '/')
    if (result.error) return result
    const files = (result.files ?? []).filter((entry) => hasPath(entry) && entry.path === this.allowedVirtualPath)
    return { ...result, files }
  }

  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    const results: FileUploadResponse[] = []
    for (const [targetPath, content] of files) {
      const resolved = this.resolveFilePath(targetPath)
      if (!resolved.ok) {
        results.push({ path: targetPath, error: resolved.error })
        continue
      }
      await fs.writeFile(path.join(path.dirname(this.filePath), resolved.path.slice(1)), Buffer.from(content))
      results.push({ path: resolved.path, error: null })
    }
    return results
  }

  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    return Promise.all(paths.map(async requestedPath => {
      const resolved = this.resolveFilePath(requestedPath)
      if (!resolved.ok) {
        return { path: requestedPath, content: null, error: resolved.error }
      }
      const content = await fs.readFile(this.filePath)
      return { path: resolved.path, content, error: null }
    }))
  }
}
