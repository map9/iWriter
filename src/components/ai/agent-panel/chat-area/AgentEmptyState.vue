<template>
  <div
    v-if="!aiStore.displayMessages.length && !aiStore.liveTurnState && !aiStore.isSwitchingThread"
    class="flex flex-col items-center justify-center h-full text-center"
  >
    <div class="mt-4 flex flex-col items-center">
      <IconBrain class="size-12 text-base-content" />
      <p class="mt-2 text-md font-medium text-base-content">{{ t('agentPanel.emptyState.brand') }}</p>
      <p class="mt-1 max-w-xs text-xs leading-5 text-base-content opacity-50">
        {{ t('agentPanel.emptyState.subtitle') }}
      </p>
    </div>

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
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconBrain } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import { useAppStore } from '@/stores/app'

interface PromptGroup {
  title: string
  prompts: string[]
}

const aiStore = useAiStore()
const appStore = useAppStore()
const { t } = useI18n()
const emit = defineEmits<{ suggest: [prompt: string] }>()

const hasActiveDocument = computed(() => !!appStore.activeTab)
const activeGroupIndex = ref(0)
let carouselTimer: ReturnType<typeof setInterval> | null = null

const promptGroups = computed<PromptGroup[]>(() => {
  if (hasActiveDocument.value) {
    return [
      {
        title: t('agentPanel.emptyState.withDocument.group1.title'),
        prompts: [
          t('agentPanel.emptyState.withDocument.group1.prompts.1'),
          t('agentPanel.emptyState.withDocument.group1.prompts.2'),
          t('agentPanel.emptyState.withDocument.group1.prompts.3'),
          t('agentPanel.emptyState.withDocument.group1.prompts.4'),
          t('agentPanel.emptyState.withDocument.group1.prompts.5'),
          t('agentPanel.emptyState.withDocument.group1.prompts.6'),
        ],
      },
      {
        title: t('agentPanel.emptyState.withDocument.group2.title'),
        prompts: [
          t('agentPanel.emptyState.withDocument.group2.prompts.1'),
          t('agentPanel.emptyState.withDocument.group2.prompts.2'),
          t('agentPanel.emptyState.withDocument.group2.prompts.3'),
          t('agentPanel.emptyState.withDocument.group2.prompts.4'),
          t('agentPanel.emptyState.withDocument.group2.prompts.5'),
          t('agentPanel.emptyState.withDocument.group2.prompts.6'),
        ],
      },
      {
        title: t('agentPanel.emptyState.withDocument.group3.title'),
        prompts: [
          t('agentPanel.emptyState.withDocument.group3.prompts.1'),
          t('agentPanel.emptyState.withDocument.group3.prompts.2'),
          t('agentPanel.emptyState.withDocument.group3.prompts.3'),
          t('agentPanel.emptyState.withDocument.group3.prompts.4'),
          t('agentPanel.emptyState.withDocument.group3.prompts.5'),
          t('agentPanel.emptyState.withDocument.group3.prompts.6'),
        ],
      },
      {
        title: t('agentPanel.emptyState.withDocument.group4.title'),
        prompts: [
          t('agentPanel.emptyState.withDocument.group4.prompts.1'),
          t('agentPanel.emptyState.withDocument.group4.prompts.2'),
          t('agentPanel.emptyState.withDocument.group4.prompts.3'),
          t('agentPanel.emptyState.withDocument.group4.prompts.4'),
          t('agentPanel.emptyState.withDocument.group4.prompts.5'),
          t('agentPanel.emptyState.withDocument.group4.prompts.6'),
        ],
      },
      {
        title: t('agentPanel.emptyState.withDocument.group5.title'),
        prompts: [
          t('agentPanel.emptyState.withDocument.group5.prompts.1'),
          t('agentPanel.emptyState.withDocument.group5.prompts.2'),
          t('agentPanel.emptyState.withDocument.group5.prompts.3'),
          t('agentPanel.emptyState.withDocument.group5.prompts.4'),
          t('agentPanel.emptyState.withDocument.group5.prompts.5'),
          t('agentPanel.emptyState.withDocument.group5.prompts.6'),
        ],
      },
    ]
  }

  return [
    {
      title: t('agentPanel.emptyState.noDocument.group1.title'),
      prompts: [
        t('agentPanel.emptyState.noDocument.group1.prompts.1'),
        t('agentPanel.emptyState.noDocument.group1.prompts.2'),
        t('agentPanel.emptyState.noDocument.group1.prompts.3'),
        t('agentPanel.emptyState.noDocument.group1.prompts.4'),
        t('agentPanel.emptyState.noDocument.group1.prompts.5'),
        t('agentPanel.emptyState.noDocument.group1.prompts.6'),
      ],
    },
    {
      title: t('agentPanel.emptyState.noDocument.group2.title'),
      prompts: [
        t('agentPanel.emptyState.noDocument.group2.prompts.1'),
        t('agentPanel.emptyState.noDocument.group2.prompts.2'),
        t('agentPanel.emptyState.noDocument.group2.prompts.3'),
        t('agentPanel.emptyState.noDocument.group2.prompts.4'),
        t('agentPanel.emptyState.noDocument.group2.prompts.5'),
        t('agentPanel.emptyState.noDocument.group2.prompts.6'),
      ],
    },
    {
      title: t('agentPanel.emptyState.noDocument.group3.title'),
      prompts: [
        t('agentPanel.emptyState.noDocument.group3.prompts.1'),
        t('agentPanel.emptyState.noDocument.group3.prompts.2'),
        t('agentPanel.emptyState.noDocument.group3.prompts.3'),
        t('agentPanel.emptyState.noDocument.group3.prompts.4'),
        t('agentPanel.emptyState.noDocument.group3.prompts.5'),
        t('agentPanel.emptyState.noDocument.group3.prompts.6'),
      ],
    },
  ]
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
