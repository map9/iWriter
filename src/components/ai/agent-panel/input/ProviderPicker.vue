<template>
  <div class="relative flex-shrink-0" v-click-outside="onClose">
    <button
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors min-w-0 max-w-[90px]"
      :class="aiStore.activeProviderConfig ? 'text-gray-700 hover:bg-gray-100' : 'text-red-500 hover:bg-gray-100'"
      title="切换 Provider"
    >
      <span class="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
      <span class="truncate">{{ aiStore.activeProviderConfig?.label ?? '未配置' }}</span>
      <IconChevronDown class="w-3 h-3 flex-shrink-0 text-gray-400" />
    </button>

    <div
      v-if="isOpen"
      class="absolute bottom-full left-0 mb-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-20"
    >
      <div class="px-2 pt-2 pb-1">
        <input
          v-model="providerSearch"
          ref="providerSearchEl"
          placeholder="Find provider..."
          class="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-400"
        />
      </div>

      <div class="max-h-56 overflow-y-auto pb-1">
        <template v-if="filteredProviders.length">
          <button
            v-for="cfg in filteredProviders"
            :key="cfg.id"
            @click="isLlmProviderUsable(cfg) && doSelect(cfg.id)"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left"
            :class="isLlmProviderUsable(cfg)
              ? 'text-gray-700 hover:bg-gray-50 cursor-pointer'
              : 'text-gray-400 cursor-not-allowed opacity-50'"
          >
            <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
              :class="cfg.id === aiStore.settings.activeProviderConfigId ? 'bg-primary-500' : 'bg-transparent'"
            />
            <span class="truncate flex-1"
              :class="cfg.id === aiStore.settings.activeProviderConfigId ? 'font-semibold text-gray-900' : ''"
            >{{ cfg.label }}</span>
          </button>
        </template>

        <div
          v-if="!filteredProviders.length"
          class="px-3 py-2 text-xs text-gray-400 text-center"
        >
          暂无配置
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { IconChevronDown } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import { vClickOutside } from '@/utils/directives'
import { useProviderPicker } from '../composables/useProviderPicker'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()

const aiStore = useAiStore()
const { providerSearch, providerSearchEl, isLlmProviderUsable, filteredProviders, onMenuOpen, selectProvider } = useProviderPicker()

function onToggle() {
  if (props.isOpen) emit('close')
  else emit('open')
}

function onClose() {
  if (props.isOpen) emit('close')
}

function doSelect(id: string) {
  selectProvider(id)
  emit('close')
}

watch(() => props.isOpen, (open) => {
  if (open) onMenuOpen()
})
</script>
