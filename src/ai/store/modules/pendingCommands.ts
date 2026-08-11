import { ref } from 'vue'
import { nanoid } from 'nanoid'
import type { SendContext } from '@/ai/types'

export interface PendingCommand {
  id: string
  threadId: string
  text: string
  sendContext?: SendContext
  createdAt: number
}

export interface PendingCommandBatch {
  ids: string[]
  text: string
  sendContext?: SendContext
}

interface PendingCommandQueueOptions {
  createId?: () => string
  now?: () => number
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)]
}

function normalizeSendContext(sendContext?: SendContext): SendContext | undefined {
  if (!sendContext) return undefined
  const normalized: SendContext = {
    filePaths: uniquePaths(sendContext.filePaths),
    directories: uniquePaths(sendContext.directories),
  }
  return normalized.filePaths.length
    || normalized.directories.length
    ? normalized
    : undefined
}

export function createPendingCommandQueue(options: PendingCommandQueueOptions = {}) {
  const createId = options.createId ?? (() => `pending-${nanoid(8)}`)
  const now = options.now ?? Date.now
  const commandsByThread = ref<Record<string, PendingCommand[]>>({})

  function getCommands(threadId: string): PendingCommand[] {
    return commandsByThread.value[threadId] ?? []
  }

  function replaceThread(threadId: string, commands: PendingCommand[]) {
    if (commands.length === 0) {
      if (!(threadId in commandsByThread.value)) return
      const next = { ...commandsByThread.value }
      delete next[threadId]
      commandsByThread.value = next
      return
    }
    commandsByThread.value = {
      ...commandsByThread.value,
      [threadId]: commands,
    }
  }

  function enqueue(threadId: string, text: string, sendContext?: SendContext): PendingCommand {
    const command: PendingCommand = {
      id: createId(),
      threadId,
      text: text.trim(),
      sendContext: normalizeSendContext(sendContext),
      createdAt: now(),
    }
    replaceThread(threadId, [...getCommands(threadId), command])
    return command
  }

  function update(threadId: string, id: string, text: string): boolean {
    const normalizedText = text.trim()
    if (!normalizedText) return false
    const commands = getCommands(threadId)
    const index = commands.findIndex(command => command.id === id)
    if (index < 0) return false
    const updated = [...commands]
    updated[index] = { ...updated[index]!, text: normalizedText }
    replaceThread(threadId, updated)
    return true
  }

  function remove(threadId: string, id: string): PendingCommand | null {
    const commands = getCommands(threadId)
    const removed = commands.find(command => command.id === id) ?? null
    if (!removed) return null
    replaceThread(threadId, commands.filter(command => command.id !== id))
    return removed
  }

  function removeByIds(threadId: string, ids: string[]) {
    if (!ids.length) return
    const idSet = new Set(ids)
    replaceThread(threadId, getCommands(threadId).filter(command => !idSet.has(command.id)))
  }

  function createBatch(threadId: string): PendingCommandBatch | null {
    const commands = getCommands(threadId)
    if (!commands.length) return null
    return {
      ids: commands.map(command => command.id),
      text: commands.map(command => command.text).join('\n\n'),
      sendContext: normalizeSendContext({
        filePaths: commands.flatMap(command => command.sendContext?.filePaths ?? []),
        directories: commands.flatMap(command => command.sendContext?.directories ?? []),
      }),
    }
  }

  function clearThread(threadId: string) {
    replaceThread(threadId, [])
  }

  function clearAll() {
    commandsByThread.value = {}
  }

  return {
    commandsByThread,
    getCommands,
    enqueue,
    update,
    remove,
    removeByIds,
    createBatch,
    clearThread,
    clearAll,
  }
}
