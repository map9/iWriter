/**
 * Shared helpers for extracting values from the LangGraph runtime configurable.
 */

export function getRuntimeConfigurable(runtime: unknown): Record<string, unknown> {
  return ((runtime as { config?: { configurable?: Record<string, unknown> } })?.config?.configurable) ?? {}
}

export function getRuntimeString(runtime: unknown, key: string): string | null {
  const value = getRuntimeConfigurable(runtime)[key]
  return typeof value === 'string' ? value : null
}
