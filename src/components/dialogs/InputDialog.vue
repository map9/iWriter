<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click.self="handleCancel"
  >
    <div class="bg-white rounded-lg shadow-lg p-6 w-96 max-w-md">
      <h3 class="text-lg font-medium text-gray-900 mb-4">
        {{ title }}
      </h3>
      
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        :placeholder="placeholder"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        @keydown.enter="handleConfirm"
        @keydown.escape="handleCancel"
      />
      
      <div class="flex justify-end gap-3 mt-6">
        <button
          @click="handleCancel"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          @click="handleConfirm"
          :disabled="!inputValue.trim()"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

interface Props {
  isVisible: boolean
  title: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  defaultValue: '',
  confirmText: 'OK'
})

const emit = defineEmits<{
  confirm: [value: string]
  cancel: []
}>()

const inputRef = ref<HTMLInputElement>()
const inputValue = ref('')

watch(() => props.isVisible, (visible) => {
  if (visible) {
    inputValue.value = props.defaultValue
    nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  }
})

function handleConfirm() {
  if (inputValue.value.trim()) {
    emit('confirm', inputValue.value.trim())
  }
}

function handleCancel() {
  emit('cancel')
}
</script>