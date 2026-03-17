<template>
  <div
    v-if="hasModes"
    class="relative flex-shrink-0"
    v-click-outside="onClose"
  >
    <button
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-100 transition-colors max-w-[80px]"
      :title="aiStore.isAgentProvider ? '切换 Agent 模式' : '切换模式'"
    >
      <span class="truncate">{{ modeLabel }}</span>
      <IconChevronDown class="w-3 h-3 flex-shrink-0 text-gray-400" />
    </button>

    <div
      v-if="isOpen"
      class="absolute bottom-full left-0 mb-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1"
    >
      <button
        v-for="mode in availableModes"
        :key="typeof mode === 'string' ? mode : mode.value"
        @click="doSelect(typeof mode === 'string' ? mode : mode.value)"
        class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
      >
        <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :class="(typeof mode === 'string' ? mode : mode.value) === currentMode ? 'bg-primary-500' : 'bg-transparent'"
        />
        <span class="truncate flex-1"
          :class="(typeof mode === 'string' ? mode : mode.value) === currentMode ? 'font-semibold text-gray-900' : ''"
        >{{ typeof mode === 'string' ? mode : mode.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronDown } from '@tabler/icons-vue'
import { useAiStore } from '@/stores/ai'
import { vClickOutside } from '@/utils/directives'
import { useModePicker } from '../composables/useModePicker'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()

const aiStore = useAiStore()
const { availableModes, hasModes, currentMode, modeLabel, selectMode } = useModePicker()

function onToggle() {
  if (props.isOpen) emit('close')
  else emit('open')
}

function onClose() {
  if (props.isOpen) emit('close')
}

function doSelect(mode: string) {
  selectMode(mode)
  emit('close')
}
</script>
