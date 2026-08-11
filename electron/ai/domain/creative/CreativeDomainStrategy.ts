import { BLOCK_EDIT_TOOLS, CREATIVE_REVIEW_TOOLS } from '../../../../src/types/ai'
import * as path from 'path'
import type { ResumeDecision } from '../../ipc/protocol'
import { buildCreativeSystemPrompt } from '../../../../src/ai/thread/system-prompts/creative'
import { buildCreativeCapabilities, CREATIVE_INTERRUPT_ON_NAMES } from './buildCreativeCapabilities'
import {
  buildCreativeReviewItemFromAction,
  enrichCreativeGitReviewItem,
} from '../../ipc/CreativeReviewAdapter'
import { buildFilesystemReviewItemFromAction, isFilesystemWriteTool } from '../../ipc/FilesystemReviewAdapter'
import { buildProposalFromAction } from '../../ipc/MessageAdapter'
import { parseUntitledTabId } from '../../document/virtualId'
import { isBlockEditToolName } from '../../scaffold/approval/WritingSessionRegistry'
import { withProjectSkills } from '../../scaffold/skills/SkillsMount'
import { CREATIVE_SUMMARIZATION_PROFILE } from '../../scaffold/summarization/SummarizationFramework'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import type { EditorStateBroker } from '../../document/EditorStateBroker'
import type { SerializedSnapshot } from '../../ipc/protocol'
import type { ThreadRuntimeStore } from '../../runtime/ThreadRuntimeStore'
import type { AiAgentMode } from '../../../../src/types/ai'
import type { GitMutationEvent } from '../../../../src/types/git'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'
import type {
  DomainStrategy,
  DomainBuildContext,
  InterruptContext,
  DomainReviewItem,
} from '../DomainStrategy'
import type { DomainAgentCapabilities } from '../types'
import type { GitService } from '../../../GitService'

export class CreativeDomainStrategy implements DomainStrategy {
  constructor(
    private readonly snapshotBroker: SnapshotBroker,
    private readonly editorStateBroker: EditorStateBroker,
    private readonly aiRootPath: string,
    private readonly runtimeStore: ThreadRuntimeStore,
    private readonly gitService: GitService,
    private readonly onGitMutation: (event: GitMutationEvent) => void,
  ) {}

  buildCapabilities(ctx: DomainBuildContext): DomainAgentCapabilities {
    return buildCreativeCapabilities({
      aiRootPath: this.aiRootPath,
      workspacePath: ctx.workspacePath,
      snapshotBroker: this.snapshotBroker,
      editorStateBroker: this.editorStateBroker,
      language: ctx.language,
      gitService: this.gitService,
      onGitMutation: this.onGitMutation,
    })
  }

  getSystemPrompt(_mode: AiAgentMode, language: DetectedInputLanguage): string {
    return buildCreativeSystemPrompt(language)
  }

  getSummarizationProfile() {
    return CREATIVE_SUMMARIZATION_PROFILE
  }

  getSkillSources(aiRootPath: string, workspacePath: string | null): string[] {
    // A00 挂载矩阵（04.3 §3），last-wins 顺序：common → creative/common → creative/reference
    // → creative/main → creative/delegated → {workspace}/.iwriter/skills（末位，项目级覆盖内置）。
    // creative/common 承载跨角色创作范式（结构/人物/主题/场景诊断等）——A00 的大纲/前端建议类要用。
    return withProjectSkills([
      path.join(aiRootPath, 'skills', 'common'),
      path.join(aiRootPath, 'skills', 'creative', 'common'),
      path.join(aiRootPath, 'skills', 'creative', 'reference'),
      path.join(aiRootPath, 'skills', 'creative', 'main'),
      path.join(aiRootPath, 'skills', 'creative', 'delegated'),
    ], workspacePath)
  }

  getMemoryDir(): string {
    return 'creative'
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
    const hasFilesystem = reviewActionRequests.some(ar => isFilesystemWriteTool(ar.name))
    const familyCount = Number(hasCreative) + Number(hasEdit) + Number(hasFilesystem)
    if (familyCount <= 1) return undefined

    // Renderer review modules submit one approval family at a time. LangChain HITL also skips
    // ToolNode for the whole batch when any sibling is rejected. Block edits are the only safe
    // dominant family because the renderer applies them before resume and AgentEngine can
    // synthesize their acknowledgements in a poisoned batch. Without block edits there is no safe
    // partial execution, so reject the whole mixed batch and let the model resubmit one family.
    const result: Record<number, ResumeDecision> = {}
    reviewActionRequests.forEach((ar, i) => {
      const origIdx = reviewActionOriginalIndices[i]
      if (origIdx === undefined) return
      if (hasEdit && BLOCK_EDIT_TOOLS.has(ar.name)) return

      result[origIdx] = {
        type: 'rejected',
        message: hasEdit
          ? `Mixed approval families detected. '${ar.name}' was skipped because block edits were present. Submit block edits, filesystem mutations, and creative/git approvals in separate turns.`
          : `Mixed approval families detected. '${ar.name}' was skipped with the whole batch. Resubmit filesystem mutations and creative/git approvals in separate turns.`,
      }
    })
    return result
  }

  async buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]> {
    const runtimeCtx = this.runtimeStore.getContext(ctx.threadId)

    // Per-file snapshot cache: each file_path gets one snapshot across all block edit actions
    const snapshotCache = new Map<string, SerializedSnapshot | null>()
    const getSnapshot = async (filePath: string): Promise<SerializedSnapshot | null> => {
      if (snapshotCache.has(filePath)) return snapshotCache.get(filePath) ?? null
      let snapshot: SerializedSnapshot | null = null
      try {
        const untitledTabId = parseUntitledTabId(filePath)
        const snapshotTarget = untitledTabId ? null : filePath
        snapshot = await this.snapshotBroker.requestSnapshot(snapshotTarget, untitledTabId)
      } catch (err) {
        console.warn('[CreativeDomainStrategy] snapshot failed for', filePath, err)
      }
      snapshotCache.set(filePath, snapshot)
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
        let snapshot: SerializedSnapshot | null = null
        if (isBlockEditToolName(ar.name)) {
          const filePath = typeof ar.args?.file_path === 'string' ? ar.args.file_path.trim() : ''
          if (!filePath) throw new Error(`${ar.name} requires file_path.`)
          snapshot = await getSnapshot(filePath)
        }
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

      const creativeReview = buildCreativeReviewItemFromAction(
        ar,
        takeToolCallId(ar.name),
        ctx.partialMessage?.id,
        ctx.turnId,
      )
      results.push({
        kind: 'creative',
        payload: await enrichCreativeGitReviewItem(
          creativeReview,
          runtimeCtx?.workspacePath ?? null,
          this.gitService,
        ),
      })
    }

    return results
  }
}
