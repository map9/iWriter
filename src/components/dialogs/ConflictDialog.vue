<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click.self="handleCancel"
  >
    <div class="bg-white rounded-lg shadow-lg p-6 w-96 max-w-md">
      <div class="flex items-center mb-4">
        <IconAlertTriangle :size="24" class="text-yellow-500 mr-3" />
        <h3 class="text-lg font-medium text-gray-900">
          {{ title }}
        </h3>
      </div>
      
      <p class="text-sm text-gray-600 mb-6">
        {{ message }}
      </p>
      
      <div class="flex flex-col gap-3">
        <button
          @click="handleKeepBoth"
          class="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-left"
        >
          保留两者
        </button>
        <button
          @click="handleReplace"
          class="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-left"
        >
          替换
        </button>
        <button
          @click="handleCancel"
          class="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-left"
        >
          停止
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconAlertTriangle } from '@tabler/icons-vue'

interface Props {
  isVisible: boolean
  title: string
  message: string
}

defineProps<Props>()

const emit = defineEmits<{
  keepBoth: []
  replace: []
  cancel: []
}>()

function handleKeepBoth() {
  emit('keepBoth')
}

function handleReplace() {
  emit('replace')
}

function handleCancel() {
  emit('cancel')
}
</script>