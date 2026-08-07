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
## Retrieval keys

Common preservation requirements:
${common}

${profile.domain} domain preservation requirements:
${domain}

Rules:
- Prefer compact bullets over narrative.
- Distinguish confirmed facts from inference. Label conclusions as confirmed, inference, or open when the status matters. Do not invent missing state.
- Preserve source paths/sections beside extracted facts, but do not reproduce large source text or tool output. For every unresolved conflict, keep one compact evidence tuple with both conflicting facts, their exact sources, and any decisive value, wording, or counterevidence.
- A deterministic context ledger is injected separately. Record semantic results, not an inventory of read, search, or list calls.
- Recent messages are preserved separately. Do not waste space restating them unless needed to connect the task.
- If an earlier summary is present, treat it as mutable state to rewrite, not text to append. Replace superseded facts and remove resolved, stale, recent, or duplicate items.
- Each fact should appear in only one section. Refer to it briefly elsewhere instead of restating it.
- Do not list untouched or unread sources as missing unless they block the requested deliverable or could materially change the exact next action.
- Under "Retrieval keys", list 6-10 discriminative literal keys from this conversation. Prefer exact paths, block or scene IDs, names, and distinctive multi-word phrases; avoid generic single words when a lower-frequency key exists. Do not write prose there.

Conversation to compact:
{conversation}`
}
