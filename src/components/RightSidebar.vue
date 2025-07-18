<template>
  <div class="sidebar h-full border-l border-gray-200 shrink-0 min-w-72">
    <!-- AI Chat Header -->
    <div class="sidebar-header bg-gray-50">
      <div class="flex items-center gap-2">
        <IconRobot class="w-5 h-5 text-primary-600" />
        <span class="font-medium text-gray-900">AI Chat</span>
      </div>
      <button
        @click="appStore.toggleRightSidebar()"
        class="p-1 rounded hover:bg-gray-200 transition-colors"
        title="Close AI Chat"
      >
        <IconX class="w-5 h-5 text-gray-600" />
      </button>
    </div>
    
    <!-- Chat Messages -->
    <div ref="messagesContainer" class="flex-1 overflow-auto p-4 space-y-4">
      <div
        v-for="message in messages"
        :key="message.id"
        class="flex gap-3"
        :class="{ 'flex-row-reverse': message.role === 'user' }"
      >
        <!-- Avatar -->
        <div class="flex-shrink-0">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
            :class="message.role === 'user' ? 'bg-primary-500' : 'bg-gray-500'"
          >
            <IconUser v-if="message.role === 'user'" class="w-5 h-5" />
            <IconRobot v-else class="w-5 h-5" />
          </div>
        </div>
        
        <!-- Message Content -->
        <div
          class="flex-1 max-w-xs"
          :class="{ 'text-right': message.role === 'user' }"
        >
          <div
            class="inline-block px-3 py-2 rounded-lg text-sm"
            :class="{
              'bg-primary-500 text-white': message.role === 'user',
              'bg-gray-100 text-gray-900': message.role === 'assistant'
            }"
          >
            <div v-if="message.isTyping" class="flex items-center gap-1">
              <div class="flex space-x-1">
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
              </div>
            </div>
            <div v-else class="whitespace-pre-wrap">{{ message.content }}</div>
          </div>
          <div class="text-xs text-gray-500 mt-1">
            {{ formatTime(message.timestamp) }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Chat Input -->
    <div class="border-t border-gray-200 bg-white">
      <!-- Input Area -->
      <div class="p-4">
        <div class="flex items-end gap-2">
          <div class="flex-1">
            <textarea
              v-model="inputMessage"
              ref="inputRef"
              placeholder="发消息，输入 @ 提及特定帮助专家 / 添加内容"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows="3"
              @keydown="handleKeydown"
            />
          </div>
          <div class="flex flex-col gap-1">
            <button
              @click="sendMessage"
              :disabled="!inputMessage.trim()"
              class="p-2 rounded-md transition-colors"
              :class="{
                'bg-primary-500 text-white hover:bg-primary-600': inputMessage.trim(),
                'bg-gray-200 text-gray-400 cursor-not-allowed': !inputMessage.trim()
              }"
              title="Send Message"
            >
              <IconSend class="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      
      <!-- Model Selector and Actions -->
      <div class="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200">
        <div class="flex items-center gap-2">
          <select
            v-model="selectedModel"
            class="h-7 text-xs px-2 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="豌豆 1.0">豌豆 1.0</option>
            <option value="豌豆 2.0">豌豆 2.0</option>
          </select>
          <button
            class="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Format Message"
          >
            <IconTextSize class="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        <div class="flex items-center gap-1">
          <button
            class="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Attach File"
          >
            <IconPaperclip class="w-5 h-5 text-gray-600" />
          </button>
          <button
            class="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Voice Input"
          >
            <IconMicrophone class="w-5 h-5 text-gray-600" />
          </button>
          <button
            @click="clearChat"
            class="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Clear Chat"
          >
            <IconTrash class="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconRobot,
  IconX,
  IconUser,
  IconSend,
  IconTextSize,
  IconPaperclip,
  IconMicrophone,
  IconTrash
} from '@tabler/icons-vue'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isTyping?: boolean
}

const appStore = useAppStore()
const inputMessage = ref('')
const selectedModel = ref('豌豆 1.0')
const messagesContainer = ref<HTMLElement>()
const inputRef = ref<HTMLTextAreaElement>()

const messages = ref<Message[]>([
  {
    id: '1',
    role: 'assistant',
    content: `关键点说明
1. 系统环境一致性
   - 采用node框架（@copy，paste），确保运行环境备合法性不存在与上层系统服务商依赖性。
   - 系统兼容性确保相关性系统（如 Windows，macOS）自动唤醒选型策略。
2. 跨平台适配：
   - 解决跨平台在 Windows 和 macOS 上能能近汀，系统会自动适配既定的跨平平台牟的特性。
   - 如果着重其计对的平台中合适更，可记存主进程中适配process.platform来分裙。

如果Electron应用财浩哈Browser离内，导出或许你都浏宜成一款单独的界面游览器。也就是说对Ryow1dw—致保持的完整。`,
    timestamp: new Date(Date.now() - 300000)
  },
  {
    id: '2',
    role: 'user',
    content: `关键点说明
1. 系统环境一致性
   - 采用node框架（@copy，paste），确保运行环境备合法性不存在与上层系统服务商依赖性。
   - 系统兼容性确保相关性系统（如 Windows，macOS）自动唤醒选型策略。
2. 跨平台适配：
   - 解决跨平台在 Windows 和 macOS 上能能近汀，系统会自动适配既定的跨平平台牟的特性。
   - 如果着重其际对的平台中合适更，可记存主进程中适配process.platform来分裙。`,
    timestamp: new Date(Date.now() - 120000)
  }
])

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

function sendMessage() {
  if (!inputMessage.value.trim()) return
  
  const userMessage: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: inputMessage.value.trim(),
    timestamp: new Date()
  }
  
  messages.value.push(userMessage)
  inputMessage.value = ''
  
  // Auto-resize textarea
  if (inputRef.value) {
    inputRef.value.style.height = 'auto'
  }
  
  // Scroll to bottom
  nextTick(() => {
    scrollToBottom()
  })
  
  // Simulate AI response
  simulateAIResponse()
}

function simulateAIResponse() {
  // Add typing indicator
  const typingMessage: Message = {
    id: 'typing',
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    isTyping: true
  }
  
  messages.value.push(typingMessage)
  scrollToBottom()
  
  // Simulate response after delay
  setTimeout(() => {
    // Remove typing indicator
    const index = messages.value.findIndex(m => m.id === 'typing')
    if (index !== -1) {
      messages.value.splice(index, 1)
    }
    
    // Add actual response
    const aiMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: '这是一个模拟的AI回复。在实际应用中，这里会连接到真实的AI服务。',
      timestamp: new Date()
    }
    
    messages.value.push(aiMessage)
    scrollToBottom()
  }, 2000)
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

function clearChat() {
  messages.value.length = 0
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  scrollToBottom()
})
</script>