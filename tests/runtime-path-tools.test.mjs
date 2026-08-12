import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { build } from 'esbuild'

const tempDirs = []
let modulePromise

async function createWorkspace() {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), 'iwriter-runtime-path-'))
  tempDirs.push(workspacePath)
  return workspacePath
}

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export { buildDocumentTools } from './electron/ai/tools/common/DocumentTools.ts'
            export { buildEditProposalTools } from './electron/ai/tools/common/EditProposalTools.ts'
            export { buildFilesystemMutationTools } from './electron/ai/tools/common/FilesystemMutationTools.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'runtime-path-tools-entry.ts',
        },
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

function runConfig(workspacePath) {
  return { context: { workspacePath } }
}

after(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
})

describe('runtime-relative paths in model-facing tools', () => {
  it('resolves a relative document path before requesting a live snapshot', async () => {
    const workspacePath = await createWorkspace()
    const filePath = path.join(workspacePath, 'chapter.md')
    await writeFile(filePath, '# Chapter')
    let requestedPath
    const snapshotBroker = {
      async requestSnapshot(pathToRead) {
        requestedPath = pathToRead
        return null
      },
    }
    const { buildDocumentTools } = await loadModule()
    const outlineTool = buildDocumentTools(snapshotBroker).find(tool => tool.name === 'get_document_outline')

    await outlineTool.invoke({ file_path: 'chapter.md' }, runConfig(workspacePath))

    assert.equal(requestedPath, filePath)
  })

  it('resolves a relative mutation path inside the workspace', async () => {
    const workspacePath = await createWorkspace()
    const filePath = path.join(workspacePath, 'obsolete.md')
    await writeFile(filePath, 'remove me')
    const { buildFilesystemMutationTools } = await loadModule()
    const deleteTool = buildFilesystemMutationTools().find(tool => tool.name === 'delete_file')

    const result = await deleteTool.invoke({ file_path: 'obsolete.md' }, runConfig(workspacePath))

    assert.equal(JSON.parse(result).path, filePath)
  })

  it('allows an explicit external absolute mutation path after HITL', async () => {
    const workspacePath = await createWorkspace()
    const externalRoot = await createWorkspace()
    const filePath = path.join(externalRoot, 'attachment-copy.md')
    await writeFile(filePath, 'remove me')
    const { buildFilesystemMutationTools } = await loadModule()
    const deleteTool = buildFilesystemMutationTools().find(tool => tool.name === 'delete_file')

    const result = await deleteTool.invoke({ file_path: filePath }, runConfig(workspacePath))

    assert.equal(JSON.parse(result).path, filePath)
  })

  it('requires an explicit document reference instead of falling back to the active tab', async () => {
    let requestCount = 0
    const snapshotBroker = {
      async requestSnapshot() {
        requestCount += 1
        return null
      },
    }
    const { buildDocumentTools } = await loadModule()
    const outlineTool = buildDocumentTools(snapshotBroker).find(tool => tool.name === 'get_document_outline')

    await assert.rejects(() => outlineTool.invoke({}, runConfig('/project/book')))
    assert.equal(requestCount, 0)
  })

  it('requires block edits to name their target document', async () => {
    const { buildEditProposalTools } = await loadModule()
    const editTool = buildEditProposalTools().find(tool => tool.name === 'edit_block')

    await assert.rejects(() => editTool.invoke({ block_id: 1, new_content: 'Updated' }))
  })
})
