<template>
  <div class="sidebar-header bg-gray-50 flex-shrink-0 min-w-0">
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <span class="font-medium text-gray-900 text-sm truncate w-60 flex-shrink-0">{{ title }}</span>
    </div>
    <div class="flex items-center gap-1 flex-shrink-0">
      <!-- 返回模式：仅显示返回按钮 -->
      <button
        v-if="showBackButton"
        @click="$emit('back')"
        class="p-1 rounded hover:bg-gray-200 transition-colors"
        title="返回"
      >
        <IconArrowLeft class="w-4 h-4 text-gray-600" />
      </button>
      <!-- 正常模式：新对话 + 历史 + 设置 -->
      <template v-else>
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
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconArrowLeft, IconPlus, IconHistory, IconSettings } from '@tabler/icons-vue'

defineProps<{
  historyActive: boolean
  settingsActive: boolean
  title: string
  showBackButton?: boolean
}>()

defineEmits<{
  'new-thread': []
  'toggle-history': []
  'toggle-settings': []
  'back': []
}>()
</script>
