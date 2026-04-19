import { computed, ref } from 'vue'
import type { AiToolCall, EditProposal } from '@/ai/types'

export type ThreadRunState = 'idle' | 'streaming' | 'interrupted'

export type StreamingBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: AiToolCall }

export type LiveTurnState = 'streaming' | 'interrupted' | 'resuming'

export interface LiveTurn {
  threadId: string
  turnId: string | null
  state: LiveTurnState
  startedAt: number
  text: string
  currentText: string
  blocks: StreamingBlock[]
  thinkingText: string
  toolName: string | null
  proposals: EditProposal[]
}

export function createRuntimeState() {
  const threadRunState = ref<ThreadRunState>('idle')
  const liveTurn = ref<LiveTurn | null>(null)
  const currentThreadId = ref<string | null>(null)
  const currentTurnId = ref<string | null>(null)
  const interruptedThreadId = ref<string | null>(null)
  const interruptedTurnId = ref<string | null>(null)

  const isStreaming = computed(() => threadRunState.value === 'streaming')
  const isInterrupted = computed(() => threadRunState.value === 'interrupted')

  const streamingText = computed(() => liveTurn.value?.text ?? '')
  const streamingCurrentText = computed(() => liveTurn.value?.currentText ?? '')
  const streamingBlocks = computed(() => liveTurn.value?.blocks ?? [])
  const streamingThinkingText = computed(() => liveTurn.value?.thinkingText ?? '')
  const streamingToolName = computed(() => liveTurn.value?.toolName ?? null)
  const pendingEditProposals = computed(() => liveTurn.value?.proposals ?? [])
  const liveTurnState = computed<LiveTurnState | null>(() => liveTurn.value?.state ?? null)
  const liveTurnThreadId = computed(() => liveTurn.value?.threadId ?? null)
  const liveTurnTurnId = computed(() => liveTurn.value?.turnId ?? null)
  const liveTurnStartedAt = computed(() => liveTurn.value?.startedAt ?? null)

  function startLiveTurn(params: {
    threadId: string
    turnId: string | null
    state: LiveTurnState
    startedAt?: number
  }) {
    liveTurn.value = {
      threadId: params.threadId,
      turnId: params.turnId,
      state: params.state,
      startedAt: params.startedAt ?? Date.now(),
      text: '',
      currentText: '',
      blocks: [],
      thinkingText: '',
      toolName: null,
      proposals: [],
    }
  }

  function ensureLiveTurn(params?: {
    threadId?: string | null
    turnId?: string | null
    state?: LiveTurnState
    startedAt?: number
  }): LiveTurn | null {
    if (!liveTurn.value) {
      const threadId = params?.threadId ?? currentThreadId.value ?? interruptedThreadId.value
      if (!threadId) return null
      startLiveTurn({
        threadId,
        turnId: params?.turnId ?? currentTurnId.value ?? interruptedTurnId.value ?? null,
        state: params?.state ?? (threadRunState.value === 'interrupted' ? 'interrupted' : 'streaming'),
        startedAt: params?.startedAt,
      })
    } else if (params) {
      liveTurn.value = {
        ...liveTurn.value,
        threadId: params.threadId ?? liveTurn.value.threadId,
        turnId: params.turnId ?? liveTurn.value.turnId,
        state: params.state ?? liveTurn.value.state,
      }
    }
    return liveTurn.value
  }

  function clearLiveTurn() {
    liveTurn.value = null
  }

  function clearRunPointers() {
    currentThreadId.value = null
    currentTurnId.value = null
  }

  return {
    threadRunState,
    liveTurn,
    currentThreadId,
    currentTurnId,
    interruptedThreadId,
    interruptedTurnId,
    isStreaming,
    isInterrupted,
    streamingText,
    streamingCurrentText,
    streamingBlocks,
    streamingThinkingText,
    streamingToolName,
    pendingEditProposals,
    liveTurnState,
    liveTurnThreadId,
    liveTurnTurnId,
    liveTurnStartedAt,
    startLiveTurn,
    ensureLiveTurn,
    clearLiveTurn,
    clearRunPointers,
  }
}
