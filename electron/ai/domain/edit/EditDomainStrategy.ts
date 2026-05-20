import { BLOCK_EDIT_TOOLS } from '../../../../src/types/ai'
import { EDIT_SYSTEM_PROMPT } from '../../../../src/ai/thread/system-prompts/edit'
import { MINIMAL_SYSTEM_PROMPT } from '../../../../src/ai/thread/system-prompts/minimal'
import { buildEditCapabilities, EDIT_INTERRUPT_ON_NAMES } from './buildEditCapabilities'
import { buildProposalFromAction } from '../../ipc/MessageAdapter'
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

  buildCapabilities(ctx: DomainBuildContext): DomainAgentCapabilities {
    if (ctx.mode === 'minimal') return { tools: [], skills: [] }
    return buildEditCapabilities(this.snapshotBroker, this.aiRootPath, ctx.mounts)
  }

  getSystemPrompt(mode: AiAgentMode, _language: DetectedInputLanguage): string {
    return mode === 'minimal' ? MINIMAL_SYSTEM_PROMPT : EDIT_SYSTEM_PROMPT
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
    const snapshotTargetPath = (argFilePath && argFilePath !== activeFilePath) ? argFilePath : null

    let snapshot = null
    try {
      snapshot = await this.snapshotBroker.requestSnapshot(snapshotTargetPath)
    } catch (err) {
      console.warn('[EditDomainStrategy] snapshot failed:', err)
    }

    const pendingEditToolCalls = (ctx.partialMessage?.toolCalls ?? []).filter(tc =>
      BLOCK_EDIT_TOOLS.has(tc.name)
    )

    return ctx.actionRequests.map((ar, index): DomainReviewItem => ({
      kind: 'edit',
      payload: buildProposalFromAction(
        ar.name,
        ar.args ?? {},
        snapshot,
        pendingEditToolCalls[index]?.id,
        ctx.partialMessage?.id,
        ctx.turnId,
      ),
    }))
  }
}
