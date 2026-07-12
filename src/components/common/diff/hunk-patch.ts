// Hunk 级 stage/discard 的补丁工具：把前端 diff（old↔new 内容）转成 git 可 apply 的
// 单-hunk unified diff 补丁。用于 SOURCE_CONTROL F2/F7 的行/块级暂存。
// 设计见 design/SOURCE_CONTROL/SOURCE_CONTROL.md（F7.4 / F2 hunk）。

import { structuredPatch } from 'diff'

export interface DiffHunk {
  /** 在整份 diff 的 hunks 中的序号（0 起） */
  index: number
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  /** 带前缀（' '|'+'|'-'|'\'）的行 */
  lines: string[]
}

/** 计算 old→new 的 git 风格 hunks（context=3，与 git apply 定位一致） */
export function computeHunks(oldContent: string, newContent: string): DiffHunk[] {
  const p = structuredPatch('a', 'b', oldContent, newContent, '', '', { context: 3 })
  return p.hunks.map((h, i) => ({
    index: i,
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines,
  }))
}

/**
 * 为指定 hunk 构造可被 `git apply` 的单-hunk 补丁（路径相对仓库根）。
 * 路径不做引用转义：仓库以 core.quotepath=false 运行，UTF-8 路径原样即可。
 */
export function buildHunkPatch(filePath: string, hunk: DiffHunk): string {
  const header = `--- a/${filePath}\n+++ b/${filePath}\n`
  const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`
  const body = hunk.lines.join('\n') + '\n'
  return header + hunkHeader + body
}
