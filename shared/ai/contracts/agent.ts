export type AiAgentDomain = 'editing' | 'creative'

export type AiAgentMode = 'edit' | 'creative'

export type AiThinkingLevel = 'low' | 'medium' | 'high' | 'extra_high'

export type AiToolPermission = 'confirm' | 'allow' | 'deny'

export const DEFAULT_THINKING_LEVEL: AiThinkingLevel = 'medium'

export function normalizeThinkingLevel(level: string | undefined): AiThinkingLevel {
  if (level === 'low') return 'low'
  if (level === 'medium') return 'medium'
  if (level === 'high') return 'high'
  if (level === 'extra_high') return 'extra_high'
  return DEFAULT_THINKING_LEVEL
}

export function resolveAgentDomain(mode: AiAgentMode): AiAgentDomain {
  return mode === 'creative' ? 'creative' : 'editing'
}

export function getDefaultModeForDomain(domain: AiAgentDomain): AiAgentMode {
  return domain === 'creative' ? 'creative' : 'edit'
}

export function normalizeAgentMode(mode: string | undefined): AiAgentMode {
  if (mode === 'creative') return 'creative'
  if (mode === 'edit') return 'edit'
  return 'edit'
}

export function normalizeModeForDomain(
  mode: AiAgentMode | undefined,
  domain: AiAgentDomain,
): AiAgentMode {
  if (domain === 'creative') return 'creative'
  if (mode === 'edit') return mode
  return 'edit'
}
