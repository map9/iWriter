<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div class="max-w-[90vw] overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl" :class="widthClass">
      <!-- 标题栏 + 关闭 ✕ -->
      <div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
        <h3 class="text-sm font-semibold">{{ title }}</h3>
        <button type="button" class="iw-toolbar-btn btn-xs" :aria-label="t('common.close')" @click="emit('close')">
          <IconX class="icon-xs" />
        </button>
      </div>
      <!-- 正文 -->
      <div class="px-4 py-4">
        <slot />
      </div>
      <!-- 页脚（调用方放按钮：取消/确认，或 关闭/添加…） -->
      <div class="flex items-center justify-end gap-2 border-t border-base-300 px-4 py-3">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { IconX } from '@tabler/icons-vue'

withDefaults(defineProps<{ visible: boolean; title: string; widthClass?: string }>(), { widthClass: 'w-80' })
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>
