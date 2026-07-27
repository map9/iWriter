/**
 * Hard per-request token ceiling — a TPM-safety backstop that is INDEPENDENT of the model's
 * context window. Summarization still triggers on the profile fraction (e.g. 0.85 × 1.05M ≈ 892k
 * for gpt-5.4), which is far above a typical org TPM budget (e.g. 500k/min); left unbounded, a
 * thread can grow until every request alone approaches the minute budget and trips a 429. When the
 * projected request (system + history + input) exceeds this ceiling we fail fast at turn start with
 * actionable guidance instead of hitting an opaque rate-limit.
 *
 * This is only the GLOBAL DEFAULT. It is overridable per provider via `AiProviderConfig.maxRequestTokens`
 * — raise it for high-TPM accounts or local models, lower it for tight budgets.
 */
export const HARD_REQUEST_CEILING_TOKENS = 250000
