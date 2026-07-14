import type { GitCommit, GitCommitRef } from '@/types/git'

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
  /** 布局中使用的最大泳道数 */
  laneCount: number
}

/** 当前行实际绘制到的最右泳道数，用于避免被其它行的分支数撑宽。 */
export function getGraphRowLaneCount(row: GraphRow): number {
  let maxCol = row.nodeCol
  for (const segment of row.segments) {
    maxCol = Math.max(maxCol, segment.fromCol, segment.toCol)
  }
  return maxCol + 1
}

/** 本地引用尚未有指向同一提交的远程引用。 */
export function hasUnpublishedLocalRef(refs: GitCommitRef[] | undefined): boolean {
  if (!refs?.some(ref => ref.kind === 'head' || ref.kind === 'branch')) return false
  return !refs.some(ref => ref.kind === 'remote')
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
  // 每条 lane 等待的下一个提交及当前分支段的颜色；null = 空闲可回收。
  // 颜色属于「段」而不是 commit：遇到分支引用时，首父向下的段必须切换颜色。
  type Lane = { hash: string; color: string }
  const lanes: (Lane | null)[] = []
  const branchColors = new Map<string, string>()
  let colorCounter = 0
  const nextColor = (): string => GRAPH_LANE_COLORS[colorCounter++ % GRAPH_LANE_COLORS.length] as string

  const branchColorKey = (refs: GitCommitRef[] | undefined): string | undefined => {
    const local = refs?.find(ref => ref.kind === 'head' || ref.kind === 'branch')
    if (local) return local.name
    const remote = refs?.find(ref => ref.kind === 'remote' && !ref.name.endsWith('/HEAD'))
    return remote?.name.replace(/^[^/]+\//, '')
  }

  const colorForBranchRef = (refs: GitCommitRef[] | undefined): string | undefined => {
    const key = branchColorKey(refs)
    if (!key) return undefined
    let color = branchColors.get(key)
    if (!color) {
      color = nextColor()
      branchColors.set(key, color)
    }
    return color
  }

  const firstFree = (): number => {
    const i = lanes.indexOf(null)
    return i === -1 ? lanes.length : i
  }
  const laneIndex = (hash: string): number => lanes.findIndex(lane => lane?.hash === hash)

  const rows: GraphRow[] = []
  let laneCount = 0

  for (const commit of commits) {
    const above = lanes.slice()
    const refColor = colorForBranchRef(commit.refs)

    // 1) 定位 node 列：首个等待本提交的 lane；无则新起一条（分支 tip）
    let nodeCol = laneIndex(commit.hash)
    if (nodeCol === -1) {
      nodeCol = firstFree()
      lanes[nodeCol] = { hash: commit.hash, color: refColor ?? nextColor() }
    }
    const nodeColor = refColor ?? lanes[nodeCol]!.color

    // 2) 其余等待本提交的 lane 汇入 node → 置空
    for (let j = 0; j < lanes.length; j++) {
      if (j !== nodeCol && lanes[j]?.hash === commit.hash) lanes[j] = null
    }

    // 3) 分配父提交，并记录本提交为各父路由到的列（供下半连线，避免误连其它提交经过的同父 lane）
    const parents = commit.parents ?? []
    const parentCols: number[] = []
    if (parents.length === 0) {
      lanes[nodeCol] = null // 根提交：node 后此 lane 终止
    } else {
      // 首父续在 nodeCol。带分支引用的节点在此处开启新的分支段颜色。
      const p0 = parents[0] as string
      lanes[nodeCol] = { hash: p0, color: nodeColor }
      parentCols.push(nodeCol)
      // 其余父：复用已等待该父的 lane（合并汇入），否则取空位新建（各自新色）
      for (let k = 1; k < parents.length; k++) {
        const p = parents[k] as string
        let col = laneIndex(p)
        if (col === -1) {
          col = firstFree()
          lanes[col] = { hash: p, color: nextColor() }
        }
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
      const lane = above[c]
      if (!lane || lane.hash === commit.hash) continue
      if (below[c]?.hash === lane.hash) {
        segments.push({ fromCol: c, toCol: c, color: lane.color, half: 'full' })
      }
    }
    // 4b) 上半：保留进入当前节点的分支段颜色。
    for (let c = 0; c < above.length; c++) {
      const lane = above[c]
      if (lane?.hash === commit.hash) {
        segments.push({ fromCol: c, toCol: nodeCol, color: lane.color, half: 'top' })
      }
    }
    // 4c) 下半：使用节点开启的分支段颜色。
    for (const col of parentCols) {
      segments.push({ fromCol: nodeCol, toCol: col, color: below[col]?.color ?? nodeColor, half: 'bottom' })
    }

    rows.push({ hash: commit.hash, nodeCol, color: nodeColor, segments })
  }

  return { rows, laneCount: Math.max(laneCount, 1) }
}
