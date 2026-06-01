<template>
  <div
    class="flex items-center rounded-none bg-transparent transition-colors duration-150 hover:bg-neutral-content/15"
    :class="[
      {
        'text-neutral-content': !props.group.color,
      }
    ]"
    :style="groupStyle"
    >
    <template v-for="(item, index) in group.items" :key="item.id">
      <span
        v-if="index > 0 && group.separator && group.separator.length > 0 && item.text && item.text.trim()"
        class="px-0 text-neutral-content/50"
      >{{ group.separator }}</span>

      <StatusBarItem
        :item="item"
        @command="handleCommand"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IStatusBarGroup, IStatusBarItem } from '../types'
import StatusBarItem from './StatusBarItem.vue'

interface Props {
  group: IStatusBarGroup
}

const props = defineProps<Props>()

const groupStyle = computed(() => {
  const style: Record<string, string> = {}
  
  if (props.group.color) {
    style.color = props.group.color
  }
  
  if (props.group.backgroundColor) {
    style.backgroundColor = props.group.backgroundColor
  }
  
  return style
})

const handleCommand = (command: string, item: IStatusBarItem, args?: unknown[]) => {
  emit('command', command, item, args)
}

const emit = defineEmits<{
  command: [command: string, item: IStatusBarItem, args?: unknown[]]
}>()
</script>
