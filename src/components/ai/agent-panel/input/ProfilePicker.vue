<template>
  <div ref="triggerEl" class="relative shrink-0">
    <button
      v-if="compact"
      @click="onToggle"
      class="flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-base-content hover:bg-base-300 transition-colors"
      :title="currentLabel"
    >
      <component :is="currentModeIcon" class="icon-xs shrink-0" />
      <IconChevronDown class="icon-2xs shrink-0 text-base-content" />
    </button>
    <button
      v-else
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs text-base-content hover:bg-base-300 transition-colors"
      :title="t('agentPanel.modePicker.switchMode')"
    >
      <span class="truncate">{{ currentLabel }}</span>
      <IconChevronDown class="icon-2xs shrink-0 text-base-content" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuEl"
        class="fixed w-52 bg-base-100 border border-base-300 rounded-field shadow-sm z-1200 py-1.5 px-1.5"
        :style="menuStyle"
      >
        <div class="px-1.5 pb-1.5 text-xs font-semibold text-base-content/40">
          {{ t('agentPanel.modePicker.title') }}
        </div>
        <button
          v-for="option in modeOptions"
          :key="option.value"
          @click="select(option.value)"
          class="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-field text-xs text-base-content hover:bg-base-300 text-left"
        >
          <span
            class="icon-dot shrink-0 mt-0.5"
            :class="option.value === currentMode ? 'bg-primary' : 'bg-transparent'"
          />
          <div class="flex flex-col flex-1 min-w-0">
            <span :class="option.value === currentMode ? 'font-semibold text-base-content' : ''">
              {{ option.label }}
            </span>
            <span class="text-base-content/40 leading-tight">{{ option.desc }}</span>
          </div>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { type Component, computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronDown, IconMinus, IconPencil, IconSparkles } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiAgentMode } from '@/ai/types'

const props = defineProps<{ isOpen: boolean; compact?: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()
const { t } = useI18n()

const aiStore = useAiStore()
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuWidth = 208

const MODE_ICONS: Record<AiAgentMode, Component> = {
  edit: IconPencil,
  minimal: IconMinus,
  creative: IconSparkles,
}

const menuStyle = computed(() => {
  if (!props.isOpen || !triggerEl.value) return {}
  const rect = triggerEl.value.getBoundingClientRect()
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
  const bottom = Math.max(8, window.innerHeight - rect.top + 4)
  return {
    left: `${left}px`,
    bottom: `${bottom}px`,
  }
})

const modeOptions: Array<{ value: AiAgentMode; label: string; desc: string }> = [
  { value: 'edit', label: t('agentPanel.modePicker.options.edit'), desc: t('agentPanel.modePicker.options.editDesc') },
  { value: 'minimal', label: t('agentPanel.modePicker.options.minimal'), desc: t('agentPanel.modePicker.options.minimalDesc') },
  { value: 'creative', label: t('agentPanel.modePicker.options.creative'), desc: t('agentPanel.modePicker.options.creativeDesc') },
]

const currentMode = computed(() => aiStore.activeThread?.mode ?? aiStore.settings.defaultMode)
const currentLabel = computed(() => {
  return modeOptions.find(option => option.value === currentMode.value)?.label ?? t('agentPanel.modePicker.options.edit')
})
const currentModeIcon = computed(() => MODE_ICONS[currentMode.value] ?? IconPencil)

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
