import * as path from 'path'
import * as fs from 'fs'
import type { AiAgentDomain, ResumeDecision } from '@shared/ai/contracts'
import type { DomainReviewItem } from '../domain/DomainStrategy'
import type { SnapshotBroker } from '../document/SnapshotBroker'
import type { DomainStrategy } from '../domain/DomainStrategy'
import type { RendererEventBridge } from '../ipc/RendererEventBridge'
import type { InterruptedRun, ThreadRuntimeStore } from '../runtime/ThreadRuntimeStore'
import type { WritingSessionRegistry } from '../scaffold/approval/WritingSessionRegistry'

export interface WritingSessionCoordinatorDependencies {
  registry: WritingSessionRegistry
  snapshotBroker: Pick<SnapshotBroker, 'requestSnapshot'>
  runtimeStore: ThreadRuntimeStore
  getThreadDomain(threadId: string): AiAgentDomain
  getStrategy(domain: AiAgentDomain): DomainStrategy
  rendererBridge: Pick<RendererEventBridge, 'sendRunInterrupted'>
}

export class WritingSessionCoordinator {
  constructor(private readonly dependencies: WritingSessionCoordinatorDependencies) {}

  stashInterruptArgs(
    actionRequests: Array<{ name: string; args?: Record<string, unknown> }>,
  ): Pick<InterruptedRun, 'confirmPlanArgsByIndex' | 'finalizeArgsByIndex'> {
    const confirmPlanArgsByIndex: NonNullable<InterruptedRun['confirmPlanArgsByIndex']> = {}
    const finalizeArgsByIndex: NonNullable<InterruptedRun['finalizeArgsByIndex']> = {}

    actionRequests.forEach((actionRequest, index) => {
      if (actionRequest.name === 'confirm_writing_plan') {
        const rawTargets = actionRequest.args?.target_files
        confirmPlanArgsByIndex[index] = {
          plan: typeof actionRequest.args?.plan === 'string' ? actionRequest.args.plan : '',
          targetFiles: Array.isArray(rawTargets)
            ? rawTargets.filter((item): item is string => typeof item === 'string')
            : [],
        }
      }
      if (actionRequest.name === 'finalize_chapter') {
        finalizeArgsByIndex[index] = {
          chapter: typeof actionRequest.args?.chapter === 'string' ? actionRequest.args.chapter : '',
          summary: typeof actionRequest.args?.summary === 'string'
            ? actionRequest.args.summary
            : undefined,
        }
      }
    })

    return { confirmPlanArgsByIndex, finalizeArgsByIndex }
  }

  async recordAutoAppliedSnapshots(threadId: string, files: string[]): Promise<void> {
    for (const file of files) {
      const snapshot = await this.captureChapter(file)
      this.dependencies.registry.recordAgentSnapshot(threadId, file, snapshot)
    }
  }

  async registerApprovedPlans(
    threadId: string,
    interrupted: InterruptedRun,
    decisions: ResumeDecision[],
  ): Promise<void> {
    const argsByIndex = interrupted.confirmPlanArgsByIndex
    if (!argsByIndex) return

    for (const [indexText, stashed] of Object.entries(argsByIndex)) {
      const decision = decisions[Number(indexText)]
      if (decision?.type !== 'approved' && decision?.type !== 'edited') continue

      const plan = decision.type === 'edited' && typeof decision.editedArgs?.plan === 'string'
        ? decision.editedArgs.plan
        : stashed.plan
      const rawTargets = decision.type === 'edited'
        ? decision.editedArgs?.target_files
        : undefined
      const targetFiles = Array.isArray(rawTargets)
        ? rawTargets.filter((item): item is string => typeof item === 'string')
        : stashed.targetFiles
      const resolvedTargets = targetFiles
        .map(file => this.resolveChapterPath(file))
        .filter((file): file is string => file !== null)

      this.dependencies.registry.registerAuthorization(threadId, plan, resolvedTargets)
      for (const target of resolvedTargets) {
        const baseline = await this.captureChapter(target) ?? ''
        this.dependencies.registry.ensureActiveSession(threadId, target, baseline)
      }
    }
  }

  applyFinalizeDecisions(
    threadId: string,
    interrupted: InterruptedRun,
    decisions: ResumeDecision[],
  ): void {
    const argsByIndex = interrupted.finalizeArgsByIndex
    if (!argsByIndex) return

    for (const [indexText, stashed] of Object.entries(argsByIndex)) {
      const decision = decisions[Number(indexText)]
      if (!decision || decision.type === 'responded') continue

      const chapterPath = this.resolveChapterPath(stashed.chapter)
      if (!chapterPath) continue
      if (decision.type === 'rejected') {
        const session = this.dependencies.registry.getActiveSession(threadId, chapterPath)
        if (session?.baselineSnapshot != null) {
          try {
            fs.writeFileSync(chapterPath, session.baselineSnapshot, 'utf-8')
          } catch (error) {
            console.error('[AgentEngine] finalize reject restore failed:', error)
          }
        }
      }

      this.dependencies.registry.closeSession(threadId, chapterPath)
    }
  }

  async decorateReviews(
    reviews: DomainReviewItem[],
    threadId: string,
    reviewOriginalIndices: number[] = [],
    autoApplyOriginalIndices: Set<number> = new Set(),
  ): Promise<void> {
    reviews.forEach((review, index) => {
      const originalIndex = reviewOriginalIndices[index]
      if (
        review.kind === 'edit'
        && originalIndex !== undefined
        && autoApplyOriginalIndices.has(originalIndex)
      ) {
        review.payload.autoApply = true
      }
    })

    for (const review of reviews) {
      if (review.kind !== 'creative') continue
      const payload = review.payload
      if (payload.kind !== 'creative_chapter_finalize') continue

      const chapterPath = this.resolveChapterPath(payload.chapter)
      const current = chapterPath ? (await this.captureChapter(chapterPath) ?? '') : ''
      const session = chapterPath
        ? this.dependencies.registry.getActiveSession(threadId, chapterPath)
        : undefined
      payload.baseline = session?.baselineSnapshot ?? current
      payload.current = current
      const lastAgentSnapshot = session?.lastAgentSnapshot
      payload.hasExternalEdits = lastAgentSnapshot != null && lastAgentSnapshot !== current
    }
  }

  private resolveChapterPath(chapter: string): string | null {
    const trimmed = chapter.trim()
    return trimmed && path.isAbsolute(trimmed) ? trimmed : null
  }

  private async captureChapter(chapterPath: string): Promise<string | null> {
    if (!fs.existsSync(chapterPath)) return null
    try {
      const snapshot = await this.dependencies.snapshotBroker.requestSnapshot(chapterPath)
      if (snapshot?.viewMarkdown != null) return snapshot.viewMarkdown
    } catch (error) {
      console.warn('[AgentEngine] snapshot baseline capture failed, falling back to disk:', error)
    }

    try {
      return fs.readFileSync(chapterPath, 'utf-8')
    } catch {
      return null
    }
  }
}
