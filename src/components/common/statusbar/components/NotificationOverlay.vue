<template>
  <Transition
    name="notification"
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="state.isVisible && state.currentNotification"
      class="absolute inset-0 px-4 z-50 flex items-center gap-2 text-xs font-medium text-white"
      :class="[
        notificationClasses,
        state.displayOptions.flash ? 'animate-pulse' : ''
      ]"
      :style="notificationStyles"
    >
      <!-- Icon: 固定宽度 -->
      <component
        :is="getNotificationIcon()"
        class="w-4 h-4 flex-shrink-0"
      />

      <!-- Type: 固定宽度 -->
      <span class="font-medium flex-shrink-0">{{ getNotificationTitle() }}:</span>

      <!-- Message: 占据剩余空间，可截断 -->
      <span class="flex-1 truncate text-left">{{ state.currentNotification.message }}</span>

      <!-- Close: 固定宽度 -->
      <button
        v-if="isForceClose()"
        @click="close"
        class="flex-shrink-0 w-4 h-4 hover:bg-black hover:bg-opacity-20 rounded flex items-center justify-center bg-transparent"
        :class="[
          {'animate-bounce' : isBounceClose()}
        ]"
      >
        <IconX class="w-3 h-3" />
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  IconX,
  IconCheck,
  IconInfoCircle,
  IconAlertTriangle,
  IconExclamationCircle,
  IconAlertCircle
} from '@tabler/icons-vue'
import type { NotificationState } from '../types'
import { NotificationType } from '../types'

interface Props {
  state: NotificationState
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// 获取通知图标
function getNotificationIcon() {
  switch (props.state.currentNotification?.type) {
    case NotificationType.INFORMATION:
      return IconInfoCircle
    case NotificationType.SUCCESS:
      return IconCheck
    case NotificationType.WARNING:
      return IconAlertTriangle
    case NotificationType.ERROR:
      return IconExclamationCircle
    case NotificationType.CRITICAL:
      return IconAlertCircle
    default:
      return IconInfoCircle
  }
}

// 获取通知标题
function getNotificationTitle(): string {
  switch (props.state.currentNotification?.type) {
    case NotificationType.INFORMATION:
      return 'Information'
    case NotificationType.SUCCESS:
      return 'Success'
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

// 判断是否强制关闭
function isForceClose(): boolean {
  return (
    !props.state.displayOptions.duration ||
    props.state.displayOptions.duration <= 0 ||
    props.state.displayOptions.duration >= 1500
  )
}

function isBounceClose(): boolean {
  return isForceClose() && !props.state.displayOptions.flash
}

// 获取通知样式类
const notificationClasses = computed(() => {
  if (!props.state.currentNotification) return ''

  const baseClasses = ''
  const type = props.state.currentNotification.type

  // 如果有自定义颜色，不应用默认主题色
  if (props.state.displayOptions.color || props.state.displayOptions.backgroundColor) {
    return baseClasses
  }

  // 默认主题色
  switch (type) {
    case NotificationType.INFORMATION:
      return `${baseClasses} bg-blue-500 text-white`
    case NotificationType.SUCCESS:
      return `${baseClasses} bg-green-500 text-white`
    case NotificationType.WARNING:
      return `${baseClasses} bg-yellow-500 text-white`
    case NotificationType.ERROR:
      return `${baseClasses} bg-red-500 text-white`
    case NotificationType.CRITICAL:
      return `${baseClasses} bg-red-700 text-white`
    default:
      return `${baseClasses} bg-gray-500 text-white`
  }
})

// 获取自定义样式
const notificationStyles = computed(() => {
  const styles: Record<string, string> = {}

  if (props.state.displayOptions.color) {
    styles.color = props.state.displayOptions.color
  }

  if (props.state.displayOptions.backgroundColor) {
    styles.backgroundColor = props.state.displayOptions.backgroundColor
  }

  return styles
})

function close() {
  emit('close')
}
</script>

<style scoped>
@keyframes flash {
  0%, 50%, 100% { opacity: 1; }
  25%, 75% { opacity: 0.8; }
}

.animate-pulse {
  animation: flash 2s ease-in-out infinite;
}
</style>