<template>
  <button
    ref="itemRef"
    v-if="contentSegments.length > 0"
    :key="item.id"
    class="statusbar-item"
    :class="[
      'flex h-6 min-h-6 items-center gap-1 rounded-none border-none bg-transparent px-1 py-1',
      'transition-colors duration-150 hover:bg-neutral-content/70',
      'cursor-pointer',
      'whitespace-nowrap',
      {
        'text-neutral-content': !props.item.color,
        'cursor-default': !props.item.command
      }
    ]"
    :style="itemStyle"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Rich content with multiple icons and text segments -->
    <template v-for="(segment, index) in contentSegments" :key="index">
      <!-- Icon segment -->
      <component
        v-if="segment.type === 'icon' && getTablerIcon(segment.value)"
        :is="getTablerIcon(segment.value)"
        :class="[
          'icon-xs shrink-0',
          {
            'animate-spin': segment.animation === 'spin',
            'animate-ping': segment.animation === 'ping',
            'animate-pulse': segment.animation === 'pulse',
            'animate-bounce': segment.animation === 'bounce'
          }
        ]"
      />
      <!-- Text segment -->
      <span
        v-else-if="segment.type === 'text' && segment.value.trim()"
        class="select-none"
        v-text="segment.value"
      />
    </template>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { IStatusBarItem, Command } from '../types'
import { parseRichContent, getTablerIcon } from '../utils/iconParser'
import { tooltipManager } from '../utils/TooltipManager'

interface Props {
  item: IStatusBarItem
}

const props = defineProps<Props>()

const itemRef = ref<HTMLElement>()

// Parse rich content (multiple icons and text segments) from the item text
const contentSegments = computed(() => parseRichContent(props.item.text))

const itemStyle = computed(() => {
  const style: Record<string, string> = {}
  
  if (props.item.color) {
    style.color = props.item.color
  }
  
  if (props.item.backgroundColor) {
    style.backgroundColor = props.item.backgroundColor
  }
  
  return style
})

const handleClick = () => {
  const command = props.item.command
  if (!command) return

  if (typeof command === 'string') {
    // Emit command event for simple string commands
    emit('command', command, props.item)
  } else {
    // Handle Command object
    const cmd = command as Command
    emit('command', cmd.command, props.item, cmd.arguments)
  }
}

const handleMouseEnter = () => {
  if (props.item.tooltip && itemRef.value) {
    tooltipManager.show(props.item.tooltip, itemRef.value)
  }
}

const handleMouseLeave = () => {
  tooltipManager.hide()
}

const emit = defineEmits<{
  command: [command: string, item: IStatusBarItem, args?: unknown[]]
}>()
</script>
