
import * as path from 'path'
import { buildEditSystemPrompt } from '../../../../src/ai/thread/system-prompts/edit'
import { buildEditCapabilities, EDIT_INTERRUPT_ON_NAMES } from './buildEditCapabilities'
import { buildProposalFromAction } from '../../ipc/MessageAdapter'
import { buildFilesystemReviewItemFromAction, isFilesystemWriteTool } from '../../ipc/FilesystemReviewAdapter'
import { parseUntitledTabId } from '../../document/virtualId'
import type { SnapshotBroker } from '../../document/SnapshotBroker'
import type { ThreadRuntimeStore } from '../../runtime/ThreadRuntimeStore'
import type { AiAgentMode } from '../../../../src/types/ai'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'
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
    private readonly aiRootPath: string,
    private readonly runtimeStore: ThreadRuntimeStore,
  ) {}

  buildCapabilities(_ctx: DomainBuildContext): DomainAgentCapabilities {
    return buildEditCapabilities({ snapshotBroker: this.snapshotBroker })
  }

  getSystemPrompt(_mode: AiAgentMode, language: DetectedInputLanguage): string {
    return buildEditSystemPrompt(language)
  }

  getSkillSources(aiRootPath: string): string[] {
    return [path.join(aiRootPath, 'skills', 'common'), path.join(aiRootPath, 'skills', 'edit')]
  }

  getMemoryFileName(): string {
    return 'AGENTS.edit.md'
  }

  getInterruptOnNames(): Set<string> {
    return EDIT_INTERRUPT_ON_NAMES
  }

  async buildReviewItems(ctx: InterruptContext): Promise<DomainReviewItem[]> {
    const firstArgs = ctx.actionRequests[0]?.args ?? {}
    const argFilePath = typeof firstArgs.file_path === 'string' ? firstArgs.file_path : null
    const activeFilePath = this.runtimeStore.getContext(ctx.threadId)?.activeFilePath ?? null
    const untitledTabId = parseUntitledTabId(argFilePath)
    const snapshotTargetPath = (!untitledTabId && argFilePath && argFilePath !== activeFilePath) ? argFilePath : null

    let snapshot = null
    try {
      snapshot = await this.snapshotBroker.requestSnapshot(snapshotTargetPath, untitledTabId)
    } catch (err) {
      console.warn('[EditDomainStrategy] snapshot failed:', err)
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
