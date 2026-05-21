import type { SendMessageRequest } from './protocol'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function buildUserMessage(req: SendMessageRequest): string {
  const parts: string[] = []
  const ctx = req.editorContext

  if (ctx.editorStateXml) {
    parts.push(ctx.editorStateXml)
  } else if (ctx.filePath || ctx.folderPath) {
    const stateLines: string[] = []
    if (ctx.filePath) stateLines.push(`<file path="${escapeXml(ctx.filePath)}" dirty="${ctx.isDirty}" />`)
    if (ctx.folderPath) stateLines.push(`<workspace path="${escapeXml(ctx.folderPath)}" />`)
    if (req.attachments?.textFilePaths?.length) {
      stateLines.push('<attached_files>')
      for (const filePath of req.attachments.textFilePaths) {
        stateLines.push(`  <file path="${escapeXml(filePath)}" />`)
      }
      stateLines.push('</attached_files>')
    }
    if (req.attachments?.directories?.length) {
      stateLines.push('<attached_dirs>')
      for (const dirPath of req.attachments.directories) {
        stateLines.push(`  <dir path="${escapeXml(dirPath)}" />`)
      }
      stateLines.push('</attached_dirs>')
    }
    if (stateLines.length) {
      parts.push(`<editor_state change="full">\n${stateLines.join('\n')}\n</editor_state>`)
    }
  }

  parts.push(req.userText)
  return parts.join('\n\n')
}
