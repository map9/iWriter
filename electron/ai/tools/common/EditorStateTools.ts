import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { EditorStateBroker } from '../../document/EditorStateBroker'

export function buildEditorStateTool(editorStateBroker: EditorStateBroker) {
  return tool(
    async () => {
      const state = await editorStateBroker.requestEditorState()
      return state
        ? JSON.stringify(state, null, 2)
        : 'Error: Editor state is currently unavailable.'
    },
    {
      name: 'get_editor_state',
      description:
        'Get the current iWriter UI state on demand: active document path or virtual ID, file type, dirty status, outline, cursor section, selection, and other open tabs. Call this when the task depends on what is currently open or selected; the result is a live snapshot and may change between calls.',
      schema: z.object({}),
    },
  )
}
