import type { StructuredTool } from '@langchain/core/tools'
import type { BackendProtocol, CompositeBackend, FilesystemBackend, LocalShellBackend, SubAgent } from 'deepagents'

export interface DomainAgentCapabilities {
  tools: StructuredTool[]
  skills: string[]
  backend?: BackendProtocol | CompositeBackend | FilesystemBackend | LocalShellBackend
  interruptOn?: Record<string, { allowedDecisions: string[] }>
  subAgents?: SubAgent[]
}
