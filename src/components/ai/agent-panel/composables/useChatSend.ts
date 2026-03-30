import { ref, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useAiStore } from '@/ai/store/ai'
import type { SendContext } from '@/ai/types'
import { pathUtils } from '@/utils/pathUtils'

/** Binary file extensions that are sent as inline multimodal content. */
const BINARY_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
  'pdf',
])

/** Text file extensions that are listed in the system prompt <context_files> section. */
const TEXT_EXTS = new Set([
  'md', 'markdown', 'txt', 'iwt',
  'ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'rb', 'go', 'rs', 'java',
  'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'sh', 'bash', 'zsh',
  'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'scss', 'sql',
])

function classifyAttachment(path: string): 'binary' | 'text' | 'directory' {
  const name = pathUtils.basename(path)
  if (!name.includes('.')) return 'directory'
  const ext = pathUtils.extension(path)
  if (BINARY_EXTS.has(ext)) return 'binary'
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'text' // default: treat unknown extensions as text
}

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

    // Classify attached files into text / binary / directory
    const sendContext: SendContext = { textFilePaths: [], binaryFilePaths: [], directories: [] }
    for (const path of contextFiles.value) {
      const kind = classifyAttachment(path)
      if (kind === 'binary') sendContext.binaryFilePaths.push(path)
      else if (kind === 'text') sendContext.textFilePaths.push(path)
      else sendContext.directories.push(path)
    }

    const hasContext = sendContext.textFilePaths.length > 0
                    || sendContext.binaryFilePaths.length > 0
                    || sendContext.directories.length > 0

    const started = await aiStore.sendMessage(text, hasContext ? sendContext : undefined)
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
    if (!text || aiStore.isStreaming) return
    await executeSend()
  }

  function cancelPendingSend() {
    pendingSend.value = false
  }

  return { inputText, inputEl, pendingSend, handleKeydown, executeSend, sendMessage, cancelPendingSend }
}
