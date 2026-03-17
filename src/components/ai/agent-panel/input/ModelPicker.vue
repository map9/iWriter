<template>
  <div
    v-if="showModelPicker"
    class="relative flex-shrink-0"
    v-click-outside="onClose"
  >
    <button
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-100 transition-colors max-w-[110px]"
      title="切换模型"
    >
      <span class="truncate">{{ currentModelId || '选择模型' }}</span>
      <IconChevronDown class="w-3 h-3 flex-shrink-0 text-gray-400" />
    </button>

    <div
      v-if="isOpen"
      class="absolute bottom-full left-0 mb-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20"
    >
      <div v-if="allModelItems.length > 10" class="px-2 pt-2 pb-1">
        <input
          v-model="modelSearch"
          ref="modelSearchEl"
          placeholder="Find model..."
          class="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-400"
        />
      </div>

      <div class="max-h-56 overflow-y-auto py-1">
        <div v-if="isLoadingOllamaModels" class="px-3 py-2 text-xs text-gray-400 text-center">
          <span class="inline-block w-3 h-3 border border-gray-300 border-t-primary-500 rounded-full animate-spin mr-1" />
          加载中…
        </div>

        <button
          v-for="m in filteredModelItems"
          :key="m.id"
          @click="doSelect(m.id)"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
        >
          <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            :class="m.id === currentModelId ? 'bg-primary-500' : 'bg-transparent'"
          />
          <span class="truncate flex-1"
            :class="m.id === currentModelId ? 'font-semibold text-gray-900' : ''"
          >{{ m.id }}</span>
          <IconCloud v-if="m.status === 'cloud'" class="w-3 h-3 flex-shrink-0 text-blue-400" title="云端模型" />
          <IconDownload v-else-if="m.status === 'remote'" class="w-3 h-3 flex-shrink-0 text-gray-400" title="未下载" />
        </button>

        <div v-if="!isLoadingOllamaModels && !filteredModelItems.length" class="px-3 py-2 text-xs text-gray-400 text-center">
          暂无可用模型
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { IconChevronDown, IconCloud, IconDownload } from '@tabler/icons-vue'
import { vClickOutside } from '@/utils/directives'
import { useModelPicker } from '../composables/useModelPicker'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()

const { modelSearch, modelSearchEl, isLoadingOllamaModels, allModelItems, filteredModelItems, showModelPicker, currentModelId, onMenuOpen, selectModel } = useModelPicker()

function onToggle() {
  if (props.isOpen) emit('close')
  else emit('open')
}

function onClose() {
  if (props.isOpen) emit('close')
}

function doSelect(id: string) {
  selectModel(id)
  emit('close')
}

watch(() => props.isOpen, async (open) => {
  if (open) await onMenuOpen()
})
</script>
