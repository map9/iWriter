import { createMiddleware } from 'langchain'

/**
 * RateLimitRetryMiddleware — honor provider rate-limit backoff instead of failing the turn.
 *
 * The underlying OpenAI SDK client is constructed with `maxRetries: 0` (@langchain/openai disables
 * SDK-level retries), and LangChain's own retry gives up quickly, so a transient 429 ("Rate limit
 * reached ... Please try again in 13.113s") bubbles up and kills the run. This wrapModelCall guard
 * catches rate-limit errors, waits out the provider-supplied `Retry-After` (or an exponential
 * backoff when none is given), and retries the same model call a bounded number of times. It sits
 * INNER of the fallback middleware, so a persistent limit still degrades to the fallback model.
 */

const DEFAULT_MAX_ATTEMPTS = 4
const DEFAULT_MAX_WAIT_MS = 60_000
const BASE_BACKOFF_MS = 2_000

/**
 * Abort-aware sleep. Resolves after `ms`, or immediately once `signal` aborts, so a user cancel is
 * felt right away instead of blocking on the full backoff. Returns whether it was cut short by abort.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(true)
  return new Promise<boolean>(resolve => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(false)
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Walk common error shapes (raw APIError, wrapped MiddlewareError, nested cause) for an HTTP status. */
function extractStatus(err: unknown): number | undefined {
  let cur: unknown = err
  for (let depth = 0; cur && typeof cur === 'object' && depth < 5; depth++) {
    const rec = cur as Record<string, unknown>
    const status = rec.status ?? rec.statusCode ?? (rec.response as Record<string, unknown> | undefined)?.status
    if (typeof status === 'number') return status
    cur = rec.cause ?? rec.error ?? rec.originalError
  }
  return undefined
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try { return JSON.stringify(err) } catch { return String(err) }
}

function isRateLimitError(err: unknown): boolean {
  if (extractStatus(err) === 429) return true
  return /rate limit|too many requests|tokens per min|\bTPM\b/i.test(errorText(err))
}

/** Prefer the provider's Retry-After header; else parse the "try again in Xs" hint; else 0. */
function retryAfterMs(err: unknown): number {
  let cur: unknown = err
  for (let depth = 0; cur && typeof cur === 'object' && depth < 5; depth++) {
    const rec = cur as Record<string, unknown>
    const headers = rec.headers as { get?: (k: string) => string | null } | Record<string, unknown> | undefined
    let raw: string | null | undefined
    if (headers && typeof (headers as { get?: unknown }).get === 'function') {
      raw = (headers as { get: (k: string) => string | null }).get('retry-after')
    } else if (headers && typeof headers === 'object') {
      raw = (headers as Record<string, string>)['retry-after']
    }
    if (raw != null) {
      const seconds = Number(raw)
      if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)
    }
    cur = rec.cause ?? rec.error ?? rec.originalError
  }
  const match = /try again in ([\d.]+)\s*s/i.exec(errorText(err))
  if (match) {
    const seconds = Number(match[1])
    if (Number.isFinite(seconds)) return Math.round(seconds * 1000)
  }
  return 0
}

export function createRateLimitRetryMiddleware(options?: {
  maxAttempts?: number
  maxWaitMs?: number
  onWait?: (waitMs: number, attempt: number) => void
}) {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS

  return createMiddleware({
    name: 'RateLimitRetry',
    wrapModelCall: async (request, handler) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signal = (request as any)?.runtime?.signal as AbortSignal | undefined
      let lastErr: unknown
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await handler(request)
        } catch (err) {
          lastErr = err
          if (attempt >= maxAttempts || !isRateLimitError(err) || signal?.aborted) throw err
          const hinted = retryAfterMs(err)
          // +1s cushion so we clear the window, then cap; fall back to exponential backoff.
          const waitMs = Math.min(hinted > 0 ? hinted + 1_000 : BASE_BACKOFF_MS * 2 ** (attempt - 1), maxWaitMs)
          options?.onWait?.(waitMs, attempt)
          console.warn(`[RateLimitRetry] rate limited; waiting ${waitMs}ms (attempt ${attempt}/${maxAttempts})`)
          // Abort-aware wait: on user cancel, stop backing off and surface the error immediately.
          const abortedDuringWait = await sleep(waitMs, signal)
          if (abortedDuringWait) throw err
        }
      }
      throw lastErr
    },
  })
}
