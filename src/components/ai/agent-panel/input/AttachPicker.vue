<template>
  <div ref="triggerEl" class="relative flex-shrink-0">
    <button
      @click="showMenu = !showMenu"
      class="p-1.5 rounded hover:bg-interactive-hover transition-colors text-text-secondary"
      title="添加文件 / 文件夹"
    >
      <IconPlus class="w-4 h-4" />
    </button>
    <Teleport to="body">
      <div
        v-if="showMenu"
        ref="menuEl"
        class="fixed w-40 bg-background-content border border-border-separator rounded-lg shadow-lg z-[1200] py-1"
        :style="menuStyle"
      >
        <button @click="emit('browse-files'); showMenu = false" class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-interactive-hover">
          <IconFile class="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />浏览文件…
        </button>
        <button @click="emit('browse-folder'); showMenu = false" class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-interactive-hover">
          <IconFolder class="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />浏览文件夹…
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
