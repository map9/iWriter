import * as path from 'path'
import type { ResumeDecision } from '../../ipc/protocol'

// ── Stage 2 — 写作会话授权（04.1 §6，五段裁决级联中唯一新增裁决源）─────────────
//
// host 在 deepagents 之上持有的**会话登记**，域无关（edit/creative 都可能有写作会话）。
// 落地 §5.3 的"授权登记 + 懒激活"：
//   1. confirm_writing_plan 在 Stage 5 被 approve/edit 时 → registerAuthorization 登记
//      {计划文本, 章节清单}（普通 S05 清单长度 1，S07 重构为多章）。
//   2. 块级编辑首次命中授权清单中某正文文件 → ensureActiveSession 懒激活：此刻按 §5 设计 7
//      的单一路由取基线快照（消除批准到动笔之间的基线陈旧）→ 自动放行并计入累积。
//   3. 会话闭合触发整章终审（基线 vs 现状聚合 diff 卡）。
//
// 授权域**只含计划声明的正文文件**——章纲及其它对象永不自动放行（SA02 越界即现形、照常人工
// 评审，越权面最小化）。会话内 create_document 造新章不进本段自动放行（新建面风险高于就地编辑）。
//
// ⚠️ M0 状态：本模块是**已单测的机制骨架，尚未接入 live 审批管线**。原因见 AgentEngine
// `_prepareActionRequestsForReview` 的 Stage 2 注释——块级编辑工具体不改文档，真实 TipTap
// 变更由 renderer 只对"评审批次"里的项应用（executor.flushReviewedBatch）；若在 host 侧
// auto-approve 一个块编辑，会对 LangGraph 记为已应用而文档实际未变（幻影编辑）。故写作会话的
// auto-approve 必须与 M1 的 renderer 自动应用批次 + 整章终审一起落地；届时 AgentEngine 在
// Stage 1 与 Stage 3 之间接入本模块（登记 / 懒激活 / 累积 / 关闭已就位）。

/** 参与写作会话自动累积的块级编辑工具（create_document 排除，见 04.1 §6）。 */
const BLOCK_EDIT_TOOL_NAMES = new Set([
  'edit_block',
  'insert_block',
  'delete_block',
  'replace_range',
])

export function isBlockEditToolName(toolName: string): boolean {
  return BLOCK_EDIT_TOOL_NAMES.has(toolName)
}

/** 与 Stage 1（FilesystemApprovalDecision）同格的纯裁决结果。 */
export type WritingSessionDecision =
  | { kind: 'auto-approve'; decision: ResumeDecision; activateFile: string; reason: string }
  | { kind: 'requires-review'; reason: string }

export interface WritingSessionApprovalInput {
  toolName: string
  args: Record<string, unknown>
  /** 当前已授权自动累积的正文文件（规范化绝对路径），来自被 approve 的 confirm_writing_plan。 */
  authorizedFiles: Set<string>
}

/** 规范化文件路径用于授权匹配。虚拟未保存文档（virtual_id，如 "untitled:..."）不参与磁盘授权匹配。 */
function normalizeFilePath(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // 未保存文档的 virtual_id 不是磁盘对象，无法纳入以正文文件为单位的授权域。
  if (!path.isAbsolute(trimmed)) return null
  return path.resolve(trimmed)
}

/** 取块级编辑工具调用的目标正文文件；无显式 file_path（作用于活动文档）→ null（无法确定性匹配授权）。 */
function extractTargetFile(args: Record<string, unknown>): string | null {
  const fp = args.file_path
  if (typeof fp !== 'string') return null
  return normalizeFilePath(fp)
}

/**
 * Stage 2 纯裁决（与 Stage 1 同格，插在 Stage 1 与域级 Stage 3 之间）。
 *
 * 只有块级编辑工具、且目标正文文件命中活动授权域 → 自动放行（并由调用方懒激活取基线、计入累积）；
 * 其余（create_document、未授权/域外文件、无显式 file_path 的活动文档编辑）→ 交后续人工。
 */
export function decideWritingSessionApproval(
  input: WritingSessionApprovalInput,
): WritingSessionDecision {
  if (!isBlockEditToolName(input.toolName)) {
    // create_document 及非块级工具永不在本段自动放行。
    return { kind: 'requires-review', reason: 'Not a session-accumulating block-edit tool.' }
  }

  const target = extractTargetFile(input.args)
  if (target === null) {
    return {
      kind: 'requires-review',
      reason: 'Block edit without an explicit disk target file cannot be matched to a write-session authorization.',
    }
  }

  if (!input.authorizedFiles.has(target)) {
    return {
      kind: 'requires-review',
      reason: 'Target file is outside any active write-session authorization.',
    }
  }

  return {
    kind: 'auto-approve',
    decision: { type: 'approved' },
    activateFile: target,
    reason: 'Block edit within an authorized write-session scope.',
  }
}

// ── 会话登记（host 持有）─────────────────────────────────────────────────────

/** 会话累积的单条块级编辑记录（供 M1 整章终审 diff 与忠实度核查回溯）。 */
export interface AccumulatedEdit {
  toolName: string
  args: Record<string, unknown>
  at: number
}

/** 一个活动写作会话——一个正文文件至多一个。 */
export interface ActiveWritingSession {
  targetFile: string
  /** 懒激活时按单一路由取的基线快照（M0：调用方注入的 capturer 提供；未注入则 null）。 */
  baselineSnapshot: string | null
  accumulated: AccumulatedEdit[]
}

interface ThreadWritingState {
  /** 规范化绝对路径 → 授权成员。跨文件会话可并存。 */
  authorizedFiles: Set<string>
  /** 最近一次被批准的计划文本（SS11 忠实度核查基准）。 */
  planText: string
  /** 已懒激活的会话，key = 规范化正文文件路径。 */
  activeSessions: Map<string, ActiveWritingSession>
}

/** 懒激活时捕获基线快照的注入点。M0 由 AgentEngine 注入磁盘读取；M1 扩展为单一路由（打开的文件取编辑器缓冲）。 */
export type BaselineCapturer = (threadId: string, targetFile: string) => string | null

export class WritingSessionRegistry {
  private byThread = new Map<string, ThreadWritingState>()
  private readonly captureBaseline: BaselineCapturer

  constructor(captureBaseline?: BaselineCapturer) {
    this.captureBaseline = captureBaseline ?? (() => null)
  }

  /** Stage 5：confirm_writing_plan 被 approve/edit → 登记授权域（计划文本 + 正文文件清单）。 */
  registerAuthorization(threadId: string, planText: string, targetFiles: string[]): void {
    const state = this._ensure(threadId)
    state.planText = planText
    for (const raw of targetFiles) {
      if (typeof raw !== 'string') continue
      const norm = normalizeFilePath(raw)
      if (norm) state.authorizedFiles.add(norm)
    }
  }

  /** 当前线程的授权正文文件集合（供 Stage 2 纯裁决）。 */
  getAuthorizedFiles(threadId: string): Set<string> {
    return this.byThread.get(threadId)?.authorizedFiles ?? new Set()
  }

  getPlanText(threadId: string): string | null {
    return this.byThread.get(threadId)?.planText ?? null
  }

  hasActiveSession(threadId: string, targetFile: string): boolean {
    const key = normalizeFilePath(targetFile)
    if (!key) return false
    return this.byThread.get(threadId)?.activeSessions.has(key) ?? false
  }

  getActiveSession(threadId: string, targetFile: string): ActiveWritingSession | undefined {
    const key = normalizeFilePath(targetFile)
    if (!key) return undefined
    return this.byThread.get(threadId)?.activeSessions.get(key)
  }

  /**
   * 懒激活：首次命中授权正文文件时激活会话并**恰好一次**捕获基线快照；后续命中返回同一会话。
   * 幂等——重复调用不重取基线。
   */
  ensureActiveSession(threadId: string, targetFile: string): ActiveWritingSession {
    const state = this._ensure(threadId)
    const key = normalizeFilePath(targetFile)
    if (!key) throw new Error('[WritingSessionRegistry] ensureActiveSession requires an absolute file path')
    let session = state.activeSessions.get(key)
    if (!session) {
      session = {
        targetFile: key,
        baselineSnapshot: this.captureBaseline(threadId, key),
        accumulated: [],
      }
      state.activeSessions.set(key, session)
    }
    return session
  }

  /** 记录一条自动放行的块级编辑到活动会话累积。 */
  recordAccumulation(threadId: string, targetFile: string, edit: AccumulatedEdit): void {
    const session = this.ensureActiveSession(threadId, targetFile)
    session.accumulated.push(edit)
  }

  /** 会话闭合（M1 整章终审后调用）：移除并返回该会话。授权成员保留至清单全部终审或显式取消。 */
  closeSession(threadId: string, targetFile: string): ActiveWritingSession | undefined {
    const key = normalizeFilePath(targetFile)
    if (!key) return undefined
    const state = this.byThread.get(threadId)
    if (!state) return undefined
    const session = state.activeSessions.get(key)
    state.activeSessions.delete(key)
    return session
  }

  /** 作者显式取消授权 / 线程销毁：清空该线程全部授权与活动会话。 */
  clearThread(threadId: string): void {
    this.byThread.delete(threadId)
  }

  /** 清空全部线程（clearThreads）。 */
  clearAll(): void {
    this.byThread.clear()
  }

  private _ensure(threadId: string): ThreadWritingState {
    let state = this.byThread.get(threadId)
    if (!state) {
      state = { authorizedFiles: new Set(), planText: '', activeSessions: new Map() }
      this.byThread.set(threadId, state)
    }
    return state
  }
}
