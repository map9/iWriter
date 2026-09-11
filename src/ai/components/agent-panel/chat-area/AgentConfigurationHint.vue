<template>
  <div
    class="agent-configuration-hint flex min-h-0 flex-col text-left"
    :class="variant === 'full'
      ? 'gap-3 px-4 pt-7'
      : 'mx-3 my-2 gap-2 rounded-field border border-base-300 bg-base-100 p-3 shadow-sm'"
    :data-kind="kind"
    :data-variant="variant"
  >
    <div class="flex items-center gap-2 text-base-content">
      <component :is="statusIcon" class="icon-sm shrink-0" />
      <h2 class="text-sm font-medium">
        {{ title }}
      </h2>
    </div>
    <p
      class="text-base-content/50"
      :class="variant === 'full' ? 'text-sm leading-6' : 'text-xs leading-5'"
    >
      {{ description }}
    </p>
    <button
      type="button"
      class="btn btn-primary w-full"
      :class="variant === 'full' ? 'h-9' : 'btn-sm h-8'"
      @click="emit('open-settings')"
    >
      <IconSettings class="icon-sm" />
      <span>{{ t('agentPanel.configuration.openSettings') }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconAlertTriangle, IconRobot, IconSettings } from '@tabler/icons-vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  kind: 'no-usable-provider' | 'thread-runtime-unavailable'
  variant: 'full' | 'compact'
}>()

const emit = defineEmits<{
  'open-settings': []
}>()

const { t } = useI18n()
const title = computed(() => t(`agentPanel.configuration.${props.kind === 'no-usable-provider'
  ? 'noUsableProvider'
  : 'threadRuntimeUnavailable'}.title`))
const description = computed(() => t(`agentPanel.configuration.${props.kind === 'no-usable-provider'
  ? 'noUsableProvider'
  : 'threadRuntimeUnavailable'}.description`))
const statusIcon = computed(() => props.kind === 'no-usable-provider' ? IconRobot : IconAlertTriangle)
</script>
