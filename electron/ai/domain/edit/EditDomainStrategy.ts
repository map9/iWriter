
import * as path from 'path'
import { buildEditSystemPrompt } from './systemPrompt'
import { buildEditCapabilities, EDIT_INTERRUPT_ON_NAMES } from './buildEditCapabilities'
import { buildProposalFromAction } from '../../ipc/MessageAdapter'
import { buildFilesystemReviewItemFromAction, isFilesystemWriteTool } from '../../ipc/FilesystemReviewAdapter'
import { parseUntitledTabId } from '../../document/virtualId'
import { isBlockEditToolName } from '../../scaffold/approval/WritingSessionRegistry'
import { withProjectSkills } from '../../scaffold/skills/SkillsMount'
import { EDITING_SUMMARIZATION_PROFILE } from '../../scaffold/summarization/SummarizationFramework'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import type { EditorStateBroker } from '../../document/EditorStateBroker'
import type { AiAgentMode } from '../../../../shared/ai/contracts'
import type { ResumeDecision } from '@shared/ai/contracts'
import type {
  DomainStrategy,
  DomainBuildContext,
  InterruptContext,
  DomainReviewItem,
} from '../DomainStrategy'
import type { DomainAgentCapabilities } from '../types'

export class EditDomainStrategy implements DomainStrategy {
  constructor(
    private readonly snapshotBroker: SnapshotBroker,
    private readonly editorStateBroker: EditorStateBroker,
    private readonly aiRootPath: string,
  ) {}

  buildCapabilities(_ctx: DomainBuildContext): DomainAgentCapabilities {
    return buildEditCapabilities({
      snapshotBroker: this.snapshotBroker,
      editorStateBroker: this.editorStateBroker,
    })
  }

  getSystemPrompt(_mode: AiAgentMode): string {
    return buildEditSystemPrompt()
  }

  getSummarizationProfile() {
    return EDITING_SUMMARIZATION_PROFILE
  }

  getSkillSources(aiRootPath: string, workspacePath: string | null): string[] {
    // common（跨域，含 document-block-tools）→ edit → 项目级末位（last-wins）。
    return withProjectSkills(
      [path.join(aiRootPath, 'skills', 'common'), path.join(aiRootPath, 'skills', 'edit')],
      workspacePath,
    )
  }

  getMemoryDir(): string {
    return 'edit'
  }

  getInterruptOnNames(): Set<string> {
    return EDIT_INTERRUPT_ON_NAMES
  }

  preDecideMixed(
    reviewActionRequests: Array<{ name: string; args: Record<string, unknown> }>,
    reviewActionOriginalIndices: number[],
  ): Record<number, ResumeDecision> | undefined {
    const hasFilesystem = reviewActionRequests.some(ar => isFilesystemWriteTool(ar.name))
    const hasBlockEdit = reviewActionRequests.some(ar => !isFilesystemWriteTool(ar.name))
    if (!hasFilesystem || !hasBlockEdit) return undefined

    // Keep block edits as the only reviewed family. The renderer applies them before resume, and
    // AgentEngine's poisoned-batch guard can acknowledge them even though these auto-rejections
    // cause LangChain HITL to skip ToolNode for the original mixed batch.
    const result: Record<number, ResumeDecision> = {}
    reviewActionRequests.forEach((ar, i) => {
      if (!isFilesystemWriteTool(ar.name)) return
      const originalIndex = reviewActionOriginalIndices[i]
      if (originalIndex === undefined) return
      result[originalIndex] = {
        type: 'rejected',
        message: `Mixed approval families detected. '${ar.name}' was skipped because block edits were present. Submit filesystem mutations in a separate turn after the block-edit batch is reviewed.`,
      }
    })
    return result
  }

  async buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]> {
    let snapshot = null
    const blockAction = ctx.actionRequests.find(action => isBlockEditToolName(action.name))
    if (blockAction) {
      const filePath = typeof blockAction.args.file_path === 'string'
        ? blockAction.args.file_path.trim()
        : ''
      if (!filePath) throw new Error(`${blockAction.name} requires file_path.`)
      const untitledTabId = parseUntitledTabId(filePath)
      const snapshotTargetPath = untitledTabId ? null : filePath
      try {
        snapshot = await this.snapshotBroker.requestSnapshot(snapshotTargetPath, untitledTabId)
      } catch (err) {
        console.warn('[EditDomainStrategy] snapshot failed:', err)
      }
    }

    // Per-name sequence counter: binds the Nth action of a given tool name
    // to the Nth tool call with that name, handling mixed filesystem+edit batches correctly.
    const consumedByName = new Map<string, number>()
    const takeToolCallId = (name: string): string | undefined => {
      const i = consumedByName.get(name) ?? 0
      consumedByName.set(name, i + 1)
      return ctx.partialMessage?.toolCalls?.filter(tc => tc.name === name)[i]?.id
    }

    return ctx.actionRequests.map((ar): DomainReviewItem => {
      if (isFilesystemWriteTool(ar.name)) {
        return {
          kind: 'filesystem',
          payload: buildFilesystemReviewItemFromAction(
            ar,
            takeToolCallId(ar.name),
            ctx.partialMessage?.id,
            ctx.turnId,
          ),
        }
      }

      return {
        kind: 'edit',
        payload: buildProposalFromAction(
          ar.name,
          ar.args ?? {},
          snapshot,
          takeToolCallId(ar.name),
          ctx.partialMessage?.id,
          ctx.turnId,
        ),
      }
    })
  }
}
