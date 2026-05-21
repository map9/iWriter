import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  CompositeBackend,
  FilesystemBackend,
  createSkillsMiddleware,
} from 'deepagents'
import type { AgentMiddleware, InterruptOnConfig } from 'langchain'

export interface BuildAgentFilesystemInput {
  workspacePath: string | null
  aiRootPath: string
  includeSkills: boolean
}

export interface AgentFilesystemScaffold {
  backend: CompositeBackend
  middlewares: AgentMiddleware[]
  interruptOn: Record<string, InterruptOnConfig>
  interruptOnNames: Set<string>
  tempDirs: string[]
  fingerprint: string
}

const FILE_WRITE_INTERRUPT_ON: Record<string, InterruptOnConfig> = {
  write_file: { allowedDecisions: ['approve', 'reject'] },
  edit_file: { allowedDecisions: ['approve', 'reject'] },
}

export const FILE_WRITE_INTERRUPT_ON_NAMES = new Set(Object.keys(FILE_WRITE_INTERRUPT_ON))

export function buildAgentFilesystem(input: BuildAgentFilesystemInput): AgentFilesystemScaffold {
  const mainRoot = input.workspacePath ?? path.join(input.aiRootPath, 'empty-fs')
  const largeResultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iwriter-large-tool-results-'))
  const conversationHistoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iwriter-conversation-history-'))

  const backend = new CompositeBackend(
    new FilesystemBackend({ rootDir: mainRoot, virtualMode: false }),
    {
      '/large_tool_results/': new FilesystemBackend({
        rootDir: largeResultsDir,
        virtualMode: true,
      }),
      '/conversation_history/': new FilesystemBackend({
        rootDir: conversationHistoryDir,
        virtualMode: true,
      }),
    },
  )

  const middlewares = input.includeSkills
    ? [
        createSkillsMiddleware({
          backend: new FilesystemBackend(),
          sources: [
            path.join(input.aiRootPath, 'skills'),
            path.join(input.aiRootPath, 'skills', 'writing-style'),
          ],
        }) as AgentMiddleware,
      ]
    : []

  return {
    backend,
    middlewares,
    interruptOn: FILE_WRITE_INTERRUPT_ON,
    interruptOnNames: new Set(Object.keys(FILE_WRITE_INTERRUPT_ON)),
    tempDirs: [largeResultsDir, conversationHistoryDir],
    fingerprint: `${input.workspacePath ?? ''}:${input.includeSkills ? 'skills' : 'no-skills'}`,
  }
}
