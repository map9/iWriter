import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  CompositeBackend,
  FilesystemBackend,
  createFilesystemMiddleware,
} from 'deepagents'
import type { AgentMiddleware, InterruptOnConfig } from 'langchain'

export interface BuildAgentFilesystemInput {
  workspacePath: string | null
  aiRootPath: string
  skillSources?: string[]
}

export interface AgentFilesystemScaffold {
  backend: CompositeBackend
  middlewares: AgentMiddleware[]
  workspaceSystemPrompt: string
  interruptOn: Record<string, InterruptOnConfig>
  interruptOnNames: Set<string>
  tempDirs: string[]
  fingerprint: string
}

const FILE_WRITE_INTERRUPT_ON: Record<string, InterruptOnConfig> = {
  write_file: { allowedDecisions: ['approve', 'reject'] },
  edit_file: { allowedDecisions: ['approve', 'reject'] },
  rename_file: { allowedDecisions: ['approve', 'reject'] },
  delete_file: { allowedDecisions: ['approve', 'reject'] },
  move_file: { allowedDecisions: ['approve', 'reject'] },
}

export const FILE_WRITE_INTERRUPT_ON_NAMES = new Set(Object.keys(FILE_WRITE_INTERRUPT_ON))

function buildWorkspaceSystemPrompt(workspacePath: string | null): string {
  if (!workspacePath) {
    return `
## Current Workspace

No workspace is currently open. Use only absolute paths explicitly supplied by the user or attachments.
Keep virtual paths under \`/large_tool_results/\` and \`/conversation_history/\` unchanged.
`.trim()
  }

  const absoluteWorkspacePath = path.resolve(workspacePath)
  return `
## Current Workspace

The current workspace absolute path is ${JSON.stringify(absoluteWorkspacePath)}.

- All filesystem paths must be absolute paths.
- Construct workspace file paths under ${JSON.stringify(absoluteWorkspacePath)}.
- Preserve explicit external absolute paths supplied by the user or attachments.
- Keep virtual paths under \`/large_tool_results/\` and \`/conversation_history/\` unchanged.
`.trim()
}

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

  const workspaceSystemPrompt = buildWorkspaceSystemPrompt(input.workspacePath)
  const middlewares = [
    createFilesystemMiddleware({
      backend,
      systemPrompt: workspaceSystemPrompt,
    }) as AgentMiddleware,
  ]
  const skillSources = input.skillSources ?? []

  return {
    backend,
    middlewares,
    workspaceSystemPrompt,
    interruptOn: FILE_WRITE_INTERRUPT_ON,
    interruptOnNames: new Set(Object.keys(FILE_WRITE_INTERRUPT_ON)),
    tempDirs: [largeResultsDir, conversationHistoryDir],
    fingerprint: `${input.workspacePath ?? ''}:${skillSources.join('|') || 'no-skills'}`,
  }
}
