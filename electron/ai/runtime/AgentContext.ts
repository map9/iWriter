import { z } from 'zod'

export const IWriterAgentContextSchema = z.object({
  threadId: z.string(),
  agentDomain: z.enum(['editing', 'creative']),
  activeFilePath: z.string().nullable(),
  workspacePath: z.string().nullable(),
  outputLanguage: z.string(),
  attachedTextFilePaths: z.array(z.string()),
  attachedBinaryFilePaths: z.array(z.string()),
  attachedDirectories: z.array(z.string()),
})

export type IWriterAgentContext = z.infer<typeof IWriterAgentContextSchema>
