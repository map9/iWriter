import type { ResumeDecision } from '../../../shared/ai/contracts'
import type { InterruptedRun } from '../runtime/ThreadRuntimeStore'
import { isBlockEditToolName } from '../scaffold/approval/WritingSessionRegistry'
import { RESPOND_MARKER } from '../scaffold/middleware/HumanRespondMessageMiddleware'

export const BLOCK_EDIT_APPLIED_MESSAGE =
  'The edit was applied successfully by the editor. Block IDs for this file have now shifted — ' +
  're-read with get_document_outline / get_section before starting a new round of edits.'

export type LangGraphResumeDecision =
  | { type: 'approve' }
  | {
      type: 'edit'
      editedAction: {
        name: string
        args: Record<string, unknown>
      }
    }
  | { type: 'reject'; message: string }

export class InterruptCoordinator {
  mergeDecisions(interrupted: InterruptedRun, reviewDecisions: ResumeDecision[]): ResumeDecision[] {
    const fullDecisions: ResumeDecision[] = Array.from(
      { length: interrupted.actionRequestCount },
      () => ({ type: 'rejected' as const, message: 'User did not review this action.' }),
    )

    for (const [indexText, decision] of Object.entries(interrupted.autoDecisionsByIndex ?? {})) {
      const index = Number(indexText)
      if (Number.isInteger(index) && index >= 0 && index < fullDecisions.length) {
        fullDecisions[index] = this.cloneDecision(decision)
      }
    }

    const reviewIndices = interrupted.reviewActionOriginalIndices
      ?? reviewDecisions.map((_, index) => index)

    reviewDecisions.forEach((decision, reviewIndex) => {
      const originalIndex = reviewIndices[reviewIndex]
      if (originalIndex === undefined || originalIndex < 0 || originalIndex >= fullDecisions.length) return
      fullDecisions[originalIndex] = this.cloneDecision(decision)
    })

    return fullDecisions
  }

  buildLangGraphDecisions(
    interrupted: InterruptedRun,
    decisions: ResumeDecision[],
  ): LangGraphResumeDecision[] {
    const batchPoisoned = decisions.some(
      decision => decision.type === 'rejected' || decision.type === 'responded',
    )

    return decisions.map((decision, index) => {
      const actionName = interrupted.actionNames[index] ?? ''
      if (decision.type === 'approved') {
        if (batchPoisoned && isBlockEditToolName(actionName)) {
          return this.appliedBlockEditDecision()
        }
        return { type: 'approve' }
      }

      if (decision.type === 'edited' && decision.editedArgs) {
        if (batchPoisoned && isBlockEditToolName(actionName)) {
          return this.appliedBlockEditDecision()
        }
        return {
          type: 'edit',
          editedAction: {
            name: actionName,
            args: decision.editedArgs,
          },
        }
      }

      if (decision.type === 'responded') {
        if (!decision.message?.trim()) {
          throw new Error('[InterruptCoordinator] responded decision requires non-empty message')
        }
        return {
          type: 'reject',
          message: `${RESPOND_MARKER}${decision.message}`,
        }
      }

      return {
        type: 'reject',
        message: decision.message ?? 'User rejected the edit.',
      }
    })
  }

  private appliedBlockEditDecision(): LangGraphResumeDecision {
    return {
      type: 'reject',
      message: `${RESPOND_MARKER}${BLOCK_EDIT_APPLIED_MESSAGE}`,
    }
  }

  private cloneDecision(decision: ResumeDecision): ResumeDecision {
    if (decision.type === 'approved') return { type: 'approved' }
    if (decision.type === 'edited') {
      return {
        type: 'edited',
        editedArgs: decision.editedArgs ? { ...decision.editedArgs } : undefined,
        message: decision.message,
      }
    }
    if (decision.type === 'responded') {
      return { type: 'responded', message: decision.message }
    }
    return { type: 'rejected', message: decision.message }
  }
}
