import { Editor } from "@tiptap/core";

export const goToSelection = (editor: Editor, range: {from: number, to: number}) => {
  if (!editor || !range) return

  editor.commands.setTextSelection(range);

  const { node } = editor.view.domAtPos(
    editor.state.selection.anchor
  )
  
  if (node instanceof HTMLElement) {
    node.scrollIntoView({ behavior: "smooth", block: "center" })
  }
}