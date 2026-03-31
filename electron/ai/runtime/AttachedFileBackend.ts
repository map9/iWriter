import * as fs from 'fs/promises'
import * as path from 'path'
import { FilesystemBackend } from 'deepagents'

export class AttachedFileBackend {
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

  private ensureFilePath(input?: string | null): string {
    const normalized = this.normalizeVirtualPath(input)
    if (normalized === '/' || normalized === this.allowedVirtualPath) {
      return this.allowedVirtualPath
    }
    throw new Error(`Access denied: path "${normalized}" is outside attached file scope.`)
  }

  async lsInfo(dirPath: string): Promise<any[]> {
    const normalized = this.normalizeVirtualPath(dirPath)
    if (normalized !== this.allowedDirPath) {
      throw new Error(`Access denied: directory "${normalized}" is outside attached file scope.`)
    }
    return [{
      path: this.allowedVirtualPath,
      name: this.fileName,
      is_dir: false,
    }]
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    return this.delegate.read(this.ensureFilePath(filePath), offset, limit)
  }

  async readRaw(filePath: string): Promise<any> {
    return this.delegate.readRaw(this.ensureFilePath(filePath))
  }

  async write(filePath: string, content: string): Promise<any> {
    return this.delegate.write(this.ensureFilePath(filePath), content)
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<any> {
    return this.delegate.edit(this.ensureFilePath(filePath), oldString, newString, replaceAll)
  }

  async grepRaw(pattern: string, searchPath?: string, glob?: string | null): Promise<any> {
    const normalized = this.normalizeVirtualPath(searchPath)
    if (normalized !== '/' && normalized !== this.allowedVirtualPath) {
      throw new Error(`Access denied: path "${normalized}" is outside attached file scope.`)
    }
    const result = await this.delegate.grepRaw(pattern, this.allowedVirtualPath, glob)
    if (typeof result === 'string') return result
    return result.filter((entry: any) => entry.path === this.allowedVirtualPath)
  }

  async globInfo(pattern: string, searchPath?: string): Promise<any[]> {
    const normalized = this.normalizeVirtualPath(searchPath)
    if (normalized !== '/' && normalized !== this.allowedVirtualPath) {
      throw new Error(`Access denied: path "${normalized}" is outside attached file scope.`)
    }
    const results = await this.delegate.globInfo(pattern, '/')
    return results.filter((entry: any) => entry.path === this.allowedVirtualPath)
  }

  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<any[]> {
    const results: any[] = []
    for (const [targetPath, content] of files) {
      const normalized = this.ensureFilePath(targetPath)
      await fs.writeFile(path.join(path.dirname(this.filePath), normalized.slice(1)), Buffer.from(content))
      results.push({ path: normalized, error: null })
    }
    return results
  }

  async downloadFiles(paths: string[]): Promise<any[]> {
    return Promise.all(paths.map(async requestedPath => {
      const normalized = this.ensureFilePath(requestedPath)
      const content = await fs.readFile(this.filePath)
      return { path: normalized, content, error: null }
    }))
  }
}

