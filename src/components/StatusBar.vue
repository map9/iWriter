<template>
  <div class="h-6 bg-primary-600 text-white flex items-center justify-between px-4 text-xs relative">
    <!-- Notification Overlay (占据整条状态栏) -->
    <div 
      v-if="currentNotification" 
      :class="[
        'absolute inset-0 flex items-center justify-between px-4 text-xs z-10',
        getNotificationBgClass(currentNotification.type),
        { 'animate-pulse': shouldFlash(currentNotification.type) }
      ]"
    >
      <div class="flex items-center gap-2">
        <component :is="getNotificationIcon(currentNotification.type)" class="w-4 h-4 flex-shrink-0" />
        <span class="font-medium">{{ getNotificationTitle(currentNotification.type) }}:</span>
        <span>{{ currentNotification.message }}</span>
      </div>
      <button 
        v-if="!isForceClose(currentNotification.type)"
        @click="dismissCurrentNotification" 
        class="hover:bg-black hover:bg-opacity-20 rounded p-1"
      >
        <IconX class="w-3 h-3" />
      </button>
      <button 
        v-else
        @click="dismissCurrentNotification" 
        class="hover:bg-black hover:bg-opacity-20 rounded p-1 animate-bounce"
        title="点击关闭"
      >
        <IconX class="w-3 h-3" />
      </button>
    </div>

    <!-- Normal Status Bar Content (当没有通知时显示) -->
    <template v-if="!currentNotification">
      <!-- Left Section -->
      <div class="flex items-center gap-1">
        <span v-if="!appStore.hasOpenFolder">No Folder Opened,</span>
        <span v-else>Folder Opened,</span>
        <span v-if="!appStore.activeTab">No Documents Opened.</span>
        <span v-else>Documents Opened.</span>
      </div>
      
      <!-- Right Section -->
      <div class="flex items-center gap-1">
        <span>Selection 15 bytes, 3 words, 0 lines</span>
        <span v-if="appStore.activeTab">
          Ln {{ currentLine }}, Col {{ currentColumn }}
        </span>
        <span v-if="appStore.activeTab">
          {{ wordCount }} characters, {{ wordsCount }} words, {{ linesCount }} paragraphs
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNotificationHandler } from '@/utils/NotificationHandler'
import type { Notification } from '@/types'
import { NotificationType } from '@/types'
import { 
  IconX,
  IconCircleCheck,        // success
  IconInfoCircle,         // information
  IconAlertTriangle,      // warning
  IconExclamationCircle,  // error
  IconCircleX,            // critical
} from '@tabler/icons-vue'

const appStore = useAppStore()
const { notifications } = useNotificationHandler()

// Notification state
const currentNotification = ref<Notification | null>(null)
const dismissedNotifications = ref<Set<number>>(new Set())
const autoCloseTimer = ref<number | null>(null)

// 监听通知变化，显示最新的未被忽略的通知
watch(notifications, (newNotifications) => {
  const visibleNotifications = newNotifications.filter(notification => 
    !dismissedNotifications.value.has(notification.timestamp.getTime())
  )
  
  if (visibleNotifications.length > 0) {
    // 按优先级排序，优先显示高优先级通知
    const priorityOrder = { 
      critical: 5, 
      error: 4, 
      warning: 3, 
      information: 2, 
      success: 1 
    }
    const sortedNotifications = visibleNotifications.sort((a, b) => {
      return priorityOrder[b.type] - priorityOrder[a.type]
    })
    
    // 如果当前通知不是最高优先级，则更新
    const highestPriority = sortedNotifications[0]
    if (!currentNotification.value || 
        priorityOrder[highestPriority.type] > priorityOrder[currentNotification.value.type]) {
      
      // 清除之前的定时器
      if (autoCloseTimer.value) {
        clearTimeout(autoCloseTimer.value)
        autoCloseTimer.value = null
      }
      
      currentNotification.value = highestPriority
      
      // 设置自动关闭定时器（如果有设置duration）
      if (currentNotification.value.duration && currentNotification.value.duration > 0) {
        autoCloseTimer.value = setTimeout(() => {
          if (currentNotification.value) {
            dismissCurrentNotification()
          }
        }, currentNotification.value.duration)
      }
    }
  } else {
    currentNotification.value = null
    if (autoCloseTimer.value) {
      clearTimeout(autoCloseTimer.value)
      autoCloseTimer.value = null
    }
  }
}, { deep: true, immediate: true })

// 关闭当前通知
function dismissCurrentNotification() {
  if (currentNotification.value) {
    dismissedNotifications.value.add(currentNotification.value.timestamp.getTime())
    
    // 从通知列表中移除
    const index = notifications.value.findIndex(n => 
      n.timestamp.getTime() === currentNotification.value!.timestamp.getTime()
    )
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
    
    currentNotification.value = null
    
    if (autoCloseTimer.value) {
      clearTimeout(autoCloseTimer.value)
      autoCloseTimer.value = null
    }
  }
}

// 判断是否应该闪动
function shouldFlash(type: NotificationType): boolean {
  return type === NotificationType.ERROR || type === NotificationType.CRITICAL
}

// 判断是否强制关闭
function isForceClose(type: NotificationType): boolean {
  return type === NotificationType.CRITICAL
}

// 获取通知标题
function getNotificationTitle(type: NotificationType): string {
  switch (type) {
    case NotificationType.SUCCESS:
      return 'Success'
    case NotificationType.INFORMATION:
      return 'Information'
    case NotificationType.WARNING:
      return 'Warning'
    case NotificationType.ERROR:
      return 'Error'
    case NotificationType.CRITICAL:
      return 'Critical'
    default:
      return 'Notification'
  }
}

// 获取通知背景样式
function getNotificationBgClass(type: NotificationType): string {
  switch (type) {
    case NotificationType.SUCCESS:
      return 'bg-green-600'       // 绿色系
    case NotificationType.INFORMATION:
      return 'bg-blue-600'        // 蓝色系
    case NotificationType.WARNING:
      return 'bg-yellow-600'      // 黄色系
    case NotificationType.ERROR:
      return 'bg-red-600'         // 红色系
    case NotificationType.CRITICAL:
      return 'bg-red-700'         // 红色系 + 更深
    default:
      return 'bg-gray-600'
  }
}

// 获取通知图标
function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case NotificationType.SUCCESS:
      return IconCircleCheck
    case NotificationType.INFORMATION:
      return IconInfoCircle
    case NotificationType.WARNING:
      return IconAlertTriangle
    case NotificationType.ERROR:
      return IconExclamationCircle
    case NotificationType.CRITICAL:
      return IconCircleX
    default:
      return IconInfoCircle
  }
}

// 暴露通知相关方法
const { success, info, warning, error, critical } = useNotificationHandler()

// Mock values - in real implementation, these would come from the editor
const currentLine = computed(() => 6)
const currentColumn = computed(() => 22)

const wordCount = computed(() => {
  if (!appStore.activeTab?.content) return 0
  return appStore.activeTab.content.length
})

const wordsCount = computed(() => {
  if (!appStore.activeTab?.content) return 0
  return appStore.activeTab.content.split(/\s+/).filter(word => word.length > 0).length
})

const linesCount = computed(() => {
  if (!appStore.activeTab?.content) return 0
  return appStore.activeTab.content.split('\n').length
})

// 暴露方法供外部调用
defineExpose({
  success,
  info, 
  warning,
  error,
  critical,
  dismissCurrentNotification
})
</script>

<style scoped>
@keyframes flash {
  0%, 50% { opacity: 1; }
  25%, 75% { opacity: 0.6; }
}

.animate-pulse {
  animation: flash 1s ease-in-out infinite;
}
</style>