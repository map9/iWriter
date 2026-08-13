<template>
  <div ref="triggerEl" class="relative shrink-0">
    <button
      v-if="compact"
      @click="onToggle"
      class="flex items-center gap-0.5 px-1.5 py-1 rounded-field text-xs transition-colors"
      :class="currentProvider ? 'text-base-content hover:bg-base-300' : 'text-error hover:bg-base-300'"
      :title="currentProviderLabel ?? t('agentPanel.providerPicker.noProvider')"
    >
      <component :is="currentProviderIcon" class="icon-xs shrink-0" />
      <IconChevronDown class="icon-2xs shrink-0 text-base-content" />
    </button>
    <button
      v-else
      @click="onToggle"
      class="flex items-center gap-1 px-2 py-1 rounded-field text-xs transition-colors"
      :class="currentProvider ? 'text-base-content hover:bg-base-300' : 'text-error hover:bg-base-300'"
      :title="t('agentPanel.providerPicker.switchProvider')"
    >
      <component :is="currentProviderIcon" class="icon-xs shrink-0" />
      <span class="truncate">{{ currentProviderLabel ?? t('agentPanel.providerPicker.noProvider') }}</span>
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
          {{ t('agentPanel.providerPicker.title') }}
        </div>
        <div>
          <input
            v-model="providerSearch"
            ref="providerSearchEl"
            :placeholder="t('agentPanel.providerPicker.findProvider')"
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
              <component
                :is="getProviderIcon(cfg)"
                class="icon-xs shrink-0 text-base-content"
              />
              <span class="truncate flex-1"
                :class="cfg.id === currentProviderId ? 'font-semibold text-base-content' : ''"
              >{{ getProviderDisplayLabel(cfg) }}</span>
            </button>
          </template>

          <div
            v-if="!filteredProviders.length"
            class="px-3 py-2 text-xs text-base-content text-center"
          >
            {{ t('agentPanel.providerPicker.noProvidersFound') }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { type Component, computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconBrandOpenai,
  IconChevronDown,
  IconRobot,
  IconServer,
} from '@tabler/icons-vue'
import IconAnthropic from '@/components/icons/IconAnthropic.vue'
import IconDeepseek from '@/components/icons/IconDeepseek.vue'
import IconGemini from '@/components/icons/IconGemini.vue'
import IconGlm from '@/components/icons/IconGlm.vue'
import IconOllama from '@/components/icons/IconOllama.vue'
import { useAiStore } from '@/ai/state/aiStore'
import type { AiProviderConfig } from '@/ai/types'
import { useProviderPicker } from '../composables/useProviderPicker'

const props = defineProps<{ isOpen: boolean; compact?: boolean }>()
const emit = defineEmits<{ open: []; close: [] }>()
const { t } = useI18n()

const aiStore = useAiStore()
const {
  providerSearch,
  providerSearchEl,
  isLlmProviderUsable,
  filteredProviders,
  getProviderDisplayLabel,
  onMenuOpen,
  selectProvider,
} = useProviderPicker()
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuWidth = 224

const currentProvider = computed(() => aiStore.effectiveProviderConfig)
const currentProviderId = computed(() => currentProvider.value?.id ?? null)
const currentProviderLabel = computed(() => (
  currentProvider.value ? getProviderDisplayLabel(currentProvider.value) : null
))

function getProviderIcon(cfg: AiProviderConfig): Component {
  const byPreset: Record<string, Component> = {
    openai: IconBrandOpenai,
    anthropic: IconAnthropic,
    gemini: IconGemini,
    deepseek: IconDeepseek,
    ollama: IconOllama,
    glm: IconGlm,
  }
  if (cfg.presetId && byPreset[cfg.presetId]) return byPreset[cfg.presetId] as Component
  const byType: Record<string, Component> = {
    'openai-compat': IconServer,
    anthropic: IconAnthropic,
    gemini: IconGemini,
    deepseek: IconDeepseek,
  }
  return (byType[cfg.type] as Component | undefined) ?? IconRobot
}

const currentProviderIcon = computed(() =>
  currentProvider.value ? getProviderIcon(currentProvider.value) : IconRobot
)

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
