import { ContextOverflowError, getRetryable } from '@langchain/core/errors'
import {
  modelRetryMiddleware,
  type ModelRetryMiddlewareConfig,
} from 'langchain'

const DEFAULT_MAX_RETRIES = 2

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  const seen = new Set<unknown>()
  let current = error

  while (current && !seen.has(current) && chain.length < 12) {
    chain.push(current)
    seen.add(current)
    if (typeof current !== 'object') break
    const record = current as Record<string, unknown>
    current = record.cause ?? record.originalError ?? record.error
  }
  return chain
}

/**
 * LangChain middleware can wrap a provider error in one or more MiddlewareError
 * layers. Read the official retry mark from the whole cause chain so deterministic
 * failures (auth, context overflow, abort) are still stopped immediately.
 */
function shouldRetryModelError(error: Error): boolean {
  for (const candidate of errorChain(error)) {
    const marked = getRetryable(candidate)
    if (marked !== undefined) return marked
  }
  // Match LangChain's documented default: unclassified errors remain retryable.
  return true
}

/**
 * Provider-agnostic model resilience using LangChain's built-in retry middleware.
 * It owns the retry loop and sets per-call model maxRetries=0, preventing nested
 * SDK + agent retry multiplication.
 */
export function createModelNetworkRetryMiddleware(
  options: ModelRetryMiddlewareConfig = {},
) {
  return modelRetryMiddleware({
    maxRetries: DEFAULT_MAX_RETRIES,
    onFailure: 'error',
    ...options,
    retryOn: options.retryOn ?? shouldRetryModelError,
  })
}

function numericStatus(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/** Keep provider/SDK details in logs and show one actionable sentence in chat. */
export function toUserFacingModelError(error: unknown): string {
  const chain = errorChain(error)
  const records = chain.filter((item): item is Record<string, unknown> => (
    typeof item === 'object' && item !== null
  ))
  const statuses = records.flatMap(record => {
    const response = typeof record.response === 'object' && record.response !== null
      ? record.response as Record<string, unknown>
      : undefined
    const status = numericStatus(record.status)
      ?? numericStatus(record.statusCode)
      ?? numericStatus(response?.status)
    return status === undefined ? [] : [status]
  })
  const codes = records.flatMap(record => {
    const nested = typeof record.error === 'object' && record.error !== null
      ? record.error as Record<string, unknown>
      : undefined
    const code = record.code ?? nested?.code
    return typeof code === 'string' ? [code] : []
  })
  const text = chain.map(item => {
    if (item instanceof Error) return `${item.name}: ${item.message}`
    return typeof item === 'string' ? item : ''
  }).filter(Boolean).join('\n')

  if (chain.some(candidate => ContextOverflowError.isInstance(candidate))) {
    return '当前对话上下文过长，自动压缩后仍超出模型限制。请新建对话或缩小本次任务范围。'
  }
  if (statuses.some(status => status === 401 || status === 403)
    || /invalid api key|authentication|unauthorized|forbidden/i.test(text)) {
    return '模型服务认证失败。请检查当前提供商的 API Key 和访问权限。'
  }
  if (statuses.includes(402)
    || codes.some(code => /insufficient[_-]?(quota|balance)|billing|credit/i.test(code))
    || /insufficient (quota|balance)|out of credits|credit balance/i.test(text)) {
    return '模型服务额度不足。请检查账户余额或配额后重试。'
  }
  if (statuses.includes(429) || /rate limit|too many requests|tokens per min|\bTPM\b/i.test(text)) {
    return '模型服务当前繁忙或已达到频率限制，自动重试后仍未恢复。请稍后重试。'
  }
  if (statuses.some(status => status >= 500)) {
    return '模型服务暂时不可用，自动重试后仍未恢复。请稍后重试。'
  }
  if (statuses.includes(408) || /timed? ?out|etimeout|etimedout/i.test(text)) {
    return '模型请求超时，自动重试后仍未恢复。请检查网络连接，然后重试。'
  }
  if (codes.some(code => /ECONN|ENET|EAI_AGAIN|ENOTFOUND|EPIPE|UND_ERR/i.test(code))
    || /connection error|network error|fetch failed|socket hang up|terminated/i.test(text)) {
    return '网络连接不稳定，自动重试后仍未恢复。请检查网络连接，然后重试。'
  }

  const original = chain.slice().reverse().find((candidate: unknown) => candidate instanceof Error) as Error | undefined
  return original?.message ?? String(error)
}
