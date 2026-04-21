<template>
  <div class="flex items-center gap-2 px-2 pb-2 pt-1 min-w-0">

    <div ref="pickerGroupEl" class="flex items-center gap-1 min-w-0 flex-1 flex-nowrap overflow-hidden">
      <AttachPicker
        @browse-files="$emit('browse-files')"
        @browse-folder="$emit('browse-folder')"
      />

      <ProviderPicker
        :compact="providerCompact"
        :is-open="activeMenu === 'provider'"
        @open="openMenu('provider')"
        @close="closeMenu()"
      />

      <ModelPicker
        :compact="modelCompact"
        :is-open="activeMenu === 'model'"
        @open="openMenu('model')"
        @close="closeMenu()"
      />

      <ModePicker
        :compact="profileCompact"
        :is-open="activeMenu === 'mode'"
        @open="openMenu('mode')"
        @close="closeMenu()"
      />
    </div>

    <div class="flex items-center gap-1.5 min-w-0 ml-auto shrink-0">
      <button
        v-if="showCompactButton"
        ref="compactButtonRef"
        @click="$emit('compact')"
        @mouseenter="handleCompactMouseEnter"
        @mouseleave="handleCompactMouseLeave"
        :disabled="isCompacting"
        class="iw-toolbar-btn btn-xs"
        :class="isCompacting ? 'opacity-40 cursor-not-allowed' : ''"
      >
        <svg viewBox="0 0 20 20" class="icon-xs">
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            class="text-base-content/30"
            stroke="currentColor"
            stroke-width="3"
          />
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            class="text-primary"
            stroke="currentColor"
            stroke-width="3"
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
            class="text-primary animate-pulse"
            fill="currentColor"
          />
          <circle
            v-else
            cx="10"
            cy="10"
            r="2"
            :class="compactProgressRatio >= 1 ? 'text-error' : 'text-base-content/30'"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>

    <div class="flex items-center shrink-0">
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

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
const pickerGroupEl = ref<HTMLElement | null>(null)
const providerCompact = ref(false)
const modelCompact = ref(false)
const profileCompact = ref(false)
let resizeObserver: ResizeObserver | null = null

function getUsedWidth(): number {
  const el = pickerGroupEl.value
  if (!el || !el.children.length) return 0
  const first = el.children[0] as HTMLElement
  const last = el.children[el.children.length - 1] as HTMLElement
  return last.offsetLeft + last.offsetWidth - first.offsetLeft
}

async function updateLayout() {
  if (!pickerGroupEl.value) return
  const available = pickerGroupEl.value.clientWidth

  // Reset all to text mode and re-measure after each step
  providerCompact.value = false
  modelCompact.value = false
  profileCompact.value = false
  await nextTick()
  if (getUsedWidth() <= available) return

  profileCompact.value = true
  await nextTick()
  if (getUsedWidth() <= available) return

  modelCompact.value = true
  await nextTick()
  if (getUsedWidth() <= available) return

  providerCompact.value = true
}
const showCompactButton = computed(() => props.showCompact)

const compactTooltip = computed<TooltipContent>(() => ({
  type: 'markdown',
  content: [
    `**${t('agentPanel.toolbar.contextWindow')}:**<br>`,
    t('agentPanel.toolbar.progressFull', { percent: Math.round(props.compactProgressRatio * 100) }) + '<br>',
    t('agentPanel.toolbar.tokensUsed', {
      current: formatCompactTokens(props.currentSessionTokens),
      max: formatCompactTokens(props.maxInputTokens ?? 0),
    }),
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
  resizeObserver = new ResizeObserver(() => updateLayout())
  if (pickerGroupEl.value) resizeObserver.observe(pickerGroupEl.value)
  updateLayout()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>
