<template>
  <div
    v-if="showModelPicker"
    ref="triggerEl"
    class="relative flex-shrink-0"
  >
    <button
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors max-w-25"
      title="切换模型"
    >
      <span class="truncate">{{ currentModelId || '选择模型' }}</span>
      <IconChevronDown class="w-3 h-3 flex-shrink-0 text-text-tertiary" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuEl"
        class="fixed w-56 bg-background-content border border-border-separator rounded-lg shadow-lg z-[1200]"
        :style="menuStyle"
      >
        <div v-if="allModelItems.length > 10" class="px-2 pt-2 pb-1">
          <input
            v-model="modelSearch"
            ref="modelSearchEl"
            placeholder="Find model..."
            class="w-full px-2 py-1 text-xs border border-border-separator rounded focus:outline-none focus:ring-1 focus:ring-accent-primary bg-background-content text-text-primary"
          />
        </div>

        <div class="max-h-56 overflow-y-auto py-1">
          <div v-if="isLoadingOllamaModels" class="px-3 py-2 text-xs text-text-tertiary text-center">
            <span class="inline-block w-3 h-3 border border-border-separator border-t-accent-primary rounded-full animate-spin mr-1" />
            加载中…
          </div>

          <button
            v-for="m in filteredModelItems"
            :key="m.id"
            @click="doSelect(m.id)"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-interactive-hover text-left"
          >
            <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
              :class="m.id === currentModelId ? 'bg-accent-primary' : 'bg-transparent'"
            />
            <span class="truncate flex-1"
              :class="m.id === currentModelId ? 'font-semibold text-text-primary' : ''"
            >{{ m.id }}</span>
            <IconCloud v-if="m.status === 'cloud'" class="w-3 h-3 flex-shrink-0 text-blue-400" title="云端模型" />
            <IconDownload v-else-if="m.status === 'remote'" class="w-3 h-3 flex-shrink-0 text-text-tertiary" title="未下载" />
          </button>

          <div v-if="!isLoadingOllamaModels && !filteredModelItems.length" class="px-3 py-2 text-xs text-text-tertiary text-center">
            暂无可用模型
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { IconChevronDown, IconCloud, IconDownload } from '@tabler/icons-vue'
import { useModelPicker } from '../composables/useModelPicker'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()

const { modelSearch, modelSearchEl, isLoadingOllamaModels, allModelItems, filteredModelItems, showModelPicker, currentModelId, onMenuOpen, selectModel } = useModelPicker()
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuWidth = 224

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

function onToggle() {
  if (props.isOpen) emit('close')
  else emit('open')
}

function doSelect(id: string) {
  selectModel(id)
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
