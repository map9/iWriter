import type { NodeViewProps } from '@tiptap/vue-3'

export function isSelectionInsideNode({
  node,
  editor,
  getPos,
}: Pick<NodeViewProps, 'node' | 'editor' | 'getPos'>): boolean {
  const { state } = editor
  const selection = state.selection

  const pos = getPos?.()
  if (pos == null) return false

  const end = pos + node.nodeSize
  return selection.from >= pos && selection.to <= end
}