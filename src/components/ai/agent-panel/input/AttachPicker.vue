<template>
  <div ref="triggerEl" class="relative shrink-0">
    <button
      @click="showMenu = !showMenu"
      class="iw-toolbar-btn btn-xs"
      title="Add Files / Folders"
    >
      <IconPlus class="icon-xs" />
    </button>
    <Teleport to="body">
      <div
        v-if="showMenu"
        ref="menuEl"
        class="fixed w-40 bg-base-100 border border-base-300 rounded-field shadow-sm z-1200 py-1.5 px-1.5"
        :style="menuStyle"
      >
        <button @click="emit('browse-files'); showMenu = false" class="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-field text-xs text-base-content hover:bg-base-300">
          <IconFile class="icon-xs shrink-0" />Browse Files...
        </button>
        <button @click="emit('browse-folder'); showMenu = false" class="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-field text-xs text-base-content hover:bg-base-300">
          <IconFolder class="icon-xs shrink-0" />Browse Folders...
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { IconPlus, IconFile, IconFolder } from '@tabler/icons-vue'

const showMenu = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuWidth = 160
const emit = defineEmits<{
  'browse-files': []
  'browse-folder': []
}>()

const menuStyle = computed(() => {
  if (!triggerEl.value) return {}
  const rect = triggerEl.value.getBoundingClientRect()
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
  const bottom = Math.max(8, window.innerHeight - rect.top + 4)
  return {
    left: `${left}px`,
    bottom: `${bottom}px`,
  }
})

function handlePointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (triggerEl.value?.contains(target)) return
  if (menuEl.value?.contains(target)) return
  showMenu.value = false
}

watch(showMenu, open => {
  if (open) {
    document.addEventListener('mousedown', handlePointerDown)
  } else {
    document.removeEventListener('mousedown', handlePointerDown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handlePointerDown)
})
</script>
