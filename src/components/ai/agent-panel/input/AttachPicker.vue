<template>
  <div class="relative flex-shrink-0" v-click-outside="() => showMenu = false">
    <button
      @click="showMenu = !showMenu"
      class="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-500"
      title="添加文件 / 文件夹"
    >
      <IconPaperclip class="w-4 h-4" />
    </button>
    <div
      v-if="showMenu"
      class="absolute bottom-full left-0 mb-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1"
    >
      <button @click="emit('browse-files'); showMenu = false" class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
        <IconFile class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />浏览文件…
      </button>
      <button @click="emit('browse-folder'); showMenu = false" class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
        <IconFolder class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />浏览文件夹…
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IconPaperclip, IconFile, IconFolder } from '@tabler/icons-vue'
import { vClickOutside } from '@/utils/directives'

const showMenu = ref(false)
const emit = defineEmits<{
  'browse-files': []
  'browse-folder': []
}>()
</script>
