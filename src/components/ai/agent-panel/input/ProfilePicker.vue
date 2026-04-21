<template>
  <div ref="triggerEl" class="relative shrink-0">
    <button
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs text-base-content hover:bg-base-300 transition-colors max-w-25"
      :title="t('agentPanel.modePicker.switchMode')"
    >
      <span class="truncate">{{ currentLabel }}</span>
      <IconChevronDown class="icon-2xs shrink-0 text-base-content" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuEl"
        class="fixed w-40 bg-base-100 border border-base-300 rounded-field shadow-sm z-1200 py-1.5 px-1.5"
        :style="menuStyle"
      >
        <button
          v-for="option in modeOptions"
          :key="option.value"
          @click="select(option.value)"
          class="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-field text-xs text-base-content hover:bg-base-300 text-left"
        >
          <span
            class="icon-dot shrink-0"
            :class="option.value === currentMode ? 'bg-primary' : 'bg-transparent'"
          />
          <span
            class="truncate flex-1"
            :class="option.value === currentMode ? 'font-semibold text-base-content' : ''"
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
import { useI18n } from 'vue-i18n'
import { IconChevronDown } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiAgentMode } from '@/ai/types'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()
const { t } = useI18n()

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
  { value: 'edit', label: t('agentPanel.modePicker.options.edit') },
  { value: 'minimal', label: t('agentPanel.modePicker.options.minimal') },
  { value: 'creative', label: t('agentPanel.modePicker.options.creative') },
]

const currentMode = computed(() => aiStore.activeThread?.mode ?? aiStore.settings.defaultMode)
const currentLabel = computed(() => {
  return modeOptions.find(option => option.value === currentMode.value)?.label ?? t('agentPanel.modePicker.options.edit')
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
