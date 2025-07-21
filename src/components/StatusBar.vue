<template>
  <div class="relative flex h-6 px-4 items-center justify-between bg-blue-600 text-xs text-white">
    <!-- Notification Overlay (占据整条状态栏) -->
    <div 
      v-if="currentNotification" 
      :class="[
        'absolute inset-0 flex items-center justify-between px-4 z-10',
        getNotificationBgClass(currentNotification.type),
        { 'animate-pulse': shouldFlash(currentNotification.type) }
      ]"
    >
      <div class="flex items-center gap-2">
        <component :is="getNotificationIcon(currentNotification.type)" class="icon-sm flex-shrink-0" />
        <span class="font-medium">{{ getNotificationTitle(currentNotification.type) }}:</span>
        <span>{{ currentNotification.message }}</span>
      </div>
      <button 
        v-if="!isForceClose(currentNotification.type)"
        @click="dismissCurrentNotification" 
        class="hover:bg-text-primary hover:bg-opacity-20 rounded p-1"
      >
        <IconX class="icon-sm" />
      </button>
      <button 
        v-else
        @click="dismissCurrentNotification" 
        class="hover:bg-text-primary hover:bg-opacity-20 rounded p-1 animate-bounce"
        title="Close"
      >
        <IconX class="icon-sm" />
      </button>
    </div>

    <!-- Normal Status Bar Content (当没有通知时显示) -->
    <template v-if="!currentNotification">
      <!-- Left Section -->
      <div class="flex items-center gap-1">
        <span>{{ statusSections.left }}</span>
      </div>
      
      <!-- Right Section -->
      <div class="flex items-center gap-1">
        <template v-for="(section, index) in statusSections.right" :key="index">
          <span v-if="index > 0" class="text-gray-300">|</span>
          <span>{{ section }}</span>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNotificationHandler } from '@/utils/NotificationHandler'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import type { Notification, FileTab } from '@/types'
import { NotificationType, DocumentType } from '@/types'
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
const { isEditable, isReadOnly } = useDocumentTypeDetector()

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
      return 'bg-status-success'
    case NotificationType.INFORMATION:
      return 'bg-status-info'        // 蓝色系
    case NotificationType.WARNING:
      return 'bg-status-warning'      // 黄色系
    case NotificationType.ERROR:
      return 'bg-status-error'         // 红色系
    case NotificationType.CRITICAL:
      return 'bg-status-error filter brightness-75'         // 红色系 + 更深
    default:
      return 'bg-status-neutral'
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

// 状态计算逻辑
interface StatusBarContent {
  left: string
  right: string[]
}

function getTextEditorStatus(tab: FileTab): StatusBarContent {
  const docType = tab.documentType
  const editableStatus = (docType && isEditable(docType)) ? "Editable" : "Readonly"
  const stats = tab.editorStats
  
  const rightSections: string[] = []
  
  if (stats) {
    // 选择信息（仅在有选择时显示）
    if (stats.selectionCharCount > 0) {
      rightSections.push(`Selection ${stats.selectionCharCount} characters, ${stats.selectionWordCount} words`)
    }
    
    // 光标位置与段落类型
    rightSections.push(`Ln ${stats.currentLine}, Col ${stats.currentColumn}  ${stats.paragraphType.toUpperCase()}`)
    
    // 文档总体统计
    rightSections.push(`${stats.totalCharCount} characters, ${stats.totalWordCount} words, ${stats.totalParagraphCount} paragraphs`)
    
    // 行结束符
    if (stats?.lineEnding) {
      rightSections.push(stats.lineEnding)
    }
  }

  return {
    left: editableStatus,
    right: rightSections
  }
}

function getImageViewerStatus(tab: FileTab): StatusBarContent {
  const rightSections: string[] = []
  
  // 图片尺寸（需要从metadata获取，暂时留空）
  if (tab.metadata?.size) {
    rightSections.push(formatFileSize(tab.metadata.size))
  }
  
  return {
    left: "Readonly",
    right: rightSections
  }
}

function getPdfViewerStatus(tab: FileTab): StatusBarContent {
  const rightSections: string[] = []
  
  // PDF页数等信息（需要从PDF viewer获取，暂时留空）
  if (tab.metadata?.size) {
    rightSections.push(formatFileSize(tab.metadata.size))
  }
  
  return {
    left: "Readonly",
    right: rightSections
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getDefaultStatus(): StatusBarContent {
  if (!appStore.hasOpenFolder) {
    return {
      left: "No Folder Opened",
      right: appStore.activeTab ? ["Document Opened"] : ["No Documents Opened"]
    }
  } else {
    return {
      left: "Folder Opened",
      right: appStore.activeTab ? ["Document Opened"] : ["No Documents Opened"] 
    }
  }
}

const statusSections = computed((): StatusBarContent => {
  const activeTab = appStore.activeTab
  
  if (!activeTab) {
    return getDefaultStatus()
  }
  
  const docType = activeTab.documentType
  
  if (docType === DocumentType.TEXT_EDITOR) {
    return getTextEditorStatus(activeTab)
  } else if (docType === DocumentType.IMAGE_VIEWER) {
    return getImageViewerStatus(activeTab)
  } else if (docType === DocumentType.PDF_VIEWER) {
    return getPdfViewerStatus(activeTab)
  }
  
  return getDefaultStatus()
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