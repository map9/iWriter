import * as path from 'path'

export interface FilesystemMount {
  virtualPath: string
  hostPath: string
  kind: 'workspace' | 'attached_dir' | 'attached_file'
}

export interface AttachmentContext {
  textFilePaths?: string[]
  binaryFilePaths?: string[]
  directories?: string[]
}

function slugify(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'item'
}

export function buildFilesystemMounts(
  workspacePath: string | null,
  attachments?: AttachmentContext | null
): FilesystemMount[] {
  const mounts: FilesystemMount[] = []
  const used = new Set<string>()

  if (workspacePath) {
    mounts.push({
      virtualPath: '/',
      hostPath: workspacePath,
      kind: 'workspace',
    })
  }

  const addMount = (basePrefix: string, hostPath: string, kind: FilesystemMount['kind']) => {
    const slug = slugify(path.basename(hostPath))
    let candidate = `${basePrefix}/${slug}`
    let counter = 2
    while (used.has(candidate)) {
      candidate = `${basePrefix}/${slug}-${counter}`
      counter += 1
    }
    used.add(candidate)
    mounts.push({
      virtualPath: candidate,
      hostPath,
      kind,
    })
  }

  for (const dirPath of attachments?.directories ?? []) {
    addMount('/attached_dirs', dirPath, 'attached_dir')
  }

  const filePaths = [
    ...(attachments?.textFilePaths ?? []),
    ...(attachments?.binaryFilePaths ?? []),
  ]
  for (const filePath of filePaths) {
    addMount('/attached_files', filePath, 'attached_file')
  }

  return mounts
}

export function describeFilesystemMounts(mounts: FilesystemMount[]): string {
  if (!mounts.length) return ''
  const lines = mounts.map(mount => `${mount.virtualPath} -> ${mount.hostPath}`)
  return `<filesystem_roots>\n${lines.join('\n')}\n</filesystem_roots>`
}

