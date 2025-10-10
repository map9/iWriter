import type { EditorState } from '@tiptap/pm/state'

export function findNodeRange(state: EditorState, pos: number, nodeTypeName: string) {
  const nodeType = state.schema.nodes[nodeTypeName];
  if (!nodeType) return null;

  // 对于inline node，我们需要找到包含当前位置的节点
  const node = state.doc.nodeAt(pos);
  const nodePos = pos;
  
  /*
  if (!node) {
    // 如果直接在位置上没有节点，尝试查找前面的节点
    node = state.doc.nodeAt(pos - 1);
    nodePos = pos - 1;
  }
  */
 
  if (!node || node.type !== nodeType) return null;
  
  // 对于atomic inline node，节点的范围就是从nodePos到nodePos + nodeSize
  return { 
    from: nodePos, 
    to: nodePos + node.nodeSize, 
    element: node  // 为了兼容现有接口，这里称为mark，但实际是node
  };
}