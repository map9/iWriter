export interface RuntimeSelectionDecision {
  status: 'committed' | 'pending' | 'rejected'
  compatible: boolean
}

export interface RuntimeSelectionControllerDeps<TSelection> {
  request(selection: TSelection): Promise<RuntimeSelectionDecision>
  apply(selection: TSelection, status: 'committed' | 'pending'): void
}

export interface RuntimeSelectionResult {
  accepted: boolean
  stale: boolean
  status?: RuntimeSelectionDecision['status']
  decision?: RuntimeSelectionDecision
}

export class RuntimeSelectionController<TSelection> {
  private requestVersion = 0

  constructor(private readonly deps: RuntimeSelectionControllerDeps<TSelection>) {}

  async select(selection: TSelection): Promise<RuntimeSelectionResult> {
    const version = ++this.requestVersion
    const decision = await this.deps.request(selection)
    if (version !== this.requestVersion) {
      return { accepted: false, stale: true, status: decision.status, decision }
    }
    if (!decision.compatible || decision.status === 'rejected') {
      return { accepted: false, stale: false, status: 'rejected', decision }
    }
    this.deps.apply(selection, decision.status)
    return { accepted: true, stale: false, status: decision.status, decision }
  }
}
