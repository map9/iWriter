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
  constructor(private readonly ports: RuntimeSwitchServicePorts) {}

  async request(request: RuntimeSwitchRequest): Promise<RuntimeSwitchResponse> {
    const inspection = await this.ports.inspect(request.threadId, request.candidate)
    if (!canSwitchRuntime(inspection.currentTokens, inspection.budget)) {
      return createResponse(
        'rejected',
        request.candidate,
        inspection.currentTokens,
        inspection.budget,
      )
    }

    const state = this.ports.getThreadState(request.threadId)
    if (state === 'idle') {
      this.ports.commit(request.threadId, request.candidate)
      return createResponse(
        'committed',
        request.candidate,
        inspection.currentTokens,
        inspection.budget,
      )
    }

    this.ports.defer(request.threadId, request.candidate)
    return createResponse(
      'pending',
      request.candidate,
      inspection.currentTokens,
      inspection.budget,
    )
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
