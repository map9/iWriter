<template>
  <div ref="toolbarEl" class="flex items-center gap-2 px-2 pb-2 pt-1 min-w-0">

    <div class="flex items-center gap-1 min-w-0 flex-1 flex-nowrap overflow-hidden">
      <AttachPicker
        @browse-files="$emit('browse-files')"
        @browse-folder="$emit('browse-folder')"
      />

      <ProviderPicker
        v-if="showProviderPicker"
        :is-open="activeMenu === 'provider'"
        @open="openMenu('provider')"
        @close="closeMenu()"
      />

      <ModelPicker
        v-if="showModelPickerResponsive"
        :is-open="activeMenu === 'model'"
        @open="openMenu('model')"
        @close="closeMenu()"
      />

      <ModePicker
        v-if="showModePicker"
        :is-open="activeMenu === 'mode'"
        @open="openMenu('mode')"
        @close="closeMenu()"
      />
    </div>

    <div class="flex items-center gap-1.5 min-w-0 ml-auto flex-shrink-0">
      <button
        v-if="showCompactButton"
        ref="compactButtonRef"
        @click="$emit('compact')"
        @mouseenter="handleCompactMouseEnter"
        @mouseleave="handleCompactMouseLeave"
        :disabled="isCompacting"
        class="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-500 flex-shrink-0"
        :class="isCompacting ? 'opacity-40 cursor-not-allowed' : ''"
      >
        <svg viewBox="0 0 20 20" class="w-4 h-4">
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            class="text-gray-200"
            stroke="currentColor"
            stroke-width="2"
          />
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            class="text-blue-500"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            :stroke-dasharray="43.98"
            :stroke-dashoffset="43.98 * (1 - compactProgressRatio)"
            transform="rotate(-90 10 10)"
          />
          <circle
            v-if="isCompacting"
            cx="10"
            cy="10"
            r="3"
            class="text-blue-500 animate-pulse"
            fill="currentColor"
          />
          <circle
            v-else
            cx="10"
            cy="10"
            r="2"
            :class="compactProgressRatio >= 1 ? 'text-red-500' : 'text-gray-400'"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>

    <div class="flex items-center flex-shrink-0">
      <SendButton
        :is-pending-send="isPendingSend"
        :is-streaming="isStreaming"
        :can-send="canSend"
        @send="$emit('send')"
        @stop="$emit('stop')"
        @cancel-queued="$emit('cancel-queued')"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TooltipContent } from '@/components/common/statusbar'
import { tooltipManager } from '@/components/common/statusbar'
import AttachPicker from './AttachPicker.vue'
import ProviderPicker from './ProviderPicker.vue'
import ModelPicker from './ModelPicker.vue'
import ModePicker from './ProfilePicker.vue'
import SendButton from './SendButton.vue'

const props = defineProps<{
  isPendingSend: boolean
  isStreaming: boolean
  canSend: boolean
  showCompact: boolean
  isCompacting: boolean
  currentSessionTokens: number
  compactProgressRatio: number
  compactTriggerTokens: number
  maxInputTokens: number | null
}>()

defineEmits<{
  'browse-files': []
  'browse-folder': []
  compact: []
  send: []
  stop: []
  'cancel-queued': []
}>()

type MenuName = 'provider' | 'model' | 'mode'
const activeMenu = ref<MenuName | null>(null)
const compactButtonRef = ref<HTMLElement | null>(null)
const toolbarEl = ref<HTMLElement | null>(null)
const toolbarWidth = ref(0)
let resizeObserver: ResizeObserver | null = null

const showProviderPicker = computed(() => toolbarWidth.value >= 180)
const showModelPickerResponsive = computed(() => toolbarWidth.value >= 280)
const showModePicker = computed(() => toolbarWidth.value >= 380)
const showCompactButton = computed(() => props.showCompact)

const compactTooltip = computed<TooltipContent>(() => ({
  type: 'markdown',
  content: [
    `**Context window:**<br>`,
    `${Math.round(props.compactProgressRatio * 100)}% full<br>`,
    `${formatCompactTokens(props.currentSessionTokens)} / ${formatCompactTokens(props.maxInputTokens ?? 0)} tokens used`,
  ].join(''),
}))

function openMenu(name: MenuName) {
  activeMenu.value = name
}

function closeMenu() {
  activeMenu.value = null
}

function handleCompactMouseEnter() {
  if (!props.showCompact || !compactButtonRef.value) return
  tooltipManager.show(compactTooltip.value, compactButtonRef.value)
}

function handleCompactMouseLeave() {
  tooltipManager.hide()
}

function formatCompactTokens(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}k`
  return `${value}`
}

onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    toolbarWidth.value = entries[0]?.contentRect.width ?? 0
  })
  if (toolbarEl.value) resizeObserver.observe(toolbarEl.value)
})

watch(
  () => ({
    provider: showProviderPicker.value,
    model: showModelPickerResponsive.value,
    mode: showModePicker.value,
  }),
  visible => {
    if (activeMenu.value === 'provider' && !visible.provider) closeMenu()
    if (activeMenu.value === 'model' && !visible.model) closeMenu()
    if (activeMenu.value === 'mode' && !visible.mode) closeMenu()
  }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>
