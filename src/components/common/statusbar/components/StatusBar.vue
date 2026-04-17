<template>
  <div
    class="absolute inset-0 flex h-6 min-h-6 items-center justify-between bg-neutral px-2 text-xs font-medium text-neutral-content"
  >
    <!-- Left section -->
    <div class="flex items-center gap-2">
      <template v-for="item in leftItems" :key="item.id">
        <StatusBarGroup
          v-if="item.type === 'group'"
          :group="item as IStatusBarGroup"
          @command="handleCommand"
        />
        <StatusBarItem
          v-else
          :item="item as IStatusBarItem"
          @command="handleCommand"
        />
      </template>
    </div>

    <!-- Right section -->
    <div class="flex items-center gap-2">
      <template v-for="item in rightItems" :key="item.id">
        <StatusBarGroup
          v-if="item.type === 'group'"
          :group="item as IStatusBarGroup"
          @command="handleCommand"
        />
        <StatusBarItem
          v-else
          :item="item as IStatusBarItem"
          @command="handleCommand"
        />
      </template>
    </div>

  </div>
</template>

<script setup lang="ts">
import type { IBasicStatusBarItem, IStatusBarItem, IStatusBarGroup } from '../types'
import { StatusBarAlignment } from '../types'
import { useStatusBar } from '../composables/useStatusBar'
import StatusBarItem from './StatusBarItem.vue'
import StatusBarGroup from './StatusBarGroup.vue'

const statusBarManager = useStatusBar()

const leftItems = statusBarManager.getReactiveItemsByAlignment(StatusBarAlignment.Left)
const rightItems = statusBarManager.getReactiveItemsByAlignment(StatusBarAlignment.Right)

const handleCommand = (command: string, item: IBasicStatusBarItem, args?: unknown[]): void => {
  emit('command', command, item, args)
}

const emit = defineEmits<{
  command: [command: string, item: IBasicStatusBarItem, args?: unknown[]]
}>()

</script>

<style scoped>
</style>
