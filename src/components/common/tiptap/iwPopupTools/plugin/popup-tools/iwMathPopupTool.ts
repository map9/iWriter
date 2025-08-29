import { TextSelection } from '@tiptap/pm/state'
import type { Mark } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'

import { iwPopupTool } from '../iwPopupTool.ts'
import type { iwPopupToolOptions } from '../iwPopupTool.ts'
import { iwPopupToolsPluginKey } from '../iwPopupToolsPlugin.ts'

export interface iwMathPopupToolOptions extends iwPopupToolOptions {
  openOnClickFun?: (url: string) => void
}

const createEditWidget = (
  tool: iwPopupTool,
  from: number, to: number, mark: Mark,
  editor: Editor
): HTMLElement => {
  return document.createElement('div')
}

export class iwMathPopupTool extends iwPopupTool {
  constructor() {
    super({
      type: 'link',
      createEditWidget: (tool: iwPopupTool, from: number, to: number, mark: Mark, editor: Editor): HTMLElement => {
        return createEditWidget(tool, from, to, mark, editor)

      },
      openOnClickFun: (url: string) => {}
    })
  }
}

export default iwMathPopupTool
