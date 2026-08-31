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
            export { buildPdfTools } from './electron/ai/tools/common/PdfTools.ts'
            export { buildFindReferencesTool } from './electron/ai/tools/creative/FindReferences.ts'
            export { buildConfirmWritingPlanTool } from './electron/ai/tools/creative/ConfirmWritingPlan.ts'
            export { buildFinalizeChapterTool } from './electron/ai/tools/creative/FinalizeChapter.ts'
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

describe('host paths in model-facing tools', () => {
  it('rejects a relative document path instead of resolving it against the workspace', async () => {
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

    const result = await outlineTool.invoke({ file_path: 'chapter.md' }, runConfig(workspacePath))

    assert.match(result, /file_path must be an absolute path/i)
    assert.equal(requestedPath, undefined)
  })

  it('leaves deletion to the native DeepAgents filesystem middleware', async () => {
    const { buildFilesystemMutationTools } = await loadModule()

    assert.deepEqual(
      buildFilesystemMutationTools().map(tool => tool.name),
      ['rename_file', 'move_file'],
    )
  })

  it('rejects a relative PDF path before touching the filesystem', async () => {
    const { buildPdfTools } = await loadModule()
    const outlineTool = buildPdfTools().find(tool => tool.name === 'get_pdf_outline')

    const result = await outlineTool.invoke({ file_path: 'reference.pdf' }, runConfig('/project/book'))

    assert.match(result, /file_path must be an absolute path/i)
  })

  it('rejects a relative reference-search directory', async () => {
    const { buildFindReferencesTool } = await loadModule()
    const tool = buildFindReferencesTool({
      async requestSnapshot() {
        return null
      },
    })

    const result = await tool.invoke({ names: ['Alice'], directory_path: '.' }, runConfig('/project/book'))

    assert.match(result, /directory_path must be an absolute path/i)
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

  it('rejects a relative block-edit document path', async () => {
    const { buildEditProposalTools } = await loadModule()
    const editTool = buildEditProposalTools().find(tool => tool.name === 'edit_block')

    await assert.rejects(
      () => editTool.invoke({ block_id: 1, new_content: 'Updated', file_path: 'chapter.md' }),
      /absolute path or an untitled: virtual ID/i,
    )
  })

  it('allows an untitled document reference only in document edit tools', async () => {
    const { buildEditProposalTools } = await loadModule()
    const editTool = buildEditProposalTools().find(tool => tool.name === 'edit_block')

    const result = await editTool.invoke({
      block_id: 1,
      new_content: 'Updated',
      file_path: 'untitled:tab-1',
    })

    assert.match(result, /untitled:tab-1/)
  })

  it('rejects a relative create-document directory', async () => {
    const { buildEditProposalTools } = await loadModule()
    const createTool = buildEditProposalTools().find(tool => tool.name === 'create_document')

    await assert.rejects(
      () => createTool.invoke({ filename: 'notes.md', content: '', directory: 'notes' }),
      /directory must be an absolute path/i,
    )
  })

  it('rejects relative chapter paths in writing-session tools', async () => {
    const { buildConfirmWritingPlanTool, buildFinalizeChapterTool } = await loadModule()

    await assert.rejects(
      () => buildConfirmWritingPlanTool().invoke({ plan: 'Draft', target_files: ['manuscript/ch001.md'] }),
      /target_files must contain absolute paths/i,
    )
    await assert.rejects(
      () => buildFinalizeChapterTool().invoke({ chapter: 'manuscript/ch001.md' }),
      /chapter must be an absolute path/i,
    )
  })
})
