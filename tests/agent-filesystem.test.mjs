import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { SystemMessage } from '@langchain/core/messages'
import { build } from 'esbuild'

const tempDirs = []
let modulePromise
const require = createRequire(import.meta.url)

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const buildDir = await mkdtemp(path.join(os.tmpdir(), 'iwriter-agent-filesystem-build-'))
      const outputPath = path.join(buildDir, 'agent-filesystem.cjs')
      tempDirs.push(buildDir)
      await build({
        entryPoints: ['electron/ai/scaffold/filesystem/AgentFilesystem.ts'],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile: outputPath,
      })
      return require(outputPath)
    })()
  }
  return modulePromise
}

after(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
})

describe('agent filesystem workspace context', () => {
  it('adds the real workspace absolute path to the filesystem system message', async () => {
    const { buildAgentFilesystem } = await loadModule()
    const workspacePath = path.join(os.tmpdir(), 'iWriter workspace', 'book')
    const aiRootPath = path.join(os.tmpdir(), 'iwriter-agent-filesystem-test')
    const scaffold = buildAgentFilesystem({ workspacePath, aiRootPath })
    tempDirs.push(...scaffold.tempDirs)

    const filesystemMiddleware = scaffold.middlewares.find(
      middleware => middleware.name === 'FilesystemMiddleware',
    )
    assert.ok(filesystemMiddleware, 'workspace context must use the native FilesystemMiddleware')

    let forwardedRequest
    await filesystemMiddleware.wrapModelCall(
      {
        systemMessage: new SystemMessage('base prompt'),
        messages: [],
        tools: [],
        state: {},
        runtime: {},
      },
      async request => {
        forwardedRequest = request
        return 'ok'
      },
    )

    assert.match(forwardedRequest.systemMessage.text, /Current Workspace/)
    assert.match(forwardedRequest.systemMessage.text, new RegExp(JSON.stringify(workspacePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(forwardedRequest.systemMessage.text, /absolute paths/i)
    assert.doesNotMatch(forwardedRequest.systemMessage.text, /workspace-relative/i)
  })

})
