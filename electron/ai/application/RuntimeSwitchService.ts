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
  clearPending?(threadId: string): void
}

export function evaluateRuntimeCompatibility(
  currentTokens: number,
  budget: EffectiveModelBudget,
): Omit<RuntimeSwitchResponse, 'status' | 'candidate'> {
  const compatible = currentTokens < budget.triggerTokens
  return {
    compatible,
    currentEffectiveContextTokens: currentTokens,
    candidateCompactTriggerTokens: budget.triggerTokens,
    candidateRequestBudgetTokens: budget.requestBudgetTokens,
    candidateMaxInputTokens: budget.maxInputTokens,
    budgetSource: budget.source,
    ...(compatible ? {} : { reason: 'context-exceeds-compact-trigger' as const }),
  }
}

export class RuntimeSwitchService {
  constructor(private readonly ports: RuntimeSwitchServicePorts) {}

  async request(request: RuntimeSwitchRequest): Promise<RuntimeSwitchResponse> {
    const inspection = await this.ports.inspect(request.threadId, request.candidate)
    const compatibility = evaluateRuntimeCompatibility(
      inspection.currentTokens,
      inspection.budget,
    )
    if (!compatibility.compatible) {
      return {
        ...compatibility,
        status: 'rejected',
        candidate: request.candidate,
      }
    }

    const state = this.ports.getThreadState(request.threadId)
    if (state === 'idle') {
      this.ports.commit(request.threadId, request.candidate)
      return {
        ...compatibility,
        status: 'committed',
        candidate: request.candidate,
      }
    }

    this.ports.defer(request.threadId, request.candidate)
    return {
      ...compatibility,
      status: 'pending',
      candidate: request.candidate,
    }
  }

  async finalize(
    threadId: string,
    candidate: ThreadRuntimeSelection,
  ): Promise<RuntimeSwitchResponse> {
    const inspection = await this.ports.inspect(threadId, candidate)
    const compatibility = evaluateRuntimeCompatibility(
      inspection.currentTokens,
      inspection.budget,
    )
    if (!compatibility.compatible) {
      this.ports.clearPending?.(threadId)
      return {
        ...compatibility,
        status: 'rejected',
        candidate,
      }
    }
    this.ports.commit(threadId, candidate)
    return {
      ...compatibility,
      status: 'committed',
      candidate,
    }
  }
}
