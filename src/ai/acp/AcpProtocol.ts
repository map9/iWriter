/**
 * ACP Protocol type definitions.
 *
 * ACP (Agent Client Protocol) is Zed's open JSON-RPC 2.0 protocol
 * for integrating external CLI agents into an editor.
 *
 * Three categories of messages arriving on agent stdout:
 *   1. Response     — { jsonrpc, id, result | error }  — reply to a request we sent
 *   2. Request      — { jsonrpc, id, method, params }  — agent asking the client to do something
 *   3. Notification — { jsonrpc, method, params }       — fire-and-forget from agent (no id)
 *
 * We translate these into AcpEvent variants and hand them to AcpAgentSession.
 */

// ── Capability types returned in the initialize response ──────────────────────

export interface AcpModelInfo {
  id: string
  name: string
  description?: string
}

export interface AcpModeInfo {
  id: string
  name: string
  description?: string
}

export interface AcpToolCallInfo {
  id: string
  title: string
  kind: 'read' | 'edit' | 'write' | 'execute' | string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  filePaths?: string[]
}

export interface AcpMessageContent {
  type: 'text' | 'tool_use' | 'tool_result' | string
  text?: string
  id?: string
  name?: string
  input?: unknown
  content?: string | AcpMessageContent[]
  is_error?: boolean
}

export interface AcpSessionMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | AcpMessageContent[]
  thought?: string
}

export interface AcpSessionUpdateParams {
  messages?: AcpSessionMessage[]
  toolCalls?: AcpToolCallInfo[]
  models?: AcpModelInfo[]
  modes?: AcpModeInfo[]
  done?: boolean
  stopReason?: string
}

// ── Events emitted after parsing a raw stdout line ────────────────────────────

export type AcpEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'tool_result'; id: string; content: string; isError?: boolean }
  | { type: 'done'; stopReason?: string }
  | { type: 'error'; message: string }
  /** Received in response to our `initialize` request. */
  | { type: 'init_result'; models: AcpModelInfo[]; modes: AcpModeInfo[] }
  /** Received as `session/update` notification — full session state snapshot. */
  | {
      type: 'session_update'
      messages: AcpSessionMessage[]
      toolCalls: AcpToolCallInfo[]
      models?: AcpModelInfo[]
      modes?: AcpModeInfo[]
      done: boolean
    }
  /** Agent requesting user approval for a sensitive operation. */
  | {
      type: 'permission_request'
      requestId: number
      permission: string
      path?: string
      description?: string
      options: string[]
    }
  | { type: 'unknown'; raw: string }

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse one newline-delimited JSON line from agent stdout into an AcpEvent.
 *
 * @param line            Raw stdout line
 * @param pendingIds      (Optional) set of request IDs we are awaiting responses for;
 *                        matched IDs are deleted on receipt.
 */
export function parseAcpLine(line: string, pendingIds?: Set<number>): AcpEvent {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(line)
  } catch {
    return { type: 'unknown', raw: line }
  }

  // ── 1. JSON-RPC Response  { id, result } or { id, error } ─────────────────
  if ('id' in obj && !('method' in obj)) {
    const id = Number(obj.id)
    if (pendingIds?.has(id)) pendingIds.delete(id)

    if ('error' in obj) {
      const err = (obj.error ?? {}) as Record<string, unknown>
      return { type: 'error', message: String(err.message ?? line) }
    }

    const result = (obj.result ?? {}) as Record<string, unknown>
    // session/prompt response — has stopReason, signals end of streaming
    if (typeof result.stopReason === 'string') {
      return { type: 'done', stopReason: result.stopReason }
    }
    // initialize or session/new response
    return {
      type: 'init_result',
      models: (result.models as AcpModelInfo[] | undefined) ?? [],
      modes: (result.modes as AcpModeInfo[] | undefined) ?? [],
    }
  }

  // ── 2. JSON-RPC Request from agent  { id, method, params } ────────────────
  if ('id' in obj && 'method' in obj) {
    const requestId = Number(obj.id)
    const method = String(obj.method)
    const params = ((obj.params ?? {}) as Record<string, unknown>)

    if (method === 'session/request_permission' || method === 'permission/request') {
      const options: string[] = Array.isArray(params.options)
        ? (params.options as unknown[]).map(String)
        : ['allow_once', 'allow_always', 'deny']
      return {
        type: 'permission_request',
        requestId,
        permission: String(params.permission ?? params.type ?? 'unknown'),
        path: params.path != null ? String(params.path) : undefined,
        description: params.description != null ? String(params.description) : undefined,
        options,
      }
    }

    return { type: 'unknown', raw: line }
  }

  // ── 3. JSON-RPC Notification  { method, params }  (no id) ─────────────────
  if ('method' in obj) {
    const method = String(obj.method)
    const params = ((obj.params ?? {}) as Record<string, unknown>)

    // Full session state update
    if (method === 'session/update') {
      const updateData = params.update as Record<string, unknown> | undefined

      // New format (GitHub Copilot, etc.): params.update.sessionUpdate discriminated union
      if (updateData && typeof updateData.sessionUpdate === 'string') {
        const sessionUpdate = String(updateData.sessionUpdate)
        const content = updateData.content as Record<string, unknown> | undefined

        if (sessionUpdate === 'agent_message_chunk') {
          return {
            type: 'text',
            content: typeof content?.text === 'string' ? content.text : '',
          }
        }
        if (sessionUpdate === 'tool_call') {
          return {
            type: 'tool_call',
            id: String(updateData.toolCallId ?? ''),
            name: String(updateData.title ?? updateData.toolCallId ?? ''),
            arguments: JSON.stringify({ kind: updateData.kind, locations: updateData.locations }),
          }
        }
        // agent_thought_chunk, user_message_chunk, tool_call_update,
        // current_mode_update, available_commands_update → ignore
        return { type: 'unknown', raw: line }
      }

      // Old format (Claude Code, etc.): params.messages/toolCalls/done
      const p = params as unknown as AcpSessionUpdateParams
      return {
        type: 'session_update',
        messages: p.messages ?? [],
        toolCalls: p.toolCalls ?? [],
        models: p.models,
        modes: p.modes,
        done: p.done ?? false,
      }
    }

    // Streaming text delta
    if (method === 'text' || method === '$/text' || method === 'content') {
      return {
        type: 'text',
        content: String(params.content ?? params.text ?? params.delta ?? ''),
      }
    }

    // Tool call notification
    if (method === 'tool_call' || method === '$/tool_call') {
      return {
        type: 'tool_call',
        id: String(params.id ?? ''),
        name: String(params.name ?? params.title ?? ''),
        arguments: typeof params.arguments === 'string'
          ? params.arguments
          : JSON.stringify(params.arguments ?? params.input ?? {}),
      }
    }

    // Completion signal
    if (method === 'done' || method === 'complete' || method === '$/done') {
      return {
        type: 'done',
        stopReason: String(params.stop_reason ?? params.stopReason ?? 'stop'),
      }
    }

    // Error notification
    if (method === 'error' || method === '$/error') {
      return { type: 'error', message: String(params.message ?? line) }
    }

    return { type: 'unknown', raw: line }
  }

  // ── 4. Non-standard fallback formats ──────────────────────────────────────
  if (obj.error !== undefined) {
    const err = (obj.error ?? {}) as Record<string, unknown>
    return { type: 'error', message: String(err.message ?? line) }
  }

  if (typeof obj.content === 'string') {
    return { type: 'text', content: obj.content }
  }

  return { type: 'unknown', raw: line }
}
