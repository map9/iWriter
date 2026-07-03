export const FILE_CONTENT_CHANGED_ON_DISK_ERROR = 'FILE_CONTENT_CHANGED_ON_DISK'

export function computeFileContentHash(content: string): string {
  let hash = 2166136261

  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

export function hasUnexpectedDiskContent(content: string, expectedHash?: string): boolean {
  return !!expectedHash && computeFileContentHash(content) !== expectedHash
}

export function isSuspiciousEmptyExternalContent(content: string, lastSavedHash?: string): boolean {
  return content.length === 0 && hasUnexpectedDiskContent(content, lastSavedHash)
}

export function isFileContentChangedOnDiskError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(FILE_CONTENT_CHANGED_ON_DISK_ERROR)
}
