import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let modulePromise

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export { ThreadRuntimeStore } from './electron/ai/runtime/ThreadRuntimeStore.ts'
            export { IWriterAgentContextSchema } from './electron/ai/runtime/AgentContext.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'runtime-context-store-entry.ts',
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

describe('ThreadRuntimeStore context boundary', () => {
  it('exposes only the hidden workspace path to model-facing tools', async () => {
    const { ThreadRuntimeStore } = await loadModule()
    const store = new ThreadRuntimeStore()
    store.setContext('thread-1', {
      workspacePath: '/project/book',
      language: 'zh-CN',
    })

    assert.deepEqual(store.buildContext('thread-1'), {
      workspacePath: '/project/book',
    })
  })

  it('rejects removed runtime context fields instead of silently stripping them', async () => {
    const { IWriterAgentContextSchema } = await loadModule()

    const result = IWriterAgentContextSchema.safeParse({
      workspacePath: '/project/book',
      activeFilePath: '/project/book/chapter.md',
    })

    assert.equal(result.success, false)
  })
})
