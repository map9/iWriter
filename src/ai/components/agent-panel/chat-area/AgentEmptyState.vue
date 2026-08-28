<template>
  <div
    v-if="!aiStore.displayMessages.length && !aiStore.liveTurnState && !aiStore.isSwitchingThread"
    class="flex min-h-full flex-col items-center text-center"
  >
    <div class="my-auto flex w-full flex-col items-center py-4">
      <h2 class="text-xl font-medium text-base-content pb-2">
        {{ modePrompt }}
      </h2>
      <AgentModeSwitch
        v-if="aiStore.isActiveThreadDraft"
        class="mt-3"
        :label="t('agentPanel.modePicker.switchMode')"
        :model-value="currentMode"
        :options="modeOptions"
        @update:model-value="aiStore.setCurrentMode"
      />

      <div class="mt-7 w-full max-w-md">
        <div class="min-h-5">
          <p class="text-sm font-semibold text-base-content">
            {{ currentGroup.title }}
          </p>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 auto-rows-fr">
          <button
            v-for="prompt in currentGroup.prompts"
            :key="prompt"
            type="button"
            class="h-14 rounded-field border border-base-300 bg-base-100 px-2 py-2 text-left text-xs leading-4 text-base-content shadow-sm transition-colors overflow-hidden hover:bg-base-200"
            @click="emit('suggest', prompt)"
          >
            <span class="block">
              {{ prompt }}
            </span>
          </button>
        </div>

        <div class="mt-5 flex items-center justify-center gap-2">
          <button
            v-for="(group, index) in promptGroups"
            :key="group.title"
            type="button"
            class="icon-dot transition-all"
            :class="index === activeGroupIndex ? 'bg-base-content scale-150' : 'bg-base-100 border border-base-300 hover:bg-base-300 hover:cursor-pointer hover:scale-150'"
            :title="group.title"
            @click="activeGroupIndex = index"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiStore } from '@/ai/state/aiStore'
import { useAppStore } from '@/stores/app'
import AgentModeSwitch from './AgentModeSwitch.vue'

interface PromptGroup {
  title: string
  prompts: string[]
}

const aiStore = useAiStore()
const appStore = useAppStore()
const { t } = useI18n()
const emit = defineEmits<{ suggest: [prompt: string] }>()

const hasActiveDocument = computed(() => !!appStore.activeTab)
const currentMode = computed(() => aiStore.activeThread?.mode ?? aiStore.settings.defaultMode)
const modeOptions = computed(() => {
  const creativeDisabled = !appStore.currentFolder
  return [
    {
      value: 'edit' as const,
      label: t('agentPanel.modePicker.options.edit'),
    },
    {
      value: 'creative' as const,
      label: t('agentPanel.modePicker.options.creative'),
      disabled: creativeDisabled,
      disabledHint: creativeDisabled
        ? t('agentPanel.modePicker.options.creativeDisabledHint')
        : undefined,
    },
  ]
})
const modePrompt = computed(() =>
  currentMode.value === 'creative'
    ? t('agentPanel.emptyState.promptCreative')
    : t('agentPanel.emptyState.promptEdit'),
)
const activeGroupIndex = ref(0)
let carouselTimer: ReturnType<typeof setInterval> | null = null

// Number of example groups per mode/context. Matches the i18n structure under
// `agentPanel.emptyState.<mode>.<withDocument|noDocument>.group<N>`.
const GROUP_COUNTS: Record<'edit' | 'creative', { withDocument: number; noDocument: number }> = {
  edit: { withDocument: 3, noDocument: 3 },
  creative: { withDocument: 5, noDocument: 3 },
}

const promptGroups = computed<PromptGroup[]>(() => {
  const mode = currentMode.value === 'creative' ? 'creative' : 'edit'
  const context = hasActiveDocument.value ? 'withDocument' : 'noDocument'
  const groupCount = GROUP_COUNTS[mode][context]

  return Array.from({ length: groupCount }, (_, index) => {
    const groupKey = `agentPanel.emptyState.${mode}.${context}.group${index + 1}`
    return {
      title: t(`${groupKey}.title`),
      prompts: Array.from({ length: 6 }, (_, promptIndex) => t(`${groupKey}.prompts.${promptIndex + 1}`)),
    }
  })
})

const currentGroup = computed(() => promptGroups.value[activeGroupIndex.value] ?? promptGroups.value[0]!)

watch(promptGroups, groups => {
  if (activeGroupIndex.value >= groups.length) {
    activeGroupIndex.value = 0
  }
})

function startCarousel() {
  stopCarousel()
  if (promptGroups.value.length <= 1) return
  carouselTimer = setInterval(() => {
    activeGroupIndex.value = (activeGroupIndex.value + 1) % promptGroups.value.length
  }, 4200)
}

function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
}

watch(promptGroups, () => {
  startCarousel()
})

onMounted(() => {
  startCarousel()
})

onUnmounted(() => {
  stopCarousel()
})
</script>
