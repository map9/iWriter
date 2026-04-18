<template>
  <!-- Agent Panel Header -->
  <div class="iw-sidebar-section border-b border-base-300">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <span class="iw-sidebar-section-header" :title="title">
        {{ title }}
      </span>
    </div>
    
    <!-- Actions -->
    <div class="flex shrink-0 items-center gap-1">
      <!-- 返回模式：仅显示返回按钮 -->
      <button
        v-if="showBackButton"
        @click="$emit('back')"
        class="iw-toolbar-btn btn-xs"
        title="Back"
      >
        <IconArrowLeft class="icon-xs" />
      </button>
      <!-- 正常模式：新对话 + 历史 + 设置 -->
      <template v-else>
        <button @click="$emit('new-thread')" class="iw-toolbar-btn btn-xs" title="New Thread">
          <IconPlus class="icon-xs" />
        </button>
        <button
          @click="$emit('toggle-history')"
          class="iw-toolbar-btn btn-xs"
          :class="historyActive ? 'iw-toolbar-btn-active' : ''"
          title="History"
        >
          <IconHistory class="icon-xs" />
        </button>
        <button
          @click="$emit('open-settings')"
          class="iw-toolbar-btn btn-xs"
          title="AI Settings"
        >
          <IconSettings class="icon-xs" />
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconArrowLeft, IconPlus, IconHistory, IconSettings } from '@tabler/icons-vue'

defineProps<{
  historyActive: boolean
  title: string
  showBackButton?: boolean
}>()

defineEmits<{
  'new-thread': []
  'toggle-history': []
  'open-settings': []
  'back': []
}>()
</script>
