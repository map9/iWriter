export interface ThreadDraftState {
  localOnly: boolean
  active: boolean
  interrupted: boolean
}

/** A Thread remains a draft until its first turn has been accepted by main. */
export function isThreadDraft(state: ThreadDraftState): boolean {
  return state.localOnly && !state.active && !state.interrupted
}

export function formatThreadHeaderTitle(domainLabel: string, originalTitle: string): string {
  return `${domainLabel} | ${originalTitle}`
}
