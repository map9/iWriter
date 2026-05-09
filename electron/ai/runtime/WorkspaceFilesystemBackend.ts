import * as path from 'path'
import { FilesystemBackend } from 'deepagents'
import type {
  BackendProtocol,
  EditResult,
  FileData,
  FileDownloadResponse,
  FileInfo,
  FileUploadResponse,
  GrepMatch,
  WriteResult,
} from 'deepagents'

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function normalizeVirtualPath(value: string | null | undefined): string {
  const raw = toPosixPath(value || '/').trim()
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withSlash.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
}

function normalizeHostPath(value: string): string {
  return toPosixPath(path.resolve(value)).replace(/\/+$/, '')
}

function isSameOrInsidePath(filePath: string, rootPath: string): boolean {
  const normalizedFile = normalizeHostPath(filePath)
  const normalizedRoot = normalizeHostPath(rootPath)
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}/`)
}

function firstPathSegment(value: string): string | null {
  const normalized = toPosixPath(value).replace(/^\/+/, '')
  return normalized.split('/').find(Boolean) ?? null
}

function startsWithRelativeSegment(value: string, segment: string): boolean {
  const normalized = toPosixPath(value).trim().replace(/^\/+/, '')
  return normalized === segment || normalized.startsWith(`${segment}/`)
}

/**
 * deepagents' FilesystemBackend uses virtual absolute paths when virtualMode is
 * enabled. This adapter also accepts real host absolute paths inside workspace,
 * then maps them back to the equivalent virtual path before delegating.
 */
export class WorkspaceFilesystemBackend implements BackendProtocol {
  private delegate: FilesystemBackend
  private rootPath: string
  private hostRootSegment: string | null

  constructor(rootDir: string) {
    this.rootPath = normalizeHostPath(rootDir)
    this.hostRootSegment = firstPathSegment(this.rootPath)
    this.delegate = new FilesystemBackend({ rootDir: this.rootPath, virtualMode: true })
  }

  private toBackendPath(input: string | null | undefined): { ok: true; path: string } | { ok: false; error: string } {
    const raw = (input || '/').trim()

    if (raw && path.isAbsolute(raw) && isSameOrInsidePath(raw, this.rootPath)) {
      const relativePath = toPosixPath(path.relative(this.rootPath, path.resolve(raw)))
      return { ok: true, path: relativePath ? `/${relativePath}` : '/' }
    }

    // Fail fast for reserved virtual roots so they cannot silently fall back to
    // workspace-relative paths like "<workspace>/skills/...".
    if (!path.isAbsolute(raw) && startsWithRelativeSegment(raw, 'skills')) {
      return {
        ok: false,
        error: `Error: reserved virtual path must be absolute: ${raw}. Use /skills/... instead.`,
      }
    }

    const virtualPath = normalizeVirtualPath(raw)
    const segment = firstPathSegment(virtualPath)
    if (this.hostRootSegment && segment === this.hostRootSegment) {
      return {
        ok: false,
        error: `Error: path is outside the current workspace: ${raw}`,
      }
    }

    return { ok: true, path: virtualPath }
  }

  private isCreativeWriteAllowed(virtualPath: string): boolean {
    if (virtualPath === '/storybible.md') return true
    return virtualPath.startsWith('/draft/') && virtualPath.toLowerCase().endsWith('.md')
  }

  async lsInfo(dirPath: string): Promise<FileInfo[]> {
    const resolved = this.toBackendPath(dirPath)
    if (!resolved.ok) return []
    return this.delegate.lsInfo(resolved.path)
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    const resolved = this.toBackendPath(filePath)
    if (!resolved.ok) return resolved.error
    return this.delegate.read(resolved.path, offset, limit)
  }

  async readRaw(filePath: string): Promise<FileData> {
    const resolved = this.toBackendPath(filePath)
    if (!resolved.ok) throw new Error(resolved.error)
    return this.delegate.readRaw(resolved.path)
  }

  async grepRaw(pattern: string, searchPath?: string | null, glob?: string | null): Promise<GrepMatch[] | string> {
    const resolved = this.toBackendPath(searchPath || '/')
    if (!resolved.ok) return []
    return this.delegate.grepRaw(pattern, resolved.path, glob)
  }

  async globInfo(pattern: string, searchPath?: string): Promise<FileInfo[]> {
    const resolved = this.toBackendPath(searchPath || '/')
    if (!resolved.ok) return []
    return this.delegate.globInfo(pattern, resolved.path)
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    const resolved = this.toBackendPath(filePath)
    if (!resolved.ok) return { error: resolved.error, filesUpdate: null }
    if (!this.isCreativeWriteAllowed(resolved.path)) {
      return { error: 'Error: creative agents may only write to storybible.md or draft/**/*.md via creative tools.', filesUpdate: null }
    }
    return this.delegate.write(resolved.path, content)
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    const resolved = this.toBackendPath(filePath)
    if (!resolved.ok) return { error: resolved.error, filesUpdate: null }
    if (!this.isCreativeWriteAllowed(resolved.path)) {
      return { error: 'Error: creative agents may only write to storybible.md or draft/**/*.md via creative tools.', filesUpdate: null }
    }
    return this.delegate.edit(resolved.path, oldString, newString, replaceAll)
  }

  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    const mapped: Array<[string, Uint8Array]> = []
    const positions: number[] = []
    const responses: FileUploadResponse[] = files.map(([filePath]) => ({ path: filePath, error: 'invalid_path' }))

    files.forEach(([filePath, content], index) => {
      const resolved = this.toBackendPath(filePath)
      if (!resolved.ok) return
      mapped.push([resolved.path, content])
      positions.push(index)
    })

    const uploaded = await this.delegate.uploadFiles(mapped)
    uploaded.forEach((response, index) => {
      const originalIndex = positions[index]
      responses[originalIndex] = { ...response, path: files[originalIndex][0] }
    })
    return responses
  }

  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const mapped: string[] = []
    const positions: number[] = []
    const responses: FileDownloadResponse[] = paths.map(filePath => ({
      path: filePath,
      content: null,
      error: 'invalid_path',
    }))

    paths.forEach((filePath, index) => {
      const resolved = this.toBackendPath(filePath)
      if (!resolved.ok) return
      mapped.push(resolved.path)
      positions.push(index)
    })

    const downloaded = await this.delegate.downloadFiles(mapped)
    downloaded.forEach((response, index) => {
      const originalIndex = positions[index]
      responses[originalIndex] = { ...response, path: paths[originalIndex] }
    })
    return responses
  }
}
