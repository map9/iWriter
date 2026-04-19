import { LocalShellBackend } from 'deepagents'
import type { DomainAgentCapabilities } from '../types'
import { buildCreativeArtifactTools } from '../../tools/CreativeArtifactTools'

export function buildCreativeCapabilities(aiRootPath: string): DomainAgentCapabilities {
  return {
    tools: [...buildCreativeArtifactTools(aiRootPath)],
    skills: ['/skills/'],
    backend: new LocalShellBackend({ rootDir: aiRootPath }),
  }
}
