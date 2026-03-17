<template>
  <div class="sidebar-header bg-gray-50 flex-shrink-0 min-w-0">
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <IconRobot class="w-5 h-5 text-primary-600 flex-shrink-0" />
      <span class="font-medium text-gray-900 text-sm truncate">AI 助手</span>
    </div>
    <div class="flex items-center gap-1 flex-shrink-0">
      <button @click="$emit('new-thread')" class="p-1 rounded hover:bg-gray-200 transition-colors" title="新对话">
        <IconPlus class="w-4 h-4 text-gray-600" />
      </button>
      <button
        @click="$emit('toggle-history')"
        class="p-1 rounded hover:bg-gray-200 transition-colors"
        :class="historyActive ? 'bg-gray-200' : ''"
        title="历史对话"
      >
        <IconHistory class="w-4 h-4 text-gray-600" />
      </button>
      <button
        @click="$emit('toggle-settings')"
        class="p-1 rounded hover:bg-gray-200 transition-colors"
        :class="settingsActive ? 'bg-gray-200' : ''"
        title="AI 设置"
      >
        <IconSettings class="w-4 h-4 text-gray-600" />
      </button>
      <button @click="$emit('close')" class="p-1 rounded hover:bg-gray-200 transition-colors" title="关闭">
        <IconX class="w-4 h-4 text-gray-600" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconRobot, IconPlus, IconHistory, IconSettings, IconX } from '@tabler/icons-vue'

defineProps<{
  historyActive: boolean
  settingsActive: boolean
}>()

defineEmits<{
  'new-thread': []
  'toggle-history': []
  'toggle-settings': []
  close: []
}>()
</script>
