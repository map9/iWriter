import { ref, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useAiStore } from '@/stores/ai'

export function useChatSend(contextFiles: Ref<string[]>) {
  const aiStore = useAiStore()
  const inputText = ref('')
  const inputEl = ref<HTMLTextAreaElement>()
  const pendingSend = ref(false)

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  async function executeSend() {
    const text = inputText.value.trim()
    if (!text || aiStore.isStreaming) return

    let fullText = text
    const attachedFiles = [...contextFiles.value]
    if (attachedFiles.length) {
      const refs = attachedFiles.map(f => `- ${f}`).join('\n')
      fullText = `[参考文件]\n${refs}\n\n${text}`
    }

    const started = await aiStore.sendMessage(fullText)
    if (started) {
      inputText.value = ''
      contextFiles.value.splice(0)
      nextTick(() => {
        if (inputEl.value) inputEl.value.style.height = 'auto'
      })
    }
  }

  async function sendMessage() {
    const text = inputText.value.trim()
    if (!text) return

    if (aiStore.isAgentProvider && aiStore.currentAgentInitStatus === 'initializing') {
      pendingSend.value = true
      return
    }

    if (aiStore.isStreaming) return
    await executeSend()
  }

  function cancelPendingSend() {
    pendingSend.value = false
  }

  watch(
    () => aiStore.currentAgentInitStatus,
    (status) => {
      if (pendingSend.value) {
        if (status === 'success') {
          pendingSend.value = false
          executeSend()
        } else if (status === 'failed') {
          pendingSend.value = false
        }
      }
    }
  )

  return { inputText, inputEl, pendingSend, handleKeydown, executeSend, sendMessage, cancelPendingSend }
}
