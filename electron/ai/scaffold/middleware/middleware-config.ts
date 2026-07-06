// Phase 4 生产中间件统一配置常量。调优时改这里，不要散落到 AgentEngine。
// 注：createDeepAgent 已内置 SummarizationMiddleware（与 model-budget.ts 同源默认值），
// 不再单独配置 summarization 参数。

import { createMiddleware } from 'langchain'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

/**
 * Drop-in replacement for modelFallbackMiddleware that fires onFallback when a
 * backup model is successfully used, enabling IPC notification to the renderer.
 */
export function createInstrumentedFallbackMiddleware(
  fallbackModels: BaseChatModel[],
  onFallback: (fallbackModelId: string) => void,
) {
  return createMiddleware({
    name: 'instrumentedFallbackMiddleware',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapModelCall: async (request: any, handler: any) => {
      try {
        return await handler(request)
      } catch (primaryError) {
        for (let i = 0; i < fallbackModels.length; i++) {
          try {
            const result = await handler({ ...request, model: fallbackModels[i] })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const modelId = (fallbackModels[i] as any).modelName
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ?? (fallbackModels[i] as any).model
              ?? `fallback[${i}]`
            onFallback(String(modelId))
            return result
          } catch (fallbackError) {
            if (i === fallbackModels.length - 1) throw fallbackError
          }
        }
        throw primaryError
      }
    },
  })
}

export const MIDDLEWARE_CONFIG = {
  recursionLimit: 10000,
  modelCallLimit: {
    // creative 长 plan + 多轮 review 在 800-1200 calls 量级是常态，2000 留足边际
    threadLimit: 2000,
    runLimit: 200,
    exitBehavior: 'end' as const,
  },
  toolCallLimit: {
    threadLimit: 1000,
    runLimit: 200,
    exitBehavior: 'continue' as const,
  },
} as const
