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
            import { z } from 'zod'
            import { tool } from '@langchain/core/tools'
            import { createChatModel } from './electron/ai/providers/ModelFactory.ts'

            export function bindProbeTool() {
              const model = createChatModel({
                id: 'gemini-test-provider',
                type: 'gemini',
                label: 'Gemini Test',
                apiKey: 'test-key',
                defaultModelId: 'gemini-test-model',
              }, {
                modelId: 'gemini-test-model',
                disableThinking: true,
              })

              return model.bindTools([
                tool(async () => '', {
                  name: 'probe_tool',
                  description: 'Probe tool',
                  schema: z.object({
                    value: z.number().int().positive().max(10),
                  }),
                }),
              ])
            }
          `,
          resolveDir: process.cwd(),
          loader: 'ts',
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

describe('Gemini tool schema compatibility', () => {
  it('removes unsupported exclusive numeric bounds from bound tool declarations', async () => {
    const { bindProbeTool } = await loadModule()

    const bound = bindProbeTool()
    const tools = bound.config.tools
    const valueSchema = tools[0].functionDeclarations[0].parameters.properties.value

    assert.equal(valueSchema.exclusiveMinimum, undefined)
    assert.equal(valueSchema.maximum, 10)
  })
})
