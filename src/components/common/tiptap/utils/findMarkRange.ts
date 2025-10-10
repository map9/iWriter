import type { EditorState } from '@tiptap/pm/state'

export function findMarkRange(state: EditorState, pos: number, markTypeName: string) {
  const $pos = state.doc.resolve(pos);
  const markType = state.schema.marks[markTypeName];
  if (!markType) return null;

  const node = $pos.parent.maybeChild($pos.index());
  if (!node || !node.isText) return null;

  const mark = node.marks.find(m => m.type === markType);
  if (!mark) return null;

  const childBefore = $pos.parent.childBefore($pos.parentOffset);
  let start = $pos.start() + $pos.parent.childBefore($pos.parentOffset).offset;
  if (
    childBefore.node !== node &&
    node.marks.some(m => m.type === markType)
  ) {
    start = $pos.start() + $pos.parentOffset;
  }
  let end = start + node.nodeSize;

  // 向前扩展
  let index = $pos.index();
  while (index > 0) {
    const prev = $pos.parent.child(index - 1);
    if (!prev.isText || !prev.marks.some(m => m.eq(mark))) break;
    index--;
    start -= prev.nodeSize;
  }

  // 向后扩展
  index = $pos.index() + 1;
  while (index < $pos.parent.childCount) {
    const next = $pos.parent.child(index);
    if (!next.isText || !next.marks.some(m => m.eq(mark))) break;
    end += next.nodeSize;
    index++;
  }

  return { from: start, to: end, element: mark };
}