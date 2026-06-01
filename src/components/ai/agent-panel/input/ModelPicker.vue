<template>
  <div
    v-if="showModelPicker"
    ref="triggerEl"
    class="relative shrink-0"
  >
    <button
      v-if="compact"
      @click="onToggle"
      class="flex items-center gap-0.5 px-1.5 py-1 rounded-field text-xs text-base-content hover:bg-base-300 transition-colors"
      :title="currentModelId || t('agentPanel.modelPicker.chooseModel')"
    >
      <IconCube class="icon-xs shrink-0" />
      <IconChevronDown class="icon-2xs shrink-0 text-base-content" />
    </button>
    <button
      v-else
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded-field text-xs text-base-content hover:bg-base-300 transition-colors"
      :title="t('agentPanel.modelPicker.switchModel')"
    >
      <span class="truncate">{{ currentModelId || t('agentPanel.modelPicker.chooseModel') }}</span>
      <IconChevronDown class="icon-2xs shrink-0 text-base-content" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuEl"
        class="fixed w-56 bg-base-100 border border-base-300 rounded-field shadow-sm z-1200 py-1.5 px-1.5"
        :style="menuStyle"
      >
        <div class="px-1.5 pb-1.5 text-xs font-semibold text-base-content/30">
          {{ t('agentPanel.modelPicker.title') }}
        </div>
        <div v-if="allModelItems.length > 10">
          <input
            v-model="modelSearch"
            ref="modelSearchEl"
            :placeholder="t('agentPanel.modelPicker.findModel')"
            class="w-full px-2 py-1 text-xs border border-base-300 rounded-field focus:outline-none focus:border-primary bg-base-100 text-base-content"
          />
        </div>

        <div class="max-h-56 overflow-y-auto py-1">
          <div v-if="isLoadingOllamaModels" class="px-3 py-2 text-xs text-base-content text-center">
            <span class="inline-block icon-2xs border border-base-300 border-t-primary rounded-full animate-spin mr-1" />
            {{ t('agentPanel.modelPicker.loadingModels') }}
          </div>

          <button
            v-for="m in filteredModelItems"
            :key="m.id"
            @click="doSelect(m.id)"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-field text-xs text-base-content hover:bg-base-300 text-left"
          >
            <span class="icon-dot shrink-0"
              :class="m.id === currentModelId ? 'bg-primary' : 'bg-transparent'"
            />
            <span class="truncate flex-1"
              :class="m.id === currentModelId ? 'font-semibold text-base-content' : ''"
            >{{ m.id }}</span>
            <IconCloud v-if="m.status === 'cloud'" class="icon-2xs shrink-0 text-neutral-content" :title="t('agentPanel.modelPicker.cloudModel')" />
            <IconDownload v-else-if="m.status === 'remote'" class="icon-2xs shrink-0 text-base-content" :title="t('agentPanel.modelPicker.remoteModel')" />
          </button>

          <div v-if="!isLoadingOllamaModels && !filteredModelItems.length" class="px-3 py-2 text-xs text-base-content text-center">
            {{ t('agentPanel.modelPicker.noModelsFound') }}
          </div>
        </div>

        <div class="my-1 border-t border-base-300" />

        <div class="px-1.5 pb-1 text-xs font-semibold text-base-content/30">
          {{ t('agentPanel.modelPicker.thinkingLevel') }}
        </div>
        <button
          v-for="option in thinkingLevelItems"
          :key="option.value"
          @click="doSelectThinkingLevel(option.value)"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-field text-xs text-base-content hover:bg-base-300 text-left"
        >
          <span class="icon-dot shrink-0"
            :class="option.value === currentThinkingLevel ? 'bg-primary' : 'bg-transparent'"
          />
          <span class="truncate flex-1"
            :class="option.value === currentThinkingLevel ? 'font-semibold text-base-content' : ''"
          >{{ t(option.labelKey) }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronDown, IconCloud, IconCube, IconDownload } from '@tabler/icons-vue'
import { useModelPicker } from '../composables/useModelPicker'
import type { AiThinkingLevel } from '@/ai/types'

const props = defineProps<{ isOpen: boolean; compact?: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()
const { t } = useI18n()

const {
  modelSearch,
  modelSearchEl,
  isLoadingOllamaModels,
  allModelItems,
  filteredModelItems,
  showModelPicker,
  currentModelId,
  thinkingLevelItems,
  currentThinkingLevel,
  onMenuOpen,
  selectModel,
  selectThinkingLevel,
} = useModelPicker()
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuWidth = 224

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

function onToggle() {
  if (props.isOpen) emit('close')
  else emit('open')
}

function doSelect(id: string) {
  selectModel(id)
  emit('close')
}

function doSelectThinkingLevel(level: AiThinkingLevel) {
  selectThinkingLevel(level)
  emit('close')
}

watch(() => props.isOpen, async (open) => {
  if (open) {
    await onMenuOpen()
    nextTick(() => {
      modelSearchEl.value?.focus()
    })
  }
})

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
