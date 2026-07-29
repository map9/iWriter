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
      <span
        v-if="showCompactIndicator"
        ref="compactIndicatorRef"
        @mouseenter="handleCompactMouseEnter"
        @mouseleave="handleCompactMouseLeave"
        class="btn btn-ghost btn-square btn-xs cursor-default"
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
            :class="compactProgressClass()"
            class="text-primary"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="43.98"
            :stroke-dashoffset="43.98 * (1 - compactProgressRatio)"
            transform="rotate(-90 10 10)"
          />
          <circle
            cx="10"
            cy="10"
            r="2"
            :class="compactProgressClass()"
            fill="currentColor"
          />
        </svg>
      </span>
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
import type { ThreadUsage } from '@/ai/types'
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
  currentSessionTokens: number
  compactProgressRatio: number
  compactTriggerTokens: number
  maxInputTokens: number | null
  /** Real accumulated token usage for this thread (null if no run yet). */
  sessionUsage: ThreadUsage | null
}>()
const { t } = useI18n()

defineEmits<{
  'browse-files': []
  'browse-folder': []
  send: []
  stop: []
  'cancel-queued': []
}>()

type MenuName = 'provider' | 'model' | 'mode'
const activeMenu = ref<MenuName | null>(null)
const compactIndicatorRef = ref<HTMLElement | null>(null)
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
const showCompactIndicator = computed(() => props.showCompact)

const compactTooltip = computed<TooltipContent>(() => {
  const parts: string[] = [
    `**${t('agentPanel.toolbar.compactThreshold')}:**<br>`,
    t('agentPanel.toolbar.compactProgress', { percent: Math.round(props.compactProgressRatio * 100) }) + '<br>',
    t('agentPanel.toolbar.tokensUsed', {
      current: formatCompactTokens(props.currentSessionTokens),
      max: formatCompactTokens(props.compactTriggerTokens),
    }),
  ]

  if (props.maxInputTokens !== null) {
    parts.push('<br>')
    parts.push(t('agentPanel.toolbar.modelContextLimit', {
      max: formatCompactTokens(props.maxInputTokens),
    }))
  }

  const usage = props.sessionUsage
  if (usage && (usage.main.inputTokens > 0 || usage.subagents.inputTokens > 0)) {
    parts.push('<br><br>')
    parts.push(`**${t('agentPanel.toolbar.realUsage')}:**<br>`)
    parts.push(t('agentPanel.toolbar.inOut', {
      input: formatCompactTokens(usage.main.inputTokens),
      output: formatCompactTokens(usage.main.outputTokens),
    }))
    if (usage.main.cacheReadTokens > 0 || usage.main.cacheCreationTokens > 0) {
      parts.push('<br>')
      parts.push(t('agentPanel.toolbar.cacheHit', {
        read: formatCompactTokens(usage.main.cacheReadTokens),
        created: formatCompactTokens(usage.main.cacheCreationTokens),
      }))
    }
    if (usage.subagents.inputTokens > 0) {
      parts.push('<br>')
      parts.push(t('agentPanel.toolbar.subAgents', {
        input: formatCompactTokens(usage.subagents.inputTokens),
        output: formatCompactTokens(usage.subagents.outputTokens),
      }))
    }
  }

  return { type: 'markdown', content: parts.join('') }
})

function openMenu(name: MenuName) {
  activeMenu.value = name
}

function closeMenu() {
  activeMenu.value = null
}

function handleCompactMouseEnter() {
  if (!props.showCompact || !compactIndicatorRef.value) return
  tooltipManager.show(compactTooltip.value, compactIndicatorRef.value)
}

function handleCompactMouseLeave() {
  tooltipManager.hide()
}

function formatCompactTokens(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}k`
  return `${value}`
}

function compactProgressClass(): string {
  if (props.compactProgressRatio < 0.6) return 'text-success'
  if (props.compactProgressRatio < 0.9) return 'text-warning'
  return 'text-error'
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
