import { CREATIVE_REVIEW_TOOLS } from '../../../../src/types/ai'
import { buildCreativeSystemPrompt } from '../../../../src/ai/thread/system-prompts/creative'
import { buildCreativeCapabilities, CREATIVE_INTERRUPT_ON_NAMES } from './buildCreativeCapabilities'
import { buildCreativeReviewItemFromAction } from '../../ipc/CreativeReviewAdapter'
import { computeWorkspaceHashes, getCreativeDb } from '../../db/CreativeDb'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import type { ThreadRuntimeStore } from '../../runtime/ThreadRuntimeStore'
import type { AiAgentMode } from '../../../../src/types/ai'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'
import type {
  DomainStrategy,
  DomainBuildContext,
  InterruptContext,
  DomainReviewItem,
  SessionCompleteContext,
} from '../DomainStrategy'
import type { DomainAgentCapabilities } from '../types'

export class CreativeDomainStrategy implements DomainStrategy {
  constructor(
    private readonly snapshotBroker: SnapshotBroker,
    private readonly aiRootPath: string,
    private readonly runtimeStore: ThreadRuntimeStore,
    private readonly onSkillsMutated?: () => void,
  ) {}

  buildCapabilities(ctx: DomainBuildContext): DomainAgentCapabilities {
    const workspacePath = ctx.mounts.find(m => m.virtualPath === '/')?.hostPath
    return buildCreativeCapabilities(
      this.aiRootPath,
      ctx.mounts,
      workspacePath ? getCreativeDb(workspacePath) : null,
      this.snapshotBroker,
      ctx.language,
      this.onSkillsMutated,
    )
  }

  getSystemPrompt(_mode: AiAgentMode, language: DetectedInputLanguage): string {
    return buildCreativeSystemPrompt(language)
  }

  getMemoryFileName(): string {
    return 'AGENTS.creative.md'
  }

  getInterruptOnNames(): Set<string> {
    return CREATIVE_INTERRUPT_ON_NAMES
  }

  async buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]> {
    const workspacePath = this.runtimeStore.getContext(ctx.threadId)?.workspacePath ?? null
    const pendingCreativeToolCalls = (ctx.partialMessage?.toolCalls ?? []).filter(tc =>
      CREATIVE_REVIEW_TOOLS.has(tc.name)
    )

    return ctx.actionRequests.map((ar, index): DomainReviewItem => ({
      kind: 'creative',
      payload: buildCreativeReviewItemFromAction(
        ar,
        pendingCreativeToolCalls[index]?.id,
        ctx.partialMessage?.id,
        ctx.turnId,
        workspacePath,
      ),
    }))
  }

  onSessionComplete(ctx: SessionCompleteContext): void {
    if (!ctx.workspacePath) return
    try {
      getCreativeDb(ctx.workspacePath).upsertSession(
        ctx.workspacePath,
        computeWorkspaceHashes(ctx.workspacePath),
      )
    } catch (err) {
      console.warn('[CreativeDomainStrategy] onSessionComplete failed:', err)
    }
  }
}
