import { ref } from 'vue'
import { StateStorage } from '@/utils/StateStorage'

export function useSearchHistory(storageKey: string) {
  const history = ref<string[]>(StateStorage.loadSearchHistory(storageKey))
  const historyIndex = ref(-1)
  let _navigating = false

  function _save(): void {
    StateStorage.saveSearchHistory(storageKey, history.value)
  }

  function _push(value: string): void {
    const idx = history.value.indexOf(value)
    if (idx !== -1) history.value.splice(idx, 1)
    history.value.push(value)
    if (history.value.length > 20) history.value.shift()
    _save()
    historyIndex.value = -1
  }

  // 仅在非导航状态时记录，供 debounced watch 调用
  function record(value: string): void {
    if (!value || _navigating) return
    _push(value)
  }

  // 强制记录，忽略导航状态；供替换等显式动作调用
  function forceRecord(value: string): void {
    if (!value) return
    _navigating = false
    _push(value)
  }

  // 用户真正输入时调用（@input 事件），重置导航状态
  function markAsUserTyped(): void {
    _navigating = false
  }

  // ArrowUp：返回要填入的值；undefined 表示历史为空，无需处理
  function up(): string | undefined {
    if (history.value.length === 0) return undefined
    _navigating = true
    if (historyIndex.value === -1) {
      historyIndex.value = history.value.length - 1
    } else if (historyIndex.value > 0) {
      historyIndex.value--
    }
    return history.value[historyIndex.value]
  }

  // ArrowDown：返回要填入的值；undefined 表示当前不在历史中，无需处理；null 表示已到底，清空输入
  function down(): string | null | undefined {
    if (historyIndex.value === -1) return undefined
    historyIndex.value++
    if (historyIndex.value >= history.value.length) {
      historyIndex.value = -1
      _navigating = false
      return null
    }
    _navigating = true
    return history.value[historyIndex.value]
  }

  return { history, historyIndex, record, forceRecord, markAsUserTyped, up, down }
}
