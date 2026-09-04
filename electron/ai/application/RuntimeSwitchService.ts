import type {
  RuntimeSwitchRequest,
  RuntimeSwitchResponse,
  ThreadRuntimeSelection,
} from '@shared/ai/contracts'
import type { EffectiveModelBudget } from '../../../shared/ai/core/modelBudget'

export type RuntimeSwitchThreadState = 'idle' | 'active' | 'interrupted'

interface RuntimeSwitchInspection {
  currentTokens: number
  budget: EffectiveModelBudget
}

export interface RuntimeSwitchServicePorts {
  inspect(threadId: string, candidate: ThreadRuntimeSelection): Promise<RuntimeSwitchInspection>
  getCurrentSelection(threadId: string): ThreadRuntimeSelection | null
  getThreadState(threadId: string): RuntimeSwitchThreadState
  commit(threadId: string, candidate: ThreadRuntimeSelection): void
  defer(threadId: string, candidate: ThreadRuntimeSelection): void
  clearPending(threadId: string): void
}

export function canSwitchRuntime(
  currentTokens: number,
  budget: EffectiveModelBudget,
): boolean {
  return currentTokens < budget.triggerTokens
}

function createResponse(
  status: RuntimeSwitchResponse['status'],
  candidate: ThreadRuntimeSelection,
  currentTokens: number,
  budget: EffectiveModelBudget,
): RuntimeSwitchResponse {
  return {
    status,
    candidate,
    currentEffectiveContextTokens: currentTokens,
    candidateCompactTriggerTokens: budget.triggerTokens,
    ...(status === 'rejected' ? { reason: 'context-exceeds-compact-trigger' as const } : {}),
  }
}

export class RuntimeSwitchService {
  private readonly requestVersions = new Map<string, number>()

  constructor(private readonly ports: RuntimeSwitchServicePorts) {}

  async request(request: RuntimeSwitchRequest): Promise<RuntimeSwitchResponse> {
    const requestVersion = (this.requestVersions.get(request.threadId) ?? 0) + 1
    this.requestVersions.set(request.threadId, requestVersion)

    if (request.validation === 'thinking-only') {
      const current = this.ports.getCurrentSelection(request.threadId)
      if (!current) throw new Error(`Thread runtime is unavailable: ${request.threadId}`)
      if (
        current.providerConfigId !== request.candidate.providerConfigId
        || current.modelId !== request.candidate.modelId
      ) {
        throw new Error('A thinking-only runtime update cannot change provider or model.')
      }
      return this.applyCandidate(request.threadId, request.candidate)
    }

    const inspection = await this.ports.inspect(request.threadId, request.candidate)
    if (this.requestVersions.get(request.threadId) !== requestVersion) {
      throw new Error('Runtime switch request was superseded by a newer request.')
    }
    if (!canSwitchRuntime(inspection.currentTokens, inspection.budget)) {
      return createResponse(
        'rejected',
        request.candidate,
        inspection.currentTokens,
        inspection.budget,
      )
    }

    const result = this.applyCandidate(request.threadId, request.candidate)
    return createResponse(
      result.status,
      request.candidate,
      inspection.currentTokens,
      inspection.budget,
    )
  }

  private applyCandidate(
    threadId: string,
    candidate: ThreadRuntimeSelection,
  ): Pick<RuntimeSwitchResponse, 'status' | 'candidate'> {
    const state = this.ports.getThreadState(threadId)
    if (state === 'idle') {
      this.ports.commit(threadId, candidate)
      return { status: 'committed', candidate }
    }

    this.ports.defer(threadId, candidate)
    return { status: 'pending', candidate }
  }

  async finalize(
    threadId: string,
    candidate: ThreadRuntimeSelection,
  ): Promise<RuntimeSwitchResponse> {
    const inspection = await this.ports.inspect(threadId, candidate)
    if (!canSwitchRuntime(inspection.currentTokens, inspection.budget)) {
      this.ports.clearPending(threadId)
      return createResponse('rejected', candidate, inspection.currentTokens, inspection.budget)
    }
    this.ports.commit(threadId, candidate)
    return createResponse('committed', candidate, inspection.currentTokens, inspection.budget)
  }
}
