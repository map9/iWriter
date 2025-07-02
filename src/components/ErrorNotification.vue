<template>
  <div v-if="visibleErrors.length > 0" class="fixed top-4 right-4 z-50 space-y-2">
    <div
      v-for="error in visibleErrors"
      :key="error.timestamp.getTime()"
      :class="[
        'max-w-sm p-4 rounded-lg shadow-lg transition-all duration-300',
        'transform translate-x-0 opacity-100',
        getErrorBgClass(error.severity)
      ]"
    >
      <div class="flex items-start">
        <div :class="['flex-shrink-0', getErrorIconClass(error.severity)]">
          <component :is="getErrorIcon(error.severity)" class="w-5 h-5" />
        </div>
        <div class="ml-3 flex-1">
          <h3 :class="['text-sm font-medium', getErrorTextClass(error.severity)]">
            {{ getErrorTitle(error.type) }}
          </h3>
          <p :class="['mt-1 text-sm', getErrorTextClass(error.severity)]">
            {{ error.message }}
          </p>
          <div v-if="error.context" class="mt-1">
            <p :class="['text-xs opacity-75', getErrorTextClass(error.severity)]">
              {{ error.context }}
            </p>
          </div>
        </div>
        <div class="ml-4 flex-shrink-0">
          <button
            @click="dismissError(error)"
            :class="['rounded-md inline-flex text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500']"
          >
            <span class="sr-only">关闭</span>
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useErrorHandler } from '@/utils/ErrorHandler'
import type { AppError, ErrorType, ErrorSeverity } from '@/types'

const { errors } = useErrorHandler()

// 显示的错误列表（排除已手动关闭的）
const dismissedErrors = ref<Set<number>>(new Set())
const visibleErrors = computed(() => {
  return errors.value
    .filter(error => !dismissedErrors.value.has(error.timestamp.getTime()))
    .slice(0, 5) // 最多显示5个错误
})

// 自动关闭低优先级错误
watch(errors, (newErrors) => {
  newErrors.forEach(error => {
    if (error.severity === 'low') {
      setTimeout(() => {
        dismissError(error)
      }, 3000) // 3秒后自动关闭
    } else if (error.severity === 'medium') {
      setTimeout(() => {
        dismissError(error)
      }, 5000) // 5秒后自动关闭
    }
    // 高优先级和严重错误需要手动关闭
  })
}, { deep: true })

// 关闭错误
function dismissError(error: AppError) {
  dismissedErrors.value.add(error.timestamp.getTime())
}

// 获取错误标题
function getErrorTitle(type: ErrorType): string {
  switch (type) {
    case 'FILE_SYSTEM':
      return '文件系统错误'
    case 'NETWORK':
      return '网络错误'
    case 'VALIDATION':
      return '验证错误'
    case 'PERMISSION':
      return '权限错误'
    default:
      return '未知错误'
  }
}

// 获取错误背景样式
function getErrorBgClass(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-600 border border-red-700'
    case 'high':
      return 'bg-red-500 border border-red-600'
    case 'medium':
      return 'bg-yellow-500 border border-yellow-600'
    case 'low':
      return 'bg-blue-500 border border-blue-600'
    default:
      return 'bg-gray-500 border border-gray-600'
  }
}

// 获取错误文本样式
function getErrorTextClass(severity: ErrorSeverity): string {
  return 'text-white'
}

// 获取错误图标样式
function getErrorIconClass(severity: ErrorSeverity): string {
  return 'text-white'
}

// 获取错误图标
function getErrorIcon(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'ExclamationTriangleIcon'
    case 'medium':
      return 'ExclamationCircleIcon'
    case 'low':
      return 'InformationCircleIcon'
    default:
      return 'QuestionMarkCircleIcon'
  }
}
</script>