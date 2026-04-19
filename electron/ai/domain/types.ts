import type { StructuredTool } from '@langchain/core/tools'
import type { CompositeBackend, FilesystemBackend, LocalShellBackend } from 'deepagents'

export interface DomainAgentCapabilities {
  tools: StructuredTool[]
  skills: string[]
  backend?: CompositeBackend | FilesystemBackend | LocalShellBackend
  interruptOn?: Record<string, { allowedDecisions: string[] }>
}
