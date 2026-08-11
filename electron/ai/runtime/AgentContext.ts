import { z } from 'zod'

export const IWriterAgentContextSchema = z.object({
  workspacePath: z.string().nullable(),
}).strict()

export type IWriterAgentContext = z.infer<typeof IWriterAgentContextSchema>
