<template>
  <div ref="triggerEl" class="relative flex-shrink-0">
    <button
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-100 transition-colors max-w-25"
      title="切换 Agent Mode"
    >
      <span class="truncate">{{ currentLabel }}</span>
      <IconChevronDown class="w-3 h-3 flex-shrink-0 text-gray-400" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuEl"
        class="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[1200] py-1"
        :style="menuStyle"
      >
        <button
          v-for="option in modeOptions"
          :key="option.value"
          @click="select(option.value)"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
        >
          <span
            class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            :class="option.value === currentMode ? 'bg-primary-500' : 'bg-transparent'"
          />
          <span
            class="truncate flex-1"
            :class="option.value === currentMode ? 'font-semibold text-gray-900' : ''"
          >
            {{ option.label }}
          </span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { IconChevronDown } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiAgentMode } from '@/ai/types'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()

const aiStore = useAiStore()
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuWidth = 192

const menuStyle = computed(() => {
  if (!triggerEl.value) return {}
  const rect = triggerEl.value.getBoundingClientRect()
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
  const bottom = Math.max(8, window.innerHeight - rect.top + 4)
  return {
    left: `${left}px`,
    bottom: `${bottom}px`,
  }
})

const modeOptions: Array<{ value: AiAgentMode; label: string }> = [
  { value: 'edit', label: 'Edit' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'creative', label: 'Creative' },
]

const currentMode = computed(() => aiStore.activeThread?.mode ?? aiStore.settings.defaultMode)
const currentLabel = computed(() => {
  return modeOptions.find(option => option.value === currentMode.value)?.label ?? 'Edit'
})

function onToggle() {
  if (props.isOpen) emit('close')
  else emit('open')
}

function select(mode: AiAgentMode) {
  aiStore.setCurrentMode(mode)
  emit('close')
}

function handlePointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (triggerEl.value?.contains(target)) return
  if (menuEl.value?.contains(target)) return
  if (props.isOpen) emit('close')
}

watch(() => props.isOpen, open => {
  if (open) {
    document.addEventListener('mousedown', handlePointerDown)
  } else {
    document.removeEventListener('mousedown', handlePointerDown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handlePointerDown)
})
</script>
