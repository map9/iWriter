import type { StructuredTool } from '@langchain/core/tools'
import type { AnyBackendProtocol, SubAgent } from 'deepagents'

export interface DomainAgentCapabilities {
  tools: StructuredTool[]
  skills: string[]
  backend?: AnyBackendProtocol
  interruptOn?: Record<string, { allowedDecisions: string[] }>
  subAgents?: SubAgent[]
}
