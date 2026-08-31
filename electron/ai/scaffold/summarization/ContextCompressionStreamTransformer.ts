import {
  StreamChannel,
  type ProtocolEvent,
  type StreamTransformer,
} from '@langchain/langgraph'

const EVENT_NAME = 'deepagents_summarization'

export type ContextCompressionStreamProjection = Record<string, unknown> & {
  contextCompressionEvents: AsyncIterable<ProtocolEvent>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function namespaceKey(namespace: readonly string[]): string {
  return namespace.join('\0')
}

function isCompressionEvent(event: ProtocolEvent): boolean {
  if (event.method !== 'custom' || !isRecord(event.params.data)) return false
  return event.params.data.name === EVENT_NAME && isRecord(event.params.data.payload)
}

/**
 * Project iWriter's raw summarization events onto a dedicated v3 extension.
 *
 * DeepAgents/LangChain own the run namespace and task-to-tool-call topology.
 * The middleware therefore emits only compression facts; this transformer
 * derives UI attribution from the public protocol instead of injecting
 * subagent identity through a patched runtime config.
 */
export function createContextCompressionStreamTransformer():
() => StreamTransformer<ContextCompressionStreamProjection> {
  return () => {
    const events = StreamChannel.local<ProtocolEvent>()
    const agentNameByNamespace = new Map<string, string | undefined>()
    const activeToolCallByNamespace = new Map<string, string>()
    const pendingToolCalls = new Map<string, string>()

    function recordAgentIdentity(namespace: readonly string[], data: unknown): void {
      const key = namespaceKey(namespace)
      if (agentNameByNamespace.has(key)) return
      const metadata = isRecord(data) && isRecord(data.metadata) ? data.metadata : undefined
      const name = metadata?.lc_agent_name
      agentNameByNamespace.set(key, typeof name === 'string' && name ? name : undefined)
    }

    function recordPendingToolCall(data: unknown): void {
      if (!isRecord(data) || typeof data.id !== 'string') return
      const input = data.input
      let toolCallId: string | undefined
      if (isRecord(input) && isRecord(input.tool_call)) {
        const candidate = input.tool_call.id
        if (typeof candidate === 'string') toolCallId = candidate
      } else if (Array.isArray(input)) {
        const candidate = input.find(value => isRecord(value) && typeof value.id === 'string')
        if (isRecord(candidate) && typeof candidate.id === 'string') toolCallId = candidate.id
      }
      if (toolCallId) pendingToolCalls.set(data.id, toolCallId)
    }

    function findNamedAgentNamespace(namespace: readonly string[]): string[] | undefined {
      // The root agent is intentionally not attributed as a subagent.
      for (let length = namespace.length; length > 0; length -= 1) {
        const candidate = namespace.slice(0, length)
        if (agentNameByNamespace.get(namespaceKey(candidate))) return candidate
      }
      return undefined
    }

    function deriveToolCallId(namespace: readonly string[]): string | undefined {
      const active = activeToolCallByNamespace.get(namespaceKey(namespace))
      if (active) return active

      const segment = namespace[namespace.length - 1]
      if (!segment) return undefined
      const separator = segment.indexOf(':')
      if (separator < 0) return undefined
      const taskId = segment.slice(separator + 1)
      return taskId ? pendingToolCalls.get(taskId) : undefined
    }

    function enrichCompressionEvent(event: ProtocolEvent): ProtocolEvent {
      const agentNamespace = findNamedAgentNamespace(event.params.namespace)
      if (!agentNamespace) return event
      const subagentName = agentNameByNamespace.get(namespaceKey(agentNamespace))
      const subagentId = deriveToolCallId(agentNamespace)
      if (!subagentName || !subagentId || !isRecord(event.params.data)) return event

      return {
        ...event,
        params: {
          ...event.params,
          data: {
            ...event.params.data,
            payload: {
              ...(event.params.data.payload as Record<string, unknown>),
              subagentName,
              subagentId,
            },
          },
        },
      }
    }

    return {
      init: () => ({ contextCompressionEvents: events }),
      process(event) {
        const { namespace, data } = event.params
        if (
          event.method === 'tools'
          && isRecord(data)
          && data.event === 'tool-started'
          && typeof data.tool_call_id === 'string'
          && data.tool_call_id
        ) {
          activeToolCallByNamespace.set(namespaceKey(namespace), data.tool_call_id)
        }

        const isTaskResult = event.method === 'tasks' && isRecord(data) && 'result' in data
        if (event.method === 'tasks' && !isTaskResult) {
          recordAgentIdentity(namespace, data)
          recordPendingToolCall(data)
        }

        if (isCompressionEvent(event)) events.push(enrichCompressionEvent(event))
        return true
      },
      finalize() {
        events.close()
      },
      fail(error) {
        events.fail(error)
      },
    }
  }
}
