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

            function provider(type, defaultModelId, presetId) {
              return {
                id: type + '-thinking-test',
                type,
                presetId,
                label: type,
                apiKey: 'test-key',
                defaultModelId,
              }
            }

            export function getDisabledThinkingConfigs() {
              const openai = createChatModel(
                provider('openai-compat', 'gpt-5.4', 'openai'),
                { modelId: 'gpt-5.4', disableThinking: true },
              )
              const anthropic = createChatModel(
                provider('anthropic', 'claude-sonnet-4-6'),
                { modelId: 'claude-sonnet-4-6', disableThinking: true },
              )
              const gemini25Flash = createChatModel(
                provider('gemini', 'gemini-2.5-flash'),
                { modelId: 'gemini-2.5-flash', disableThinking: true },
              )
              const gemini25Pro = createChatModel(
                provider('gemini', 'gemini-2.5-pro'),
                { modelId: 'gemini-2.5-pro', disableThinking: true },
              )
              const gemini31Pro = createChatModel(
                provider('gemini', 'gemini-3.1-pro-preview'),
                { modelId: 'gemini-3.1-pro-preview', disableThinking: true },
              )
              const gemini3Flash = createChatModel(
                provider('gemini', 'gemini-3-flash-preview'),
                { modelId: 'gemini-3-flash-preview', disableThinking: true },
              )

              return {
                openai: {
                  useResponsesApi: openai.useResponsesApi,
                  reasoning: openai.reasoning,
                },
                anthropic: {
                  thinking: anthropic.thinking,
                  maxTokens: anthropic.maxTokens,
                },
                gemini25Flash: gemini25Flash.thinkingConfig,
                gemini25Pro: gemini25Pro.thinkingConfig,
                gemini31Pro: gemini31Pro.thinkingConfig,
                gemini3Flash: gemini3Flash.thinkingConfig,
              }
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

  it('uses provider-supported no-thinking or minimum-thinking settings for summaries', async () => {
    const { getDisabledThinkingConfigs } = await loadModule()

    assert.deepEqual(getDisabledThinkingConfigs(), {
      openai: {
        useResponsesApi: true,
        reasoning: { effort: 'none' },
      },
      anthropic: {
        thinking: { type: 'disabled' },
        maxTokens: 2048,
      },
      gemini25Flash: { thinkingBudget: 0 },
      gemini25Pro: { thinkingBudget: 128 },
      gemini31Pro: { thinkingLevel: 'LOW' },
      gemini3Flash: { thinkingLevel: 'MINIMAL' },
    })
  })
})
