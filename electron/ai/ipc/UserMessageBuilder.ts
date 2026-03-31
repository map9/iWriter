import type { SendMessageRequest } from './protocol'
import { buildFilesystemMounts, describeFilesystemMounts } from '../runtime/FilesystemMounts'

export function buildUserMessage(req: SendMessageRequest): string {
  const parts: string[] = []
  const ctx = req.editorContext

  if (ctx.editorStateXml) {
    parts.push(ctx.editorStateXml)
  } else if (ctx.filePath || ctx.folderPath) {
    const stateLines: string[] = []
    if (ctx.filePath) stateLines.push(`<file path="${ctx.filePath}" dirty="${ctx.isDirty}" />`)
    if (ctx.folderPath) stateLines.push(`<workspace path="${ctx.folderPath}" />`)
    if (stateLines.length) {
      parts.push(`<editor_state change="full">\n${stateLines.join('\n')}\n</editor_state>`)
    }
  }

  if (req.attachments?.textFilePaths?.length) {
    parts.push(`<context_files>${req.attachments.textFilePaths.join('\n')}</context_files>`)
  }

  const filesystemRoots = describeFilesystemMounts(buildFilesystemMounts(ctx.folderPath, {
    textFilePaths: req.attachments?.textFilePaths ?? [],
    binaryFilePaths: req.attachments?.binaryFilePaths ?? [],
    directories: req.attachments?.directories ?? [],
  }))
  if (filesystemRoots) {
    parts.push(filesystemRoots)
  }

  parts.push(req.userText)
  return parts.join('\n\n')
}
