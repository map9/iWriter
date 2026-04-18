<template>
  <div class="h-full flex flex-col">
    <!-- Tag Header -->
    <div class="iw-sidebar-section">
      <div class="flex items-center gap-2">
        <span class="iw-sidebar-section-header">
          Tags
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex shrink-0 items-center gap-1">
        <button
          class="iw-toolbar-btn btn-xs"
          title="Refresh Tags"
        >
          <IconRefresh class="icon-xs" />
        </button>
      </div>
    </div>

    <!-- Tag Search -->
    <div class="flex shrink-0 items-center border-b border-base-300 bg-base-200 p-2 select-none">
      <label class="iw-input">
        <IconSearch class="icon-xs text-base-content" />
        <input 
          v-model="searchQuery"
          type="text"
          class="grow"
          placeholder="Search Tags"
        />
      </label>
    </div>
    
    <!-- Tag Tree -->
    <div class="flex-1 overflow-auto">
      <div
        v-for="tag in filteredTags"
        :key="tag.name"
        class="border-b border-base-300/70"
      >
        <!-- Tag Header -->
        <div
          class="flex cursor-pointer items-center px-3 py-2 hover:bg-base-200"
          @click="toggleTag(tag.name)"
        >
          <button class="btn btn-ghost btn-xs mr-2 h-6 min-h-6 w-6 rounded-box p-0">
            <IconChevronDown
              v-if="expandedTags.has(tag.name)"
              class="h-5 w-5 text-base-content/50"
            />
            <IconChevronRight
              v-else
              class="h-5 w-5 text-base-content/50"
            />
          </button>
          <IconTag class="mr-2 h-5 w-5 text-primary" />
          <span class="flex-1 text-sm font-medium">{{ tag.name }}</span>
          <span class="badge badge-ghost badge-sm">{{ tag.files.length }}</span>
        </div>
        
        <!-- Tagged Files -->
        <div v-if="expandedTags.has(tag.name)" class="pl-8">
          <div
            v-for="file in tag.files"
            :key="file.path"
            class="flex cursor-pointer items-center px-3 py-1 text-sm hover:bg-base-200"
            @click="openFile(file.path)"
          >
            <IconFileText class="mr-2 h-5 w-5 text-base-content/50" />
            <span class="flex-1 truncate">{{ file.name }}</span>
          </div>
        </div>
      </div>
      
      <!-- Empty State -->
      <div v-if="tags.length === 0" class="p-4 text-center text-base-content/55">
        <IconTag :size="48" class="mx-auto mb-2 text-base-content/35" />
        <p class="text-sm">No tagged files found</p>
        <p class="mt-1 text-xs text-base-content/40">
          Add tags to your markdown files using #tag syntax
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconSearch,
  IconTag,
  IconFileText,
  IconChevronDown,
  IconChevronRight,
  IconRefresh
} from '@tabler/icons-vue'

const appStore = useAppStore()

const searchQuery = ref('')
const expandedTags = ref(new Set<string>())

// Mock tag data - in real implementation, this would be extracted from markdown files
const tags = ref([
  {
    name: 'project',
    files: [
      { name: 'README.md', path: '/path/to/README.md' },
      { name: 'setup.md', path: '/path/to/setup.md' }
    ]
  },
  {
    name: 'todo',
    files: [
      { name: 'tasks.md', path: '/path/to/tasks.md' }
    ]
  }
])

const filteredTags = computed(() => {
  if (!searchQuery.value) return tags.value
  
  const query = searchQuery.value.toLowerCase()
  return tags.value.filter(tag => 
    tag.name.toLowerCase().includes(query)
  )
})

function toggleTag(tagName: string) {
  if (expandedTags.value.has(tagName)) {
    expandedTags.value.delete(tagName)
  } else {
    expandedTags.value.add(tagName)
  }
}

function openFile(filePath: string) {
  appStore.openFile(filePath)
}
</script>
