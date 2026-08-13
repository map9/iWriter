import * as path from 'path'
import { isDeepStrictEqual } from 'node:util'
import type { ResumeDecision } from '@shared/ai/contracts'

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
// 评审，越权面最小化）。会话内 create_document **造新章**：目标命中授权清单（confirm_writing_plan 的
// target_files）时自动放行——该路径已在被批准的计划里露过脸，"新建面风险"已被前置授权覆盖；目标不在
// 授权域、或该文件已存在（避免静默覆盖，存在性检查由调用方 AgentEngine 做）→ 照常人工。
//
// 接入状态（M1b-3 已 live）：WritingSessionCoordinator 负责 approve/edit 后登记授权、命中授权域时
// 懒激活并累积、为 renderer 标记 autoApply，以及处理 finalize_chapter 的 close/restore/rework。
// 基线经协调器的统一快照路由捕获（打开的章节取编辑器缓冲、否则磁盘），显式传入
// recordAccumulation；本类内置的同步磁盘 capturer 仅作降级兜底。

/** 参与写作会话自动累积的块级编辑工具（create_document 走 decideWritingSessionApproval 的独立分支，
 * 不在本集合；见 04.1 §6 授权域内造新章例外）。 */
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
 * 取 create_document 的目标正文文件：directory+filename → 绝对路径（filename 无扩展名补 `.md`，与
 * renderer 的 normalizeCreateDocumentDiskFilename 对齐）。无 directory（内存 tab，不落盘）→ null，
 * 无法以正文文件为单位匹配授权。
 */
function extractCreateDocumentTarget(args: Record<string, unknown>): string | null {
  const dir = args.directory
  const filename = args.filename
  if (typeof dir !== 'string' || typeof filename !== 'string') return null
  const name = filename.trim()
  if (!name) return null
  const normalized = /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.md`
  return normalizeFilePath(path.join(dir, normalized))
}

/**
 * Stage 2 纯裁决（与 Stage 1 同格，插在 Stage 1 与域级 Stage 3 之间）。
 *
 * 块级编辑工具，或 create_document 造新章——目标正文文件命中活动授权域 → 自动放行（并由调用方懒激活取
 * 基线、计入累积）；其余（未授权/域外文件、无显式 file_path 的活动文档编辑、无 directory 的内存建档）→
 * 交后续人工。create_document 命中授权域返回 auto-approve，但**已存在文件的覆盖保护由调用方做**
 * （本函数保持无副作用、不碰 fs）。
 */
export function decideWritingSessionApproval(
  input: WritingSessionApprovalInput,
): WritingSessionDecision {
  if (input.toolName === 'create_document') {
    const target = extractCreateDocumentTarget(input.args)
    if (target === null) {
      return { kind: 'requires-review', reason: 'create_document without an absolute disk directory cannot be matched to a write-session authorization.' }
    }
    if (!input.authorizedFiles.has(target)) {
      return { kind: 'requires-review', reason: 'create_document target is outside any active write-session authorization.' }
    }
    return {
      kind: 'auto-approve',
      decision: { type: 'approved' },
      activateFile: target,
      reason: 'create_document for a new chapter file named in the approved write-session plan.',
    }
  }

  if (!isBlockEditToolName(input.toolName)) {
    // 非块级、非 create_document 的工具永不在本段自动放行。
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

// ── Stage 2b — 委派执行体的写入闸（"有会话才允许子 Agent 写正文"）──────────────
//
// 授权与执行体必须对齐：**子 Agent 的正文写入只在写作会话内成立**。主控自己改（逐块人工卡）与
// 子 Agent 改（会话内静默累积 + 整章终审）是两条不同的审批形态，此前却共用一条逐块卡路径——
// 于是修订链路上出现了"被授权的执行体反而每块弹卡、没有基线、失败无法整体回退"的倒挂。
//
// 本闸只做一件事：子 Agent 发起的块级编辑 / create_document，若目标不在任何活动授权域内 →
// **拒绝该次调用**，并在拒绝消息里告诉主控该怎么做（先开写作会话再委派）。绝不静默放行，
// 也绝不静默替作者登记授权——授权始终来自作者批准的 confirm_writing_plan。

/**
 * Which action requests in an interrupt came from a delegated subagent rather than the main agent.
 *
 * The interrupt payload does not record an originator, but the root agent's latest AIMessage does:
 * an action request whose (name, args) has no counterpart in that current root tool batch came from
 * a delegated turn. When the root batch is unavailable (empty), nothing is classified as delegated
 * — the gate must never fire on a guess, since a false positive rejects a legitimate main-agent edit.
 */
export function delegatedActionIndices(
  actionRequests: Array<{ name: string; args?: Record<string, unknown> }>,
  parentToolCalls: Array<{ name: string; args?: Record<string, unknown> }> | undefined,
): Set<number> {
  const delegated = new Set<number>()
  if (!parentToolCalls?.length) return delegated

  const consumedParentIndices = new Set<number>()
  actionRequests.forEach((ar, index) => {
    const parentIndex = parentToolCalls.findIndex((tc, candidateIndex) => {
      if (consumedParentIndices.has(candidateIndex) || tc.name !== ar.name) return false
      if (ar.args === undefined || tc.args === undefined) return true
      return isDeepStrictEqual(tc.args, ar.args)
    })
    if (parentIndex >= 0) {
      consumedParentIndices.add(parentIndex)
    } else {
      delegated.add(index)
    }
  })
  return delegated
}

export interface RootToolCall {
  id?: string
  name: string
  args?: Record<string, unknown>
}

/**
 * Read the current root-agent tool batch from the final state of an interrupted run.
 * This deliberately returns only the latest root AIMessage, never run-wide executed tools.
 */
export function currentRootToolCallsFromMessages(messages: unknown): RootToolCall[] | undefined {
  if (!Array.isArray(messages)) return undefined

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as {
      _getType?: () => string
      tool_calls?: unknown
    } | undefined
    if (message?._getType?.() !== 'ai') continue
    if (!Array.isArray(message.tool_calls)) return []

    return message.tool_calls.flatMap((raw): RootToolCall[] => {
      const toolCall = raw as {
        id?: unknown
        name?: unknown
        args?: unknown
      }
      if (typeof toolCall.name !== 'string') return []
      return [{
        ...(typeof toolCall.id === 'string' ? { id: toolCall.id } : {}),
        name: toolCall.name,
        ...(toolCall.args && typeof toolCall.args === 'object' && !Array.isArray(toolCall.args)
          ? { args: toolCall.args as Record<string, unknown> }
          : {}),
      }]
    })
  }

  return undefined
}

export interface DelegatedWriteGateInput {
  toolName: string
  args: Record<string, unknown>
  authorizedFiles: Set<string>
}

export type DelegatedWriteGateDecision =
  | { kind: 'reject'; decision: ResumeDecision; targetFile: string | null; reason: string }
  | { kind: 'pass' }

/** 该工具调用是否属于"写正文对象"的范畴（块级编辑或造新文档）。 */
function isDelegatedWriteTool(toolName: string): boolean {
  return isBlockEditToolName(toolName) || toolName === 'create_document'
}

/**
 * 子 Agent 写入闸（纯裁决，无副作用）。调用方负责判定 originator 是否为子 Agent，
 * 仅对子 Agent 发起的调用调用本函数。
 */
export function decideDelegatedWriteGate(
  input: DelegatedWriteGateInput,
): DelegatedWriteGateDecision {
  if (!isDelegatedWriteTool(input.toolName)) return { kind: 'pass' }

  const target =
    input.toolName === 'create_document'
      ? extractCreateDocumentTarget(input.args)
      : extractTargetFile(input.args)

  if (target !== null && input.authorizedFiles.has(target)) return { kind: 'pass' }

  const where = target ?? '(no absolute target file)'
  return {
    kind: 'reject',
    targetFile: target,
    reason: 'Delegated write outside any active write-session authorization.',
    decision: {
      type: 'rejected',
      message:
        `'${input.toolName}' was not applied: a delegated subagent may only write to a file covered by an ` +
        `active write-session authorization, and ${where} is not covered by one. This is a delegation ` +
        `contract error on the caller's side, not a problem with the edit. The main agent must approve a ` +
        `write-session (confirm_writing_plan naming this file in target_files) BEFORE delegating — on the ` +
        `revision link as well as the expansion link — and then re-delegate. Do not retry this call as-is, ` +
        `and do not route around it with write_file/edit_file.`,
    },
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
  /**
   * M1-2 归因：agent 最近一次自动应用批次落定后的章节快照（每次 resume 时由调用方经统一路由重取）。
   * 终审时 `current !== lastAgentSnapshot` ⇒ 存在「agent 已应用之后」发生的非 agent 改动（作者手改/外部改动）。
   * null = 尚未捕获过（未知，不据此标注）。
   */
  lastAgentSnapshot?: string | null
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
   * 线程的活动会话。默认只返回**有累积**（`accumulated.length > 0`）的会话——供 run-end 兜底终审判定
   * 「有累积但本轮未 finalize」（M1-1）。已 finalize 的会话在 approve/reject 时经 closeSession 移除，
   * 故仍在册且有累积 = 未收尾。传 `includeEmpty` 可返回全部活动会话。
   */
  getActiveSessions(
    threadId: string,
    includeEmpty = false,
  ): Array<{ file: string; session: ActiveWritingSession }> {
    const state = this.byThread.get(threadId)
    if (!state) return []
    const out: Array<{ file: string; session: ActiveWritingSession }> = []
    for (const [file, session] of state.activeSessions) {
      if (includeEmpty || session.accumulated.length > 0) out.push({ file, session })
    }
    return out
  }

  /** M1-2：记录 agent 最近一次自动应用落定后的快照（终审归因用，见 lastAgentSnapshot）。 */
  recordAgentSnapshot(threadId: string, targetFile: string, snapshot: string | null): void {
    const key = normalizeFilePath(targetFile)
    if (!key) return
    const session = this.byThread.get(threadId)?.activeSessions.get(key)
    if (session) session.lastAgentSnapshot = snapshot
  }

  /**
   * 懒激活：首次命中授权正文文件时激活会话并**恰好一次**捕获基线快照；后续命中返回同一会话。
   * 幂等——重复调用不重取基线。
   *
   * `baseline` 显式传入时用它（调用方经统一快照路由取"编辑器缓冲优先、否则磁盘"的基线，见
   * WritingSessionCoordinator 的统一快照路由）；未传入则回落到构造时注入的同步 capturer（测试/降级用）。
   */
  ensureActiveSession(threadId: string, targetFile: string, baseline?: string | null): ActiveWritingSession {
    const state = this._ensure(threadId)
    const key = normalizeFilePath(targetFile)
    if (!key) throw new Error('[WritingSessionRegistry] ensureActiveSession requires an absolute file path')
    let session = state.activeSessions.get(key)
    if (!session) {
      session = {
        targetFile: key,
        baselineSnapshot: baseline !== undefined ? baseline : this.captureBaseline(threadId, key),
        accumulated: [],
      }
      state.activeSessions.set(key, session)
    }
    return session
  }

  /** 记录一条自动放行的块级编辑到活动会话累积（首次命中时按 baseline 懒激活）。 */
  recordAccumulation(threadId: string, targetFile: string, edit: AccumulatedEdit, baseline?: string | null): void {
    const session = this.ensureActiveSession(threadId, targetFile, baseline)
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
