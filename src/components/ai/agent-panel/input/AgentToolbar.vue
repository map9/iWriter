<template>
  <div class="flex items-center gap-1 px-2 pb-2 pt-1 min-w-0">

    <AttachPicker
      @browse-files="$emit('browse-files')"
      @browse-folder="$emit('browse-folder')"
    />

    <ProviderPicker
      :is-open="activeMenu === 'provider'"
      @open="openMenu('provider')"
      @close="closeMenu()"
    />

    <ModelPicker
      :is-open="activeMenu === 'model'"
      @open="openMenu('model')"
      @close="closeMenu()"
    />

    <ProfilePicker
      :is-open="activeMenu === 'profile'"
      @open="openMenu('profile')"
      @close="closeMenu()"
    />

    <div class="flex-1" />

    <button
      @click="$emit('clear-thread')"
      class="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-400 flex-shrink-0"
      title="清空对话"
    >
      <IconTrash class="w-3.5 h-3.5" />
    </button>

    <SendButton
      :is-pending-send="isPendingSend"
      :is-streaming="isStreaming"
      :can-send="canSend"
      @send="$emit('send')"
      @stop="$emit('stop')"
      @cancel-queued="$emit('cancel-queued')"
    />

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IconTrash } from '@tabler/icons-vue'
import AttachPicker from './AttachPicker.vue'
import ProviderPicker from './ProviderPicker.vue'
import ModelPicker from './ModelPicker.vue'
import ProfilePicker from './ProfilePicker.vue'
import SendButton from './SendButton.vue'

defineProps<{
  isPendingSend: boolean
  isStreaming: boolean
  canSend: boolean
}>()

defineEmits<{
  'browse-files': []
  'browse-folder': []
  send: []
  stop: []
  'cancel-queued': []
  'clear-thread': []
}>()

type MenuName = 'provider' | 'model' | 'profile'
const activeMenu = ref<MenuName | null>(null)

function openMenu(name: MenuName) {
  activeMenu.value = name
}

function closeMenu() {
  activeMenu.value = null
}
</script>
