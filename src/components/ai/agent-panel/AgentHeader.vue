<template>
  <!-- Agent Panel Header -->
  <div class="flex h-10 shrink-0 items-center justify-between bg-base-200 px-2 select-none border-b border-base-300">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <span class="text-sm font-semibold text-base-content uppercase whitespace-nowrap block w-full truncate" :title="title">
        {{ title }}
      </span>
    </div>
    
    <!-- Actions -->
    <div class="flex shrink-0 items-center gap-1">
      <!-- 返回模式：仅显示返回按钮 -->
      <button
        v-if="showBackButton"
        @click="$emit('back')"
        class="btn btn-ghost btn-square btn-xs"
        :title="t('agentPanel.header.back')"
      >
        <IconArrowLeft class="icon-xs" />
      </button>
      <!-- 正常模式：新对话 + 历史 + 设置 -->
      <template v-else>
        <button @click="$emit('new-thread')" class="btn btn-ghost btn-square btn-xs" :title="t('agentPanel.header.newThread')">
          <IconPlus class="icon-xs" />
        </button>
        <button
          @click="$emit('toggle-history')"
          class="btn btn-ghost btn-square btn-xs"
          :class="historyActive ? 'btn-active bg-primary text-primary-content' : ''"
          :title="t('agentPanel.header.history')"
        >
          <IconHistory class="icon-xs" />
        </button>
        <button
          @click="$emit('open-settings')"
          class="btn btn-ghost btn-square btn-xs"
          :title="t('agentPanel.header.aiSettings')"
        >
          <IconSettings class="icon-xs" />
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
</script>
