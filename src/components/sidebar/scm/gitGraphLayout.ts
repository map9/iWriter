import type { GitCommit } from '@/types/git'

/**
 * 提交泳道图（DAG）布局算法 —— 纯函数、无副作用、可测试。
 *
 * 输入：按新→旧排序的提交（每个带 `parents` 全 hash）。
 * 输出：每个提交一行的渲染指令（node 所在列 + 连线段），以及总列数。
 *
 * 模型：维护跨行的 `lanes`，每条 lane 记录它「等待」出现的下一个提交 hash。
 * 逐行（新→旧）处理：等待本提交的 lane 汇入 node，本提交的父提交占据/新建 lane。
 * **列稳定**（不做中途左移，只回收 null 空位）→ 宽度有界、pass-through 恒为竖直线。
 */

/** 一段连线：从本行上边界的 fromCol 连到下边界的 toCol；half 决定竖向覆盖范围 */
export interface GraphSegment {
  fromCol: number
  toCol: number
  color: string
  /** full=贯穿整行（pass-through）；top=上半（子→node）；bottom=下半（node→父） */
  half: 'full' | 'top' | 'bottom'
}

export interface GraphRow {
  hash: string
  /** node（提交点）所在列 */
  nodeCol: number
  /** node 颜色（= 本提交所在分支色） */
  color: string
  segments: GraphSegment[]
}

export interface GraphLayout {
  rows: GraphRow[]
  /** 总列数（gutter 宽度据此计算） */
  laneCount: number
}

/**
 * 泳道调色板：在明/暗主题下均可读的固定色（刻意不用 daisyUI 语义 token，
 * 规避主题实时联动；对标 gitk / VS Code Git Graph 的多色 lane）。
 */
export const GRAPH_LANE_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#a855f7', // purple
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
] as const

export function computeGraphLayout(commits: GitCommit[]): GraphLayout {
  // 每条 lane 等待的下一个提交 hash；null = 空闲可回收
  const lanes: (string | null)[] = []
  // 每个 hash（作为某条 lane 的期望值时）对应的稳定颜色
  const colorOf = new Map<string, string>()
  let colorCounter = 0
  const assignColor = (hash: string): string => {
    let c = colorOf.get(hash)
    if (!c) {
      c = GRAPH_LANE_COLORS[colorCounter % GRAPH_LANE_COLORS.length] as string
      colorCounter++
      colorOf.set(hash, c)
    }
    return c
  }

  const firstFree = (): number => {
    const i = lanes.indexOf(null)
    return i === -1 ? lanes.length : i
  }

  const rows: GraphRow[] = []
  let laneCount = 0

  for (const commit of commits) {
    const above = lanes.slice()

    // 1) 定位 node 列：首个等待本提交的 lane；无则新起一条（分支 tip）
    let nodeCol = lanes.indexOf(commit.hash)
    if (nodeCol === -1) {
      nodeCol = firstFree()
      lanes[nodeCol] = commit.hash
      assignColor(commit.hash) // tip 分配新色
    }
    const nodeColor = colorOf.get(commit.hash) ?? assignColor(commit.hash)

    // 2) 其余等待本提交的 lane 汇入 node → 置空
    for (let j = 0; j < lanes.length; j++) {
      if (j !== nodeCol && lanes[j] === commit.hash) lanes[j] = null
    }

    // 3) 分配父提交，并记录本提交为各父路由到的列（供下半连线，避免误连其它提交经过的同父 lane）
    const parents = commit.parents ?? []
    const parentCols: number[] = []
    if (parents.length === 0) {
      lanes[nodeCol] = null // 根提交：node 后此 lane 终止
    } else {
      // 首父续在 nodeCol，并继承 node 颜色（主干同色）
      const p0 = parents[0] as string
      lanes[nodeCol] = p0
      if (!colorOf.has(p0)) colorOf.set(p0, nodeColor)
      parentCols.push(nodeCol)
      // 其余父：复用已等待该父的 lane（合并汇入），否则取空位新建（各自新色）
      for (let k = 1; k < parents.length; k++) {
        const p = parents[k] as string
        let col = lanes.indexOf(p)
        if (col === -1) {
          col = firstFree()
          lanes[col] = p
        }
        assignColor(p)
        parentCols.push(col)
      }
    }

    const below = lanes.slice()
    const width = Math.max(above.length, below.length)
    if (width > laneCount) laneCount = width

    // 4) 生成连线段
    const segments: GraphSegment[] = []
    // 4a) pass-through：同一 hash 在 above/below 同列且非本提交 → 贯穿竖线
    for (let c = 0; c < above.length; c++) {
      const h = above[c]
      if (!h || h === commit.hash) continue
      if (below[c] === h) {
        segments.push({ fromCol: c, toCol: c, color: colorOf.get(h) ?? nodeColor, half: 'full' })
      }
    }
    // 4b) 上半：above 中等待本提交的每列 → 汇入 node（含 nodeCol 自身的上半竖线）
    for (let c = 0; c < above.length; c++) {
      if (above[c] === commit.hash) {
        segments.push({ fromCol: c, toCol: nodeCol, color: nodeColor, half: 'top' })
      }
    }
    // 4c) 下半：仅本提交路由的父列 → 从 node 分出（每父一段）
    for (const col of parentCols) {
      const h = below[col]
      segments.push({ fromCol: nodeCol, toCol: col, color: (h ? colorOf.get(h) : undefined) ?? nodeColor, half: 'bottom' })
    }

    rows.push({ hash: commit.hash, nodeCol, color: nodeColor, segments })
  }

  return { rows, laneCount: Math.max(laneCount, 1) }
}
