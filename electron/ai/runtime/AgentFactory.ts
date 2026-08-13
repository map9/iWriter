import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage } from '@langchain/core/messages'
import { createDeepAgent } from 'deepagents'
import { modelCallLimitMiddleware, toolCallLimitMiddleware } from 'langchain'
import { createChatModel } from '../providers/ModelFactory'
import type { CheckpointerInstance } from '../checkpoint/CheckpointerFactory'
import type { DomainStrategy } from '../domain/DomainStrategy'
import {
  buildAgentFilesystem,
  type AgentFilesystemScaffold,
} from '../scaffold/filesystem/AgentFilesystem'
import { IWriterAgentContextSchema } from './AgentContext'
import { createTaskToolCompatMiddleware } from '../scaffold/middleware/TaskToolCompatMiddleware'
import { createOrphanToolCallStripperMiddleware } from '../scaffold/middleware/OrphanToolCallStripperMiddleware'
import { createRateLimitRetryMiddleware } from '../scaffold/middleware/RateLimitRetryMiddleware'
import { createHumanRespondMessageMiddleware } from '../scaffold/middleware/HumanRespondMessageMiddleware'
import {
  MIDDLEWARE_CONFIG,
  createInstrumentedFallbackMiddleware,
} from '../scaffold/middleware/middleware-config'
import { buildMemorySources, createReadonlyMemoryMiddleware } from '../scaffold/memory/MemorySources'
import {
  buildSummarizationInstruction,
  buildSummarizationPrompt,
} from '../scaffold/summarization/SummarizationFramework'
import type { AgentRuntimeConfig } from './RuntimeConfig'
import { getEffectiveModelBudget } from './RuntimeConfig'

export type DeepAgentInstance = { streamEvents: unknown }
type TokenCounter = (messages: BaseMessage[], tools?: unknown) => number

interface SummarizationMiddlewareOptions {
  model: BaseChatModel
  tokenCounter: TokenCounter
  trigger: { type: 'tokens', value: number }
  keep: { type: 'tokens', value: number }
  summaryInstruction: string
  summaryPrompt: string
  trimTokensToSummarize: number
}

export interface AgentFactoryOptions {
  aiRootPath: string
  getCheckpointer: () => CheckpointerInstance['checkpointer'] | undefined
  tokenCounter: TokenCounter
  onModelFallback: (threadId: string, fallbackModelId: string) => void
}

export interface BuiltAgent {
  agent: DeepAgentInstance
  scaffold: AgentFilesystemScaffold
}

export class AgentFactory {
  constructor(private readonly options: AgentFactoryOptions) {}

  build(runtime: AgentRuntimeConfig, strategy: DomainStrategy): BuiltAgent {
    const {
      threadId,
      providerConfig: config,
      mode,
      modelId,
      thinkingLevel,
      language,
      workspacePath,
      skillSources,
    } = runtime
    const scaffold = buildAgentFilesystem({
      workspacePath,
      aiRootPath: this.options.aiRootPath,
      skillSources,
    })
    const model = createChatModel(config, { modelId, thinkingLevel })
    const budget = getEffectiveModelBudget(config, modelId, model)
    const capabilities = strategy.buildCapabilities({ mode, workspacePath, language })
    const subAgents = capabilities.subAgents?.map(subagent => ({
      ...subagent,
      systemPrompt: `${scaffold.workspaceSystemPrompt}\n\n${subagent.systemPrompt}`,
    }))
    const memorySources = buildMemorySources(this.options.aiRootPath, strategy.getMemoryDir())

    const fallbackModels: BaseChatModel[] = []
    if (config.fallbackModelId && config.fallbackModelId !== modelId) {
      try {
        fallbackModels.push(createChatModel(config, { modelId: config.fallbackModelId, thinkingLevel }))
      } catch (err) {
        console.warn(
          `[AgentFactory] Failed to instantiate fallback model "${config.fallbackModelId}" for provider "${config.id}":`,
          err,
        )
      }
    }

    const summarizationProfile = strategy.getSummarizationProfile()
    const summarizationMiddlewareOptions: SummarizationMiddlewareOptions = {
      model: createChatModel(config, { modelId, thinkingLevel, disableThinking: true }),
      summaryInstruction: buildSummarizationInstruction(summarizationProfile),
      tokenCounter: this.options.tokenCounter,
      trigger: { type: 'tokens', value: budget.triggerTokens },
      keep: { type: 'tokens', value: budget.keepTokens },
      summaryPrompt: buildSummarizationPrompt(summarizationProfile),
      trimTokensToSummarize: budget.triggerTokens,
    }

    const agent: DeepAgentInstance = createDeepAgent({
      model,
      systemPrompt: strategy.getSystemPrompt(mode, language),
      tools: capabilities.tools,
      backend: scaffold.backend,
      skills: skillSources.length ? skillSources : undefined,
      summarizationMiddlewareOptions,
      checkpointer: this.options.getCheckpointer(),
      interruptOn: { ...capabilities.interruptOn, ...scaffold.interruptOn },
      subagents: subAgents,
      middleware: [
        ...scaffold.middlewares,
        createOrphanToolCallStripperMiddleware(),
        createHumanRespondMessageMiddleware(),
        createTaskToolCompatMiddleware(),
        modelCallLimitMiddleware(MIDDLEWARE_CONFIG.modelCallLimit),
        toolCallLimitMiddleware(MIDDLEWARE_CONFIG.toolCallLimit),
        ...(memorySources.length
          ? [createReadonlyMemoryMiddleware({ backend: scaffold.backend, sources: memorySources })]
          : []),
        ...(fallbackModels.length
          ? [createInstrumentedFallbackMiddleware(fallbackModels, fallbackModelId => {
              this.options.onModelFallback(threadId, fallbackModelId)
            })]
          : []),
        createRateLimitRetryMiddleware(),
      ],
      contextSchema: IWriterAgentContextSchema,
    })

    return { agent, scaffold }
  }
}
