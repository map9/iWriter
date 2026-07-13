import type { GitFileChange } from '@/types/git'

/** SCM 文件列表的树/列表统一行模型 */
export interface ScmTreeRow {
  depth: number
  kind: 'dir' | 'file'
  label: string
  /** kind==='file' 时携带原始变更 */
  file?: GitFileChange
  /** kind==='dir' 时的仓库相对目录路径 */
  path?: string
  /** kind==='dir' 时该目录下（含子目录）的全部变更文件——供目录级 stage/discard 等操作 */
  files?: GitFileChange[]
}

interface TreeNode { dirs: Map<string, TreeNode>; files: GitFileChange[] }

/** 收集某目录节点下（递归）的全部变更文件 */
function collectFiles(node: TreeNode): GitFileChange[] {
  const out = [...node.files]
  for (const child of node.dirs.values()) out.push(...collectFiles(child))
  return out
}

/** 把扁平文件列表按目录构建成树，DFS 成带 depth 的行（目录常展开，目录在前、文件在后，各自按名排序）。 */
export function buildScmTreeRows(files: GitFileChange[]): ScmTreeRow[] {
  const root: TreeNode = { dirs: new Map(), files: [] }
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
  const walk = (node: TreeNode, depth: number, prefix: string) => {
    for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const dirPath = prefix ? `${prefix}/${name}` : name
      rows.push({ depth, kind: 'dir', label: name, path: dirPath, files: collectFiles(child) })
      walk(child, depth + 1, dirPath)
    }
    for (const f of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push({ depth, kind: 'file', label: f.name, file: f })
    }
  }
  walk(root, 0, '')
  return rows
}
