<template>
  <div
    class="grid w-full max-w-md grid-cols-2 gap-1 rounded-full bg-base-200 p-1"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue"
      :disabled="option.disabled"
      class="flex min-h-11 min-w-0 items-center justify-center rounded-full px-3 py-2 text-sm transition-colors"
      :class="[
        option.disabledHint ? 'flex-col gap-0.5' : 'gap-1',
        option.value === modelValue ? 'bg-base-100 shadow-sm' : '',
        option.disabled
          ? 'cursor-not-allowed text-base-content/30'
          : option.value === modelValue
            ? 'font-medium text-base-content'
            : 'text-base-content/60 hover:bg-base-100/60 hover:text-base-content',
      ]"
      @click="select(option)"
    >
      <span class="truncate leading-4">{{ option.label }}</span>
      <span
        v-if="option.disabledHint"
        class="inline-flex items-center gap-1 text-2xs leading-3 text-warning"
      >
        <IconAlertTriangle class="size-3 shrink-0" />
        {{ option.disabledHint }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { IconAlertTriangle } from '@tabler/icons-vue'
import type { AiAgentMode } from '@shared/ai/contracts'

export interface AgentModeOption {
  value: AiAgentMode
  label: string
  disabled?: boolean
  disabledHint?: string
}

defineProps<{
  label: string
  modelValue: AiAgentMode
  options: AgentModeOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [mode: AiAgentMode]
}>()

function select(option: AgentModeOption) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
}
</script>
