<template>
  <button
    ref="buttonRef"
    class="iw-toolbar-btn btn-sm w-auto gap-2 px-1"
    :title="t('titlebar.appMenu')"
    :aria-label="t('titlebar.appMenu')"
    @click="handleClick"
  >
    <img
      :src="appIconUrl"
      alt=""
      class="size-8 shrink-0 rounded-sm"
      draggable="false"
    >
    <IconChevronDown class="icon-2xs shrink-0 opacity-70" />
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronDown } from '@tabler/icons-vue'
import appIconUrl from '../../assets/icons/linux/48x48.png'

const { t } = useI18n()
const buttonRef = ref<HTMLButtonElement | null>(null)

async function handleClick() {
  const button = buttonRef.value
  if (!button || !window.electronAPI?.showAppMenu) return

  const rect = button.getBoundingClientRect()
  try {
    await window.electronAPI.showAppMenu({
      x: Math.round(rect.left),
      y: Math.round(rect.bottom),
    })
  } catch (error) {
    console.error('Error showing app menu:', error)
  }
}
</script>
