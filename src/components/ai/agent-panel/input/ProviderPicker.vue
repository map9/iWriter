<template>
  <div ref="triggerEl" class="relative shrink-0">
    <button
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors min-w-0 max-w-25"
      :class="currentProvider ? 'text-base-content hover:bg-base-300' : 'text-error hover:bg-base-300'"
      title="Switch Provider"
    >
      <span class="icon-dot bg-primary shrink-0" />
      <span class="truncate">{{ currentProvider?.label ?? 'No Provider' }}</span>
      <IconChevronDown class="icon-2xs shrink-0 text-base-content" />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuEl"
        class="fixed w-56 bg-base-100 border border-base-300 rounded-field shadow-sm z-1200 py-1.5 px-1.5"
        :style="menuStyle"
      >
        <div>
          <input
            v-model="providerSearch"
            ref="providerSearchEl"
            placeholder="Find provider..."
            class="w-full px-2 py-1 text-xs border border-base-300 rounded-field focus:outline-none focus:border-primary bg-base-100 text-base-content"
          />
        </div>

        <div class="max-h-56 overflow-y-auto py-1">
          <template v-if="filteredProviders.length">
            <button
              v-for="cfg in filteredProviders"
              :key="cfg.id"
              @click="isLlmProviderUsable(cfg) && doSelect(cfg.id)"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-field text-xs text-base-content text-left"
              :class="isLlmProviderUsable(cfg)
                ? 'hover:bg-base-300 cursor-pointer'
                : 'cursor-not-allowed opacity-50'"
            >
              <span class="icon-dot shrink-0"
                :class="cfg.id === currentProviderId ? 'bg-primary' : 'bg-transparent'"
              />
              <span class="truncate flex-1"
                :class="cfg.id === currentProviderId ? 'font-semibold text-base-content' : ''"
              >{{ cfg.label }}</span>
            </button>
          </template>

          <div
            v-if="!filteredProviders.length"
            class="px-3 py-2 text-xs text-base-content text-center"
          >
            No providers found
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { IconChevronDown } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import { useProviderPicker } from '../composables/useProviderPicker'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()

const aiStore = useAiStore()
const { providerSearch, providerSearchEl, isLlmProviderUsable, filteredProviders, onMenuOpen, selectProvider } = useProviderPicker()
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuWidth = 208
const currentProvider = computed(() => aiStore.effectiveProviderConfig)
const currentProviderId = computed(() => currentProvider.value?.id ?? null)

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
  selectProvider(id)
  emit('close')
}

watch(() => props.isOpen, (open) => {
  if (open) {
    onMenuOpen()
    nextTick(() => {
      providerSearchEl.value?.focus()
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
