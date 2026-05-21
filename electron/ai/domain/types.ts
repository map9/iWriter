import type { StructuredTool } from '@langchain/core/tools'
import type { SubAgent } from 'deepagents'
import type { InterruptOnConfig } from 'langchain'

export interface DomainAgentCapabilities {
  tools: StructuredTool[]
  subAgents?: SubAgent[]
  interruptOn?: Record<string, InterruptOnConfig>
}
