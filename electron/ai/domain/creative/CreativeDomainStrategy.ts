import { BLOCK_EDIT_TOOLS, CREATIVE_REVIEW_TOOLS } from '../../../../src/types/ai'
import * as path from 'path'
import type { ResumeDecision } from '../../ipc/protocol'
import { buildCreativeSystemPrompt } from '../../../../src/ai/thread/system-prompts/creative'
import { buildCreativeCapabilities, CREATIVE_INTERRUPT_ON_NAMES } from './buildCreativeCapabilities'
import { buildCreativeReviewItemFromAction } from '../../ipc/CreativeReviewAdapter'
import { buildFilesystemReviewItemFromAction, isFilesystemWriteTool } from '../../ipc/FilesystemReviewAdapter'
import { buildProposalFromAction } from '../../ipc/MessageAdapter'
import { parseUntitledTabId } from '../../document/virtualId'
import { computeWorkspaceHashes, getCreativeDb } from '../../db/CreativeDb'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import type { SerializedSnapshot } from '../../ipc/protocol'
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
    return buildCreativeCapabilities({
      aiRootPath: this.aiRootPath,
      workspacePath: ctx.workspacePath,
      creativeDb: ctx.workspacePath ? getCreativeDb(ctx.workspacePath) : null,
      snapshotBroker: this.snapshotBroker,
      language: ctx.language,
      onSkillsMutated: this.onSkillsMutated,
    })
  }

  getSystemPrompt(_mode: AiAgentMode, language: DetectedInputLanguage): string {
    return buildCreativeSystemPrompt(language)
  }

  getSkillSources(aiRootPath: string): string[] {
    return [
      path.join(aiRootPath, 'skills', 'creative', 'main'),
      path.join(aiRootPath, 'skills', 'creative', 'common'),
      path.join(aiRootPath, 'skills', 'common'),
    ]
  }

  getMemoryFileName(): string {
    return 'AGENTS.creative.md'
  }

  getInterruptOnNames(): Set<string> {
    return CREATIVE_INTERRUPT_ON_NAMES
  }

  preDecideMixed(
    reviewActionRequests: Array<{ name: string; args: Record<string, unknown> }>,
    reviewActionOriginalIndices: number[],
  ): Record<number, ResumeDecision> | undefined {
    const hasCreative = reviewActionRequests.some(ar => CREATIVE_REVIEW_TOOLS.has(ar.name))
    const hasEdit = reviewActionRequests.some(ar => BLOCK_EDIT_TOOLS.has(ar.name))
    if (!hasCreative || !hasEdit) return undefined

    // Dominant kind: edit over creative. Auto-reject creative review tools.
    const result: Record<number, ResumeDecision> = {}
    reviewActionRequests.forEach((ar, i) => {
      const origIdx = reviewActionOriginalIndices[i]
      if (CREATIVE_REVIEW_TOOLS.has(ar.name) && origIdx !== undefined) {
        result[origIdx] = {
          type: 'rejected',
          message: `Mixed-kind action batch detected. '${ar.name}' was skipped because block-edit tools were present in the same turn. Please call plan/review tools and block-edit tools in separate turns.`,
        }
      }
    })
    return result
  }

  async buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]> {
    const runtimeCtx = this.runtimeStore.getContext(ctx.threadId)
    const workspacePath = runtimeCtx?.workspacePath ?? null
    const activeFilePath = runtimeCtx?.activeFilePath ?? null

    // Per-file snapshot cache: each file_path gets one snapshot across all block edit actions
    const snapshotCache = new Map<string | null, SerializedSnapshot | null>()
    const getSnapshot = async (filePath: string | null): Promise<SerializedSnapshot | null> => {
      const key = filePath ?? null
      if (snapshotCache.has(key)) return snapshotCache.get(key) ?? null
      let snapshot: SerializedSnapshot | null = null
      try {
        const untitledTabId = parseUntitledTabId(filePath)
        const snapshotTarget = (!untitledTabId && filePath && filePath !== activeFilePath) ? filePath : null
        snapshot = await this.snapshotBroker.requestSnapshot(snapshotTarget, untitledTabId)
      } catch (err) {
        console.warn('[CreativeDomainStrategy] snapshot failed for', filePath, err)
      }
      snapshotCache.set(key, snapshot)
      return snapshot
    }

    // Per-name sequence counter: correctly binds the Nth occurrence of a tool name
    // to the Nth tool call with that name, preventing duplicate toolCallId binding.
    const consumedByName = new Map<string, number>()
    const takeToolCallId = (name: string): string | undefined => {
      const i = consumedByName.get(name) ?? 0
      consumedByName.set(name, i + 1)
      return ctx.partialMessage?.toolCalls?.filter(tc => tc.name === name)[i]?.id
    }

    const results: DomainReviewItem[] = []

    for (const ar of ctx.actionRequests) {
      if (isFilesystemWriteTool(ar.name)) {
        results.push({
          kind: 'filesystem',
          payload: buildFilesystemReviewItemFromAction(
            ar,
            takeToolCallId(ar.name),
            ctx.partialMessage?.id,
            ctx.turnId,
          ),
        })
        continue
      }

      if (BLOCK_EDIT_TOOLS.has(ar.name)) {
        const filePath = typeof ar.args?.file_path === 'string' ? ar.args.file_path : null
        const snapshot = await getSnapshot(filePath)
        results.push({
          kind: 'edit',
          payload: buildProposalFromAction(
            ar.name,
            ar.args ?? {},
            snapshot,
            takeToolCallId(ar.name),
            ctx.partialMessage?.id,
            ctx.turnId,
          ),
        })
        continue
      }

      results.push({
        kind: 'creative',
        payload: buildCreativeReviewItemFromAction(
          ar,
          takeToolCallId(ar.name),
          ctx.partialMessage?.id,
          ctx.turnId,
          workspacePath,
        ),
      })
    }

    return results
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
