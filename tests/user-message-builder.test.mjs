import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise
let tempDir

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/ipc/UserMessageBuilder.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return modulePromise
}

before(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'iwriter-user-message-'))
})

after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

function request(attachments) {
  return {
    userText: 'Compare the attached references.',
    domain: 'editing',
    mode: 'ask',
    workspacePath: '/workspace',
    attachments,
  }
}

describe('buildUserMessage', () => {
  it('keeps only file and directory attachments in minimal turn bindings', async () => {
    const textPath = path.join(tempDir, 'reference.md')
    const directoryPath = path.join(tempDir, 'sources')
    await writeFile(textPath, '# Reference')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(directoryPath)
    const { buildUserMessage } = await loadModule()

    const content = await buildUserMessage(request({
      filePaths: [textPath],
      directories: [directoryPath],
    }))

    assert.equal(content, [
      'Compare the attached references.',
      '<turn_bindings>',
      '  <attached_files>',
      `    <file path="${textPath}" />`,
      '  </attached_files>',
      '  <attached_directories>',
      `    <directory path="${directoryPath}" />`,
      '  </attached_directories>',
      '</turn_bindings>',
    ].join('\n'))
    assert.doesNotMatch(content, /workspace/)
  })

  it('recognizes an image by file signature and emits a multimodal image block', async () => {
    const imagePath = path.join(tempDir, 'cover-without-extension')
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    await writeFile(imagePath, pngBytes)
    const { buildUserMessage } = await loadModule()

    const content = await buildUserMessage(request({
      filePaths: [imagePath],
      directories: [],
    }))

    assert.deepEqual(content, [
      { type: 'text', text: 'Compare the attached references.' },
      { type: 'text', text: `\n<attached_image path="${imagePath}" />` },
      { type: 'image', mimeType: 'image/png', data: pngBytes.toString('base64') },
    ])
  })
})
