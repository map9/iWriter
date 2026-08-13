import { open, readFile } from 'node:fs/promises'
import type { MessageContent } from '@langchain/core/messages'
import type { SendMessageRequest } from '@shared/ai/contracts'

interface AttachedImage {
  path: string
  mimeType: string
  data: string
}

type UserMessageInput = Pick<SendMessageRequest, 'userText' | 'attachments'>

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function detectImageMimeType(header: Uint8Array): string | null {
  if (
    header.length >= 8
    && header[0] === 0x89
    && header[1] === 0x50
    && header[2] === 0x4e
    && header[3] === 0x47
    && header[4] === 0x0d
    && header[5] === 0x0a
    && header[6] === 0x1a
    && header[7] === 0x0a
  ) return 'image/png'

  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg'
  }

  const ascii = Buffer.from(header).toString('ascii')
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif'
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp'
  if (ascii.startsWith('BM')) return 'image/bmp'

  return null
}

async function readAttachedImage(filePath: string): Promise<AttachedImage | null> {
  let handle
  try {
    handle = await open(filePath, 'r')
    const header = Buffer.alloc(12)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    const mimeType = detectImageMimeType(header.subarray(0, bytesRead))
    if (!mimeType) return null
  } catch {
    return null
  } finally {
    await handle?.close()
  }

  try {
    const bytes = await readFile(filePath)
    const mimeType = detectImageMimeType(bytes.subarray(0, 12))
    return mimeType ? { path: filePath, mimeType, data: bytes.toString('base64') } : null
  } catch {
    return null
  }
}

function buildTurnBindings(filePaths: string[], directories: string[]): string | null {
  if (!filePaths.length && !directories.length) return null

  const lines = ['<turn_bindings>']
  if (filePaths.length) {
    lines.push('  <attached_files>')
    for (const filePath of filePaths) {
      lines.push(`    <file path="${escapeXml(filePath)}" />`)
    }
    lines.push('  </attached_files>')
  }
  if (directories.length) {
    lines.push('  <attached_directories>')
    for (const directory of directories) {
      lines.push(`    <directory path="${escapeXml(directory)}" />`)
    }
    lines.push('  </attached_directories>')
  }
  lines.push('</turn_bindings>')
  return lines.join('\n')
}

export async function buildUserMessage(req: UserMessageInput): Promise<MessageContent> {
  const filePaths = req.attachments?.filePaths ?? []
  const classified = await Promise.all(filePaths.map(readAttachedImage))
  const images = classified.filter((image): image is AttachedImage => image !== null)
  const ordinaryFilePaths = filePaths.filter((_, index) => classified[index] === null)
  const turnBindings = buildTurnBindings(ordinaryFilePaths, req.attachments?.directories ?? [])
  const text = turnBindings ? `${req.userText}\n${turnBindings}` : req.userText

  if (!images.length) return text

  const content: Exclude<MessageContent, string> = [{ type: 'text', text }]
  for (const image of images) {
    content.push({ type: 'text', text: `\n<attached_image path="${escapeXml(image.path)}" />` })
    content.push({ type: 'image', mimeType: image.mimeType, data: image.data })
  }
  return content
}
