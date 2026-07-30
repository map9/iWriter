export interface DomainSummarizationProfile {
  domain: 'editing' | 'creative'
  domainStateInstructions: readonly string[]
}

const COMMON_STATE_INSTRUCTIONS = [
  'Current user goal, requested deliverable, scope, and explicit constraints.',
  'Completed work, pending work, blockers, and the exact next action.',
  'Confirmed decisions and facts that later reasoning depends on, with their source references.',
  'Applied, rejected, failed, or interrupted actions; never report a proposed action as completed.',
  'Open questions and alternatives that still require a user decision.',
] as const

export const EDITING_SUMMARIZATION_PROFILE: DomainSummarizationProfile = {
  domain: 'editing',
  domainStateInstructions: [
    'Target document paths, sections, block IDs, selections, and the requested edit operation.',
    'Review/proposal/approval state and which edits were actually applied, rejected, or failed.',
    'Exact wording, formatting, structural, and preservation constraints that govern the edit.',
    'Whether block IDs or previously read ranges became stale after an applied mutation.',
  ],
}

export const CREATIVE_SUMMARIZATION_PROFILE: DomainSummarizationProfile = {
  domain: 'creative',
  domainStateInstructions: [
    'Current creative stage, selected Playbook/task module, operation, object, scope, and deliverable.',
    'Separate confirmed project facts from candidates, rejected directions, and unresolved questions.',
    'Preserve causal links, information gaps, continuity constraints, and author-approved intent.',
    'Writing-session state, chapter/outline progress, and writer/reviewer findings or artifact paths.',
  ],
}

/**
 * DeepAgents replaces the single `{conversation}` placeholder with the old
 * message slice. Keep one common envelope so transport/checkpoint behavior
 * remains domain-neutral while each DomainStrategy supplies semantic fields.
 */
export function buildSummarizationPrompt(profile: DomainSummarizationProfile): string {
  const common = COMMON_STATE_INSTRUCTIONS.map(item => `- ${item}`).join('\n')
  const domain = profile.domainStateInstructions.map(item => `- ${item}`).join('\n')

  return `You are compacting an ongoing iWriter ${profile.domain} agent conversation.

Produce a concise working-state capsule for the next model call. This is hidden runtime context,
not a user-facing reply. Write in the user's primary language while preserving paths, identifiers,
quoted wording, and technical names exactly when they matter.

Return only Markdown with these sections:

## Current task
## Completed and pending
## Decisions and constraints
## Domain state
## Evidence and source references
## Missing, failed, and stale items
## Next action

Common preservation requirements:
${common}

${profile.domain} domain preservation requirements:
${domain}

Rules:
- Prefer compact bullets over narrative.
- Distinguish confirmed facts from inference. Do not invent missing state.
- Preserve source paths/sections beside extracted facts, but do not reproduce large source text or tool output.
- A deterministic context ledger is injected separately. Do not attempt to enumerate every read call.
- Recent messages are preserved separately. Do not waste space restating them unless needed to connect the task.
- If an earlier summary is present, carry forward still-relevant state from it.

Conversation to compact:
{conversation}`
}
