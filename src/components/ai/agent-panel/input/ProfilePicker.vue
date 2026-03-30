<template>
  <div class="relative flex-shrink-0" v-click-outside="onClose">
    <button
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-100 transition-colors max-w-[110px]"
      title="切换 Agent 模式"
    >
      <span class="truncate">{{ currentLabel }}</span>
      <IconChevronDown class="w-3 h-3 flex-shrink-0 text-gray-400" />
    </button>

    <div
      v-if="isOpen"
      class="absolute bottom-full left-0 mb-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1"
    >
      <button
        v-for="option in profileOptions"
        :key="option.value"
        @click="select(option.value)"
        class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
      >
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :class="option.value === currentProfile ? 'bg-primary-500' : 'bg-transparent'"
        />
        <span
          class="truncate flex-1"
          :class="option.value === currentProfile ? 'font-semibold text-gray-900' : ''"
        >
          {{ option.label }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconChevronDown } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import { vClickOutside } from '@/utils/directives'
import type { AiAgentProfile } from '@/ai/types'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()

const aiStore = useAiStore()

const profileOptions: Array<{ value: AiAgentProfile; label: string }> = [
  { value: 'edit', label: 'Edit' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'creative', label: 'Creative' },
]

const currentProfile = computed(() => aiStore.activeThread?.profile ?? aiStore.settings.defaultProfile)
const currentLabel = computed(() => {
  return profileOptions.find(option => option.value === currentProfile.value)?.label ?? 'Edit'
})

function onToggle() {
  if (props.isOpen) emit('close')
  else emit('open')
}

function onClose() {
  if (props.isOpen) emit('close')
}

function select(profile: AiAgentProfile) {
  aiStore.setCurrentProfile(profile)
  emit('close')
}
</script>
