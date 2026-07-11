import type { GitFileChange } from '@/types/git'

/** SCM 文件列表的树/列表统一行模型 */
export interface ScmTreeRow {
  depth: number
  kind: 'dir' | 'file'
  label: string
  /** kind==='file' 时携带原始变更 */
  file?: GitFileChange
}

/** 把扁平文件列表按目录构建成树，DFS 成带 depth 的行（目录常展开，目录在前、文件在后，各自按名排序）。 */
export function buildScmTreeRows(files: GitFileChange[]): ScmTreeRow[] {
  interface Node { dirs: Map<string, Node>; files: GitFileChange[] }
  const root: Node = { dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    parts.pop() // 去掉文件名，剩目录段
    let node = root
    for (const seg of parts) {
      let child = node.dirs.get(seg)
      if (!child) { child = { dirs: new Map(), files: [] }; node.dirs.set(seg, child) }
      node = child
    }
    node.files.push(f)
  }
  const rows: ScmTreeRow[] = []
  const walk = (node: Node, depth: number) => {
    for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      rows.push({ depth, kind: 'dir', label: name })
      walk(child, depth + 1)
    }
    for (const f of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push({ depth, kind: 'file', label: f.name, file: f })
    }
  }
  walk(root, 0)
  return rows
}
