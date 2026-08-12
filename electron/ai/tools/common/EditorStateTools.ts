import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { EditorStateBroker } from '../../document/EditorStateBroker'

export function buildEditorStateTool(editorStateBroker: EditorStateBroker) {
  return tool(
    async ({ include_open_tabs }: { include_open_tabs?: boolean }) => {
      const state = await editorStateBroker.requestEditorState({
        includeOpenTabs: include_open_tabs === true,
      })
      return state
        ? JSON.stringify(state, null, 2)
        : 'Error: Editor state is currently unavailable.'
    },
    {
      name: 'get_editor_state',
      description:
        'Get the current iWriter editor context on demand: active document reference, file type, cursor block and section, and exact text selection. Other open tabs are omitted unless include_open_tabs is true. Call this when the task depends on what is currently open or selected; the result is a live snapshot and may change between calls.',
      schema: z.object({
        include_open_tabs: z
          .boolean()
          .optional()
          .describe('Set true only when the task depends on the other currently open tabs.'),
      }),
    },
  )
}
